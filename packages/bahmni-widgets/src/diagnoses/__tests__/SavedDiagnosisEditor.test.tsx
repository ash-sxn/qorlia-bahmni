import {
  getDiagnosesPage,
  getSavedDiagnosis,
  updateSavedDiagnosis,
  removeSavedDiagnosis,
  dispatchConsultationSaved,
  useTranslation,
  useSubscribeConsultationSaved,
  type SavedDiagnosis,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import english from '../../../../../apps/clinical/public/locales/locale_en.json';
import { usePatientUUID } from '../../hooks/usePatientUUID';
import { useNotification } from '../../notification';
import { useHasPrivilege } from '../../userPrivileges/useHasPrivilege';
import { useUserPrivilege } from '../../userPrivileges/useUserPrivilege';
import DiagnosesTable from '../DiagnosesTable';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getDiagnosesPage: jest.fn(),
  getSavedDiagnosis: jest.fn(),
  updateSavedDiagnosis: jest.fn(),
  removeSavedDiagnosis: jest.fn(),
  dispatchConsultationSaved: jest.fn(),
  useTranslation: jest.fn(),
  useSubscribeConsultationSaved: jest.fn(),
}));
jest.mock('../../hooks/usePatientUUID');
jest.mock('../../userPrivileges/useHasPrivilege');
jest.mock('../../userPrivileges/useUserPrivilege');
jest.mock('../../notification');

const record: SavedDiagnosis = {
  uuid: 'saved-diagnosis',
  diagnosis: { nonCoded: 'QorliaQA diagnosis' },
  patient: { uuid: 'patient-123' },
  encounter: { uuid: 'original-encounter' },
  condition: null,
  certainty: 'PROVISIONAL',
  rank: 2,
  voided: false,
  display: 'native display',
  auditInfo: { dateCreated: '2026-10-05T10:00:00Z' },
};
const row = {
  id: record.uuid,
  display: 'QorliaQA diagnosis',
  certainty: { code: 'provisional' },
  recorder: 'QA',
  recordedDate: '2026-10-05T10:00:00Z',
};

function renderTable(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const element = (next: object) => (
    <QueryClientProvider client={client}>
      <DiagnosesTable {...next} />
    </QueryClientProvider>
  );
  const rendered = render(element(props));
  return {
    ...rendered,
    rerenderTable: (next: object) => rendered.rerender(element(next)),
  };
}

async function open(mode: 'edit' | 'remove' = 'edit') {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', {
      name: `${mode === 'edit' ? 'Edit' : 'Remove'} diagnosis: QorliaQA diagnosis`,
    }),
  );
  const dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(getSavedDiagnosis).toHaveBeenCalledWith('patient-123', record.uuid),
  );
  if (mode === 'edit') await screen.findByLabelText('Certainty');
  else await screen.findByLabelText('Reason for removal');
  return { user, dialog: within(dialog) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (usePatientUUID as jest.Mock).mockReturnValue('patient-123');
  (useHasPrivilege as jest.Mock).mockReturnValue(true);
  (useUserPrivilege as jest.Mock).mockReturnValue({
    userPrivileges: [{ name: 'Edit Diagnoses' }, { name: 'hospital edit' }],
  });
  (useTranslation as jest.Mock).mockReturnValue({
    t: (key: string) => (english as Record<string, string>)[key] ?? key,
  });
  (useNotification as jest.Mock).mockReturnValue({
    addNotification: jest.fn(),
  });
  (useSubscribeConsultationSaved as jest.Mock).mockImplementation(() => {});
  (getDiagnosesPage as jest.Mock).mockResolvedValue({
    diagnoses: [row],
    total: 1,
  });
  (getSavedDiagnosis as jest.Mock).mockResolvedValue(record);
  (updateSavedDiagnosis as jest.Mock).mockResolvedValue({
    ...record,
    certainty: 'CONFIRMED',
  });
  (removeSavedDiagnosis as jest.Mock).mockResolvedValue(undefined);
});

