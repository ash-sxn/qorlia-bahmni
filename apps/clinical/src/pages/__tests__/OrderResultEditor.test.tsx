import {
  formatDateTime,
  getDocumentUploadMaxSizeMb,
  uploadDocument,
} from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderResultEditor, { OrderResultValues } from '../OrderResultEditor';
import {
  saveFulfillment,
  makeFulfillmentObservation,
  fulfillmentPayload,
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
  resultForm: FulfillmentConcept = form,
  uiConfig: Record<string, Record<string, unknown>> = {},
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (next: FulfillmentEncounter) => (
    <QueryClientProvider client={client}>
      <OrderResultEditor
        patientUuid="patient"
        order={{ orderUuid: 'order', concept: { name: 'Chest X-ray' } }}
        form={resultForm}
        snapshot={next}
        locationUuid="location"
        providerUuid="provider"
        uiConfig={uiConfig}
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

const confirmSave = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirm save' }),
  );
};

it('requires confirmation and keeps the draft when confirmation is cancelled', async () => {
  renderEditor();
  fireEvent.change(screen.getByLabelText('Radiology Notes'), {
    target: { value: 'QorliaQA synthetic result' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save result' }));
  expect(await screen.findByRole('dialog')).toHaveAccessibleName(
    'Save results for Chest X-ray?',
  );
  expect(saveFulfillment).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText('Radiology Notes')).toHaveValue(
    'QorliaQA synthetic result',
  );
  expect(screen.getByLabelText('Radiology Notes')).toBeEnabled();
  expect(saveFulfillment).not.toHaveBeenCalled();
});

it('keeps the result draft when saving fails', async () => {
  jest
    .mocked(saveFulfillment)
    .mockRejectedValueOnce(new Error('Another user changed the result'));
  renderEditor();
  fireEvent.change(screen.getByLabelText('Radiology Notes'), {
    target: { value: 'Normal' },
  });
  await confirmSave();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Another user changed',
  );
  expect(screen.getByLabelText('Radiology Notes')).toHaveValue('Normal');
  expect(onSaved).not.toHaveBeenCalled();
});

it('does not repeat a successful save when the read-back fails', async () => {
  jest.mocked(saveFulfillment).mockResolvedValueOnce({});
  onSaved.mockRejectedValueOnce(new Error('Read-back is unavailable'));
  renderEditor();
  fireEvent.change(screen.getByLabelText('Radiology Notes'), {
    target: { value: 'QorliaQA synthetic result' },
  });
  await confirmSave();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Read-back is unavailable',
  );
  expect(screen.getByRole('status')).toHaveTextContent('Result saved.');
  expect(screen.getByRole('button', { name: 'Save result' })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Edit saved result' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }));
  expect(saveFulfillment).toHaveBeenCalledTimes(1);
});

it('blocks confirmation when the write privilege is lost with a draft open', async () => {
  const { refresh } = renderEditor();
  fireEvent.change(screen.getByLabelText('Radiology Notes'), {
    target: { value: 'QorliaQA synthetic result' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }));
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [],
    isLoading: false,
  });
  refresh({ observations: [] });
  expect(screen.getByRole('button', { name: 'Confirm save' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
  expect(saveFulfillment).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Radiology Notes')).toHaveValue(
    'QorliaQA synthetic result',
  );
  expect(screen.getByLabelText('Radiology Notes')).toBeDisabled();
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
  await confirmSave();
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
  await confirmSave();
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

const numericCodedForm: FulfillmentConcept = {
  ...form,
  setMembers: [
    {
      uuid: 'measurement',
      name: { name: 'Measurement' },
      datatype: { name: 'Numeric' },
      set: false,
      setMembers: [],
      units: 'mm',
      allowDecimal: false,
      lowAbsolute: 0,
      hiAbsolute: 100,
      lowNormal: 10,
      hiNormal: 20,
    },
    {
      uuid: 'finding',
      name: { name: 'Finding' },
      datatype: { name: 'Coded' },
      set: false,
      setMembers: [],
      answers: [
        {
          uuid: 'negative',
          name: { name: 'No abnormality detected' },
          names: [{ name: 'Negative', conceptNameType: 'SHORT' }],
        },
      ],
    },
  ],
};

it('uses numeric metadata, accepts zero and saves a coded answer with its notes', async () => {
  jest.mocked(saveFulfillment).mockResolvedValueOnce({});
  onSaved.mockResolvedValueOnce({ observations: [] });
  renderEditor({ observations: [] }, numericCodedForm);
  const measurement = screen.getByRole('spinbutton', { name: 'Measurement' });
  expect(measurement).toHaveAttribute('min', '0');
  expect(measurement).toHaveAttribute('max', '100');
  expect(measurement).toHaveAttribute('step', '1');
  fireEvent.change(measurement, { target: { value: '0' } });
  expect(measurement).toHaveValue(0);
  expect(measurement).toBeValid();
  expect(
    screen.getByText('Outside the reference range: 10 to 20 mm.'),
  ).toBeInTheDocument();
  const answer = screen.getByRole('button', { name: 'Negative' });
  await userEvent.click(answer);
  expect(answer).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(answer);
  expect(answer).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(answer);
  fireEvent.change(screen.getByLabelText('Notes for Finding'), {
    target: { value: 'QorliaQA synthetic coded-result note' },
  });
  await confirmSave();
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(saveFulfillment).toHaveBeenCalledWith(
    'patient',
    'location',
    'provider',
    'order',
    { observations: [] },
    expect.objectContaining({
      groupMembers: [
        expect.objectContaining({ value: 0 }),
        expect.objectContaining({
          value: {
            uuid: 'negative',
            name: 'No abnormality detected',
            shortName: 'Negative',
          },
          comment: 'QorliaQA synthetic coded-result note',
        }),
      ],
    }),
  );
});

it('validates configured required coded fields before opening confirmation', async () => {
  renderEditor({ observations: [] }, numericCodedForm, {
    Finding: { required: true, disableAddNotes: true },
  });
  expect(screen.queryByLabelText('Notes for Finding')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Measurement' }), {
    target: { value: '12' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Finding is required.',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(saveFulfillment).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Negative' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

it('keeps unimplemented concept-set rules read-only instead of dropping them', async () => {
  renderEditor({ observations: [] }, numericCodedForm, {
    Finding: { multiSelect: true, autocomplete: true },
  });
  expect(screen.getByRole('alert')).toHaveTextContent('still being migrated');
  expect(
    screen.queryByRole('button', { name: 'Save result' }),
  ).not.toBeInTheDocument();
  expect(saveFulfillment).not.toHaveBeenCalled();
});

const multiForm: FulfillmentConcept = {
  ...numericCodedForm,
  setMembers: [
    numericCodedForm.setMembers[0],
    {
      ...numericCodedForm.setMembers[1],
      answers: [
        ...numericCodedForm.setMembers[1].answers!,
        {
          uuid: 'positive',
          name: { name: 'Synthetic positive' },
          names: [{ name: 'Positive', conceptNameType: 'SHORT' }],
        },
      ],
    },
  ],
};

it('toggles multiple coded answers in one control and saves each selected answer without losing other fields', async () => {
  jest.mocked(saveFulfillment).mockResolvedValueOnce({});
  onSaved.mockResolvedValueOnce({ observations: [] });
  renderEditor({ observations: [] }, multiForm, {
    Finding: { multiSelect: true, required: true },
  });
  expect(screen.queryByLabelText('Notes for Finding')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Measurement' }), {
    target: { value: '0' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Finding is required.',
  );
  expect(saveFulfillment).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Negative' }));
  await userEvent.click(screen.getByRole('button', { name: 'Positive' }));
  expect(screen.getAllByRole('group', { name: 'Finding' })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Negative' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Positive' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Negative' }));
  expect(screen.getByRole('button', { name: 'Negative' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByRole('button', { name: 'Positive' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Negative' }));
  await confirmSave();
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const payload = fulfillmentPayload(
    jest.mocked(saveFulfillment).mock.calls[0][5],
    'order',
  )!;
  expect(payload.groupMembers).toHaveLength(3);
  expect(payload.groupMembers[0]).toMatchObject({
    value: 0,
    orderUuid: 'order',
  });
  expect(payload.groupMembers.slice(1)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        value: expect.objectContaining({ uuid: 'positive' }),
        orderUuid: 'order',
      }),
      expect.objectContaining({
        value: expect.objectContaining({ uuid: 'negative' }),
        orderUuid: 'order',
      }),
    ]),
  );
});

it('retains saved multi-select IDs and comments through deselection, restoration and a failed save', async () => {
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [
      'Add Encounters',
      'Add Observations',
      'Edit Observations',
    ].map((name) => ({ name, uuid: name })),
    isLoading: false,
  });
  const original = makeFulfillmentObservation(multiForm);
  original.uuid = 'root';
  original.orderUuid = 'order';
  original.groupMembers[0].value = 12;
  original.groupMembers[1] = {
    ...original.groupMembers[1],
    uuid: 'saved-negative',
    value: { uuid: 'negative' },
    comment: 'Existing note',
  };
  original.groupMembers.push({
    ...original.groupMembers[1],
    uuid: 'saved-positive',
    value: { uuid: 'positive' },
    comment: 'Other note',
  });
  const snapshot = { encounterUuid: 'enc', observations: [original] };
  renderEditor(snapshot, multiForm, { Finding: { multiSelect: true } });
  expect(screen.getAllByRole('group', { name: 'Finding' })).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Negative' }));
  await userEvent.click(screen.getByRole('button', { name: 'Negative' }));
  await userEvent.click(screen.getByRole('button', { name: 'Positive' }));
  jest
    .mocked(saveFulfillment)
    .mockRejectedValueOnce(new Error('Synthetic failure'));
  await confirmSave();
  await screen.findByRole('alert');
  const draft = jest.mocked(saveFulfillment).mock.calls[0][5];
  expect(draft.groupMembers).toHaveLength(3);
  expect(draft.groupMembers).toEqual([
    expect.objectContaining({ value: 12 }),
    expect.objectContaining({
      uuid: 'saved-negative',
      value: { uuid: 'negative' },
      comment: 'Existing note',
      voided: false,
    }),
    expect.objectContaining({
      uuid: 'saved-positive',
      value: { uuid: 'positive' },
      comment: 'Other note',
      voided: true,
    }),
  ]);
  expect(original.groupMembers[2].voided).toBeUndefined();
  expect(screen.getByRole('button', { name: 'Negative' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Positive' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByRole('spinbutton', { name: 'Measurement' })).toHaveValue(
    12,
  );
});

it('keeps a root multi-select read-only because the editor saves one concept-set root', () => {
  renderEditor({ observations: [] }, multiForm.setMembers[1], {
    Finding: { multiSelect: true },
  });
  expect(screen.getByRole('alert')).toHaveTextContent('read-only');
  expect(
    screen.queryByRole('button', { name: 'Save result' }),
  ).not.toBeInTheDocument();
  expect(saveFulfillment).not.toHaveBeenCalled();
});

it('does not enable multi-select answers for a role without result-write privileges', async () => {
  jest
    .mocked(useUserPrivilege)
    .mockReturnValue({ userPrivileges: [], isLoading: false });
  renderEditor({ observations: [] }, multiForm, {
    Finding: { multiSelect: true },
  });
  expect(screen.getByRole('button', { name: 'Negative' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Positive' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Negative' }));
  expect(screen.getByRole('button', { name: 'Negative' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(saveFulfillment).not.toHaveBeenCalled();
});

it('shows readable saved coded results, zero values and notes', () => {
  render(
    <OrderResultValues
      observations={[
        {
          concept: { uuid: 'finding', name: 'Finding', dataType: 'Coded' },
          value: {
            uuid: 'negative',
            name: 'No abnormality detected',
            shortName: 'Negative',
          },
          groupMembers: [],
          comment: 'Synthetic note',
        },
        {
          concept: {
            uuid: 'measurement',
            name: 'Measurement',
            dataType: 'Numeric',
          },
          value: 0,
          groupMembers: [],
        },
      ]}
    />,
  );
  expect(screen.getByText('Negative')).toBeInTheDocument();
  expect(screen.getByText('Synthetic note')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
});

const datedForm: FulfillmentConcept = {
  ...form,
  setMembers: [
    {
      uuid: 'date',
      name: { name: 'Procedure date' },
      datatype: { name: 'Date' },
      set: false,
      setMembers: [],
    },
    {
      uuid: 'time',
      name: { name: 'Procedure time' },
      datatype: { name: 'Datetime' },
      set: false,
      setMembers: [],
    },
    {
      uuid: 'performed',
      name: { name: 'Performed' },
      datatype: { name: 'Boolean' },
      set: false,
      setMembers: [],
    },
  ],
};

it('renders native local date/time controls and preserves a No answer with its notes', async () => {
  jest.mocked(saveFulfillment).mockResolvedValueOnce({});
  onSaved.mockResolvedValueOnce({ observations: [] });
  renderEditor({ observations: [] }, datedForm);
  const date = screen.getByLabelText('Procedure date');
  const time = screen.getByLabelText('Procedure time');
  expect(date).toHaveAttribute('type', 'date');
  expect(date).toHaveAttribute('min', '0001-01-01');
  expect(time).toHaveAttribute('type', 'datetime-local');
  expect(time).toHaveAttribute('step', '60');
  expect(date).toHaveAttribute('max');
  fireEvent.change(date, { target: { value: '2026-10-03' } });
  fireEvent.change(time, { target: { value: '2026-10-03T13:25' } });
  expect(time).toHaveValue('2026-10-03T13:25');
  const no = screen.getByRole('button', { name: 'No', exact: true });
  await userEvent.click(no);
  expect(no).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(no);
  expect(no).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(no);
  const notes = screen.getByLabelText('Notes for Performed');
  expect(notes).toHaveAttribute('maxlength', '255');
  fireEvent.change(notes, {
    target: { value: 'QorliaQA synthetic Boolean note' },
  });
  await confirmSave();
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(saveFulfillment).toHaveBeenCalledWith(
    'patient',
    'location',
    'provider',
    'order',
    { observations: [] },
    expect.objectContaining({
      groupMembers: [
        expect.objectContaining({ value: '2026-10-03' }),
        expect.objectContaining({ value: '2026-10-03T13:25' }),
        expect.objectContaining({
          value: false,
          comment: 'QorliaQA synthetic Boolean note',
        }),
      ],
    }),
  );
});

it('blocks future dates even if native form validation is bypassed, but honors explicit permission', async () => {
  renderEditor({ observations: [] }, datedForm, {
    'Procedure time': { allowFutureDates: true, disableAddNotes: true },
  });
  expect(
    screen.queryByLabelText('Notes for Procedure time'),
  ).not.toBeInTheDocument();
  const date = screen.getByLabelText('Procedure date');
  fireEvent.change(date, { target: { value: '2999-10-04' } });
  expect(date).toBeInvalid();
  fireEvent.submit(date.closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Procedure date cannot be in the future.',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(saveFulfillment).not.toHaveBeenCalled();
  fireEvent.change(date, { target: { value: '2026-10-03' } });
  const time = screen.getByLabelText('Procedure time');
  fireEvent.change(time, { target: { value: '2999-10-04T13:25' } });
  expect(time).toBeValid();
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

it('loads persisted timestamps in local time without shifting them or dropping cleared values', async () => {
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [
      'Add Encounters',
      'Add Observations',
      'Edit Observations',
    ].map((name) => ({ name, uuid: name })),
    isLoading: false,
  });
  const original = makeFulfillmentObservation(datedForm);
  original.uuid = 'saved-root';
  original.orderUuid = 'order';
  const value = '2026-10-03T13:25:17+05:30';
  original.groupMembers[0] = {
    ...original.groupMembers[0],
    uuid: 'saved-date',
    value: '2026-10-02T18:30:00Z',
  };
  original.groupMembers[1] = {
    ...original.groupMembers[1],
    uuid: 'saved-time',
    value,
  };
  const snapshot = { encounterUuid: 'encounter', observations: [original] };
  renderEditor(snapshot, datedForm);
  const parsed = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  expect(screen.getByLabelText('Procedure time')).toHaveValue(
    `2026-10-03T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  );
  fireEvent.change(screen.getByLabelText('Procedure date'), {
    target: { value: '' },
  });
  jest
    .mocked(saveFulfillment)
    .mockRejectedValueOnce(new Error('Synthetic failure'));
  await confirmSave();
  await screen.findByRole('alert');
  expect(saveFulfillment).toHaveBeenCalledWith(
    'patient',
    'location',
    'provider',
    'order',
    snapshot,
    expect.objectContaining({
      groupMembers: expect.arrayContaining([
        expect.objectContaining({ uuid: 'saved-date', value: undefined }),
        expect.objectContaining({ uuid: 'saved-time', value }),
      ]),
    }),
  );
});

it('displays saved Boolean and date-time results in human-readable form', () => {
  render(
    <OrderResultValues
      observations={[
        {
          concept: { uuid: 'no', name: 'Performed', dataType: 'Boolean' },
          value: false,
          groupMembers: [],
        },
        {
          concept: { uuid: 'date', name: 'Procedure date', dataType: 'Date' },
          value: '2026-10-03',
          groupMembers: [],
        },
      ]}
    />,
  );
  expect(screen.getByText('No')).toBeInTheDocument();
  expect(screen.queryByText('false')).not.toBeInTheDocument();
  expect(
    screen.getByText(formatDateTime('2026-10-03').formattedResult),
  ).toBeInTheDocument();
});
