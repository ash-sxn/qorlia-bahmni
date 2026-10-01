import { getDocumentUploadMaxSizeMb, uploadDocument } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrderResultEditor from '../OrderResultEditor';
import {
  saveFulfillment,
  type FulfillmentConcept,
  type FulfillmentEncounter,
} from '../ordersApi';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getDocumentUploadMaxSizeMb: jest.fn(),
  uploadDocument: jest.fn(),
}));
jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useUserPrivilege: jest.fn(),
}));
jest.mock('../ordersApi', () => ({
  ...jest.requireActual('../ordersApi'),
  saveFulfillment: jest.fn(),
}));
const form: FulfillmentConcept = {
  uuid: 'form',
  name: { name: 'Summary' },
  datatype: { name: 'N/A' },
  set: true,
  setMembers: [
    {
      uuid: 'notes',
      name: { name: 'Radiology Notes' },
      datatype: { name: 'Text' },
      set: false,
      setMembers: [],
    },
    {
      uuid: 'image',
      name: { name: 'Diagnostic Images' },
      datatype: { name: 'Complex' },
      handler: 'ImageUrlHandler',
      set: false,
      setMembers: [],
    },
  ],
};
const onSaved = jest.fn();
const renderEditor = (
  snapshot: FulfillmentEncounter = { observations: [] },
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (next: FulfillmentEncounter) => (
    <QueryClientProvider client={client}>
      <OrderResultEditor
        patientUuid="patient"
        order={{ orderUuid: 'order', concept: { name: 'Chest X-ray' } }}
        form={form}
        snapshot={next}
        locationUuid="location"
        providerUuid="provider"
        uiConfig={{}}
        onSaved={onSaved}
      />
    </QueryClientProvider>
  );
  const result = render(view(snapshot));
  return {
    ...result,
    refresh: (next: FulfillmentEncounter) => result.rerender(view(next)),
  };
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: ['Add Encounters', 'Add Observations'].map((name) => ({
      name,
      uuid: name,
    })),
    isLoading: false,
  });
  jest.mocked(getDocumentUploadMaxSizeMb).mockResolvedValue(2);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

it('keeps the result draft when saving fails', async () => {
  jest
    .mocked(saveFulfillment)
    .mockRejectedValueOnce(new Error('Another user changed the result'));
  renderEditor();
  fireEvent.change(screen.getByLabelText('Radiology Notes'), {
    target: { value: 'Normal' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save result' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Another user changed',
  );
  expect(screen.getByLabelText('Radiology Notes')).toHaveValue('Normal');
  expect(onSaved).not.toHaveBeenCalled();
});

it('uploads an order attachment without changing its encounter type and includes it in the saved draft', async () => {
  jest
    .mocked(uploadDocument)
    .mockResolvedValueOnce({ url: 'patient/image.png' });
  jest.mocked(saveFulfillment).mockResolvedValueOnce({});
  onSaved.mockResolvedValueOnce({ observations: [] });
  renderEditor();
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  await waitFor(() =>
    expect(screen.getByLabelText('Add Diagnostic Images')).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText('Add Diagnostic Images'), {
    target: { files: [file] },
  });
  await screen.findByRole('link', { name: 'Open Diagnostic Images' });
  expect(uploadDocument).toHaveBeenCalledWith(file, undefined, 'patient');
  fireEvent.click(screen.getByRole('button', { name: 'Save result' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(saveFulfillment).toHaveBeenCalledWith(
    'patient',
    'location',
    'provider',
    'order',
    { observations: [] },
    expect.objectContaining({
      groupMembers: expect.arrayContaining([
        expect.objectContaining({
          concept: expect.objectContaining({ uuid: 'image' }),
          value: 'patient/image.png',
        }),
      ]),
    }),
  );
});

it('keeps its draft and original snapshot when another order refreshes the page', async () => {
  const original = { encounterUuid: 'original', observations: [] };
  const { refresh } = renderEditor(original);
  fireEvent.change(screen.getByLabelText('Radiology Notes'), {
    target: { value: 'Unsaved result' },
  });
  refresh({ encounterUuid: 'refreshed', observations: [] });
  expect(screen.getByLabelText('Radiology Notes')).toHaveValue(
    'Unsaved result',
  );
  jest.mocked(saveFulfillment).mockRejectedValueOnce(new Error('changed'));
  fireEvent.click(screen.getByRole('button', { name: 'Save result' }));
  await screen.findByRole('alert');
  expect(saveFulfillment).toHaveBeenCalledWith(
    'patient',
    'location',
    'provider',
    'order',
    original,
    expect.objectContaining({
      groupMembers: expect.arrayContaining([
        expect.objectContaining({ value: 'Unsaved result' }),
      ]),
    }),
  );
});

it('does not expose a write path to a read-only role', async () => {
  jest
    .mocked(useUserPrivilege)
    .mockReturnValue({ userPrivileges: [], isLoading: false });
  renderEditor();
  await waitFor(() => expect(getDocumentUploadMaxSizeMb).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Save result' })).toBeDisabled();
  expect(screen.getByLabelText('Radiology Notes')).toBeDisabled();
});