it('loads native rank and saves certainty without changing secondary order', async () => {
  renderTable();
  const { user, dialog } = await open();
  expect(screen.getByLabelText('Diagnosis order')).toHaveValue('2');
  expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Certainty'), 'CONFIRMED');
  await user.click(dialog.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(updateSavedDiagnosis).toHaveBeenCalledWith('patient-123', record, {
      certainty: 'CONFIRMED',
      rank: 2,
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(dispatchConsultationSaved).toHaveBeenCalledWith(
    expect.objectContaining({ patientUUID: 'patient-123' }),
  );
});

it('changes diagnosis order through the native service', async () => {
  renderTable();
  const { user, dialog } = await open();
  await user.selectOptions(screen.getByLabelText('Diagnosis order'), '1');
  await user.click(dialog.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(updateSavedDiagnosis).toHaveBeenCalledWith('patient-123', record, {
      certainty: 'PROVISIONAL',
      rank: 1,
    }),
  );
});

it('requires a removal reason and does not remove on Cancel', async () => {
  renderTable();
  const { user, dialog } = await open('remove');
  expect(
    dialog.getByRole('button', { name: /Remove diagnosis$/ }),
  ).toBeDisabled();
  await user.type(
    screen.getByLabelText('Reason for removal'),
    'Incorrect diagnosis',
  );
  await user.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect(removeSavedDiagnosis).not.toHaveBeenCalled();
  expect(dispatchConsultationSaved).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'Remove diagnosis: QorliaQA diagnosis',
      }),
    ).toHaveFocus(),
  );
});

it('removes only the selected native diagnosis with its reason', async () => {
  renderTable();
  const { user, dialog } = await open('remove');
  await user.type(
    screen.getByLabelText('Reason for removal'),
    'Incorrect diagnosis',
  );
  await user.click(dialog.getByRole('button', { name: /Remove diagnosis$/ }));
  await waitFor(() =>
    expect(removeSavedDiagnosis).toHaveBeenCalledWith(
      'patient-123',
      record,
      'Incorrect diagnosis',
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});

it('does not replay an unconfirmed write or emit a save event', async () => {
  (updateSavedDiagnosis as jest.Mock).mockRejectedValue(
    new Error('ambiguous acknowledgement'),
  );
  renderTable();
  const { user, dialog } = await open();
  await user.selectOptions(screen.getByLabelText('Certainty'), 'CONFIRMED');
  await user.click(dialog.getByRole('button', { name: 'Save changes' }));
  await screen.findByRole('alert');
  expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(updateSavedDiagnosis).toHaveBeenCalledTimes(1);
  expect(dispatchConsultationSaved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Certainty')).toHaveValue('CONFIRMED');
});

it.each(['permission', 'disabled'])(
  'rejects changed eligibility: %s',
  async (change) => {
    const rendered = renderTable();
    const { user } = await open();
    await user.selectOptions(screen.getByLabelText('Certainty'), 'CONFIRMED');
    if (change === 'permission')
      (useHasPrivilege as jest.Mock).mockReturnValue(false);
    rendered.rerenderTable({ disableActions: change === 'disabled' });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(updateSavedDiagnosis).not.toHaveBeenCalled();
    expect(removeSavedDiagnosis).not.toHaveBeenCalled();
  },
);

it('closes the editor when the current patient changes', async () => {
  const rendered = renderTable();
  const { user } = await open();
  await user.selectOptions(screen.getByLabelText('Certainty'), 'CONFIRMED');
  (usePatientUUID as jest.Mock).mockReturnValue('other-patient');
  rendered.rerenderTable({});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(updateSavedDiagnosis).not.toHaveBeenCalled();
  expect(removeSavedDiagnosis).not.toHaveBeenCalled();
  (usePatientUUID as jest.Mock).mockReturnValue('patient-123');
  rendered.rerenderTable({});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('does not expose removal when the hospital configures only editing', async () => {
  renderTable({ config: { actions: [{ type: 'edit', label: 'Edit' }] } });
  await screen.findByRole('button', { name: /Edit diagnosis:/ });
  expect(
    screen.queryByRole('button', { name: /Remove diagnosis:/ }),
  ).not.toBeInTheDocument();
});

it('checks each configured action privilege independently', async () => {
  renderTable({
    config: {
      actions: [
        { type: 'edit', label: 'Edit', requiredPrivilege: ['hospital edit'] },
        {
          type: 'remove',
          label: 'Remove',
          requiredPrivilege: ['hospital remove'],
        },
      ],
    },
  });
  await screen.findByRole('button', { name: /Edit diagnosis:/ });
  expect(
    screen.queryByRole('button', { name: /Remove diagnosis:/ }),
  ).not.toBeInTheDocument();
});

it.each([
  { actions: [] },
  { actions: [{ type: 'unrecognized', label: 'Unknown' }] },
])(
  'does not invent actions from explicit unsupported configuration: %j',
  async ({ actions }) => {
    renderTable({ config: { actions } });
    await screen.findByText('QorliaQA diagnosis');
    expect(
      screen.queryByRole('button', { name: /diagnosis:/ }),
    ).not.toBeInTheDocument();
  },
);

it('blocks an open removal when only its configured privilege is revoked', async () => {
  (useUserPrivilege as jest.Mock).mockReturnValue({
    userPrivileges: [
      { name: 'Edit Diagnoses' },
      { name: 'hospital edit' },
      { name: 'hospital remove' },
    ],
  });
  const props = {
    config: {
      actions: [
        { type: 'edit', label: 'Edit', requiredPrivilege: ['hospital edit'] },
        {
          type: 'remove',
          label: 'Remove',
          requiredPrivilege: ['hospital remove'],
        },
      ],
    },
  };
  const rendered = renderTable(props);
  const { user } = await open('remove');
  await user.type(
    screen.getByLabelText('Reason for removal'),
    'Incorrect diagnosis',
  );
  (useUserPrivilege as jest.Mock).mockReturnValue({
    userPrivileges: [{ name: 'Edit Diagnoses' }, { name: 'hospital edit' }],
  });
  rendered.rerenderTable(props);
  expect(
    screen.getByRole('button', { name: /Remove diagnosis$/ }),
  ).toBeDisabled();
  expect(removeSavedDiagnosis).not.toHaveBeenCalled();
});

it('hides actions without native Edit Diagnoses even when configured actions allow them', async () => {
  (useHasPrivilege as jest.Mock).mockImplementation(
    (privilege) => privilege !== 'Edit Diagnoses',
  );
  renderTable({
    config: {
      actions: [
        { type: 'edit', label: 'Edit', requiredPrivilege: ['Add Diagnoses'] },
      ],
    },
  });
  await screen.findByText('QorliaQA diagnosis');
  expect(
    screen.queryByRole('button', { name: /Edit diagnosis:/ }),
  ).not.toBeInTheDocument();
  expect(getSavedDiagnosis).not.toHaveBeenCalled();
});

it('retains explicit hospital action restrictions', async () => {
  (useHasPrivilege as jest.Mock).mockImplementation(
    (privilege) => privilege === 'Edit Diagnoses',
  );
  renderTable({
    config: {
      actions: [
        {
          type: 'edit',
          label: 'Edit',
          requiredPrivilege: ['custom hospital permission'],
        },
      ],
    },
  });
  await screen.findByText('QorliaQA diagnosis');
  expect(
    screen.queryByRole('button', { name: /Edit diagnosis:/ }),
  ).not.toBeInTheDocument();
});

it('blocks an unavailable native record rather than using FHIR row data', async () => {
  (getSavedDiagnosis as jest.Mock).mockRejectedValue(
    new Error('native resource unavailable'),
  );
  renderTable();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', {
      name: 'Edit diagnosis: QorliaQA diagnosis',
    }),
  );
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  expect(screen.queryByLabelText('Certainty')).not.toBeInTheDocument();
});
