import { post } from '@bahmni/services';
import { useActivePractitioner } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDoseSlots, getScheduledOrderUuids } from '../doseService';
import { MedicineRound } from '../MedicineRound';

jest.mock('@bahmni/widgets', () => ({ useActivePractitioner: jest.fn() }));
jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  post: jest.fn().mockResolvedValue([]),
}));
jest.mock('../doseService', () => ({
  ...jest.requireActual('../doseService'),
  getDoseSlots: jest.fn(),
  getScheduledOrderUuids: jest.fn(),
}));

const minutesFromNow = (minutes: number) => Date.now() + minutes * 60_000;
const slot = (
  uuid: string,
  minutes: number,
  status = 'SCHEDULED',
  extra = {},
) => ({
  uuid,
  orderUuid: `order-${uuid}`,
  patientUuid: 'p1',
  time: minutesFromNow(minutes),
  medicine: `Medicine ${uuid}`,
  how: '1 Tablet · Oral',
  status,
  recordedBy: '',
  recordedAt: null,
  reason: '',
  ...extra,
});

const bed = {
  bedId: 1,
  bedNumber: 'GW1-01',
  room: 'Room 1',
  patientUuid: 'p1',
  name: 'Meera Sharma',
  identifier: 'ABC1',
  age: 34,
  gender: 'F',
};
const medicine = (uuid: string, extra = {}) => ({
  uuid,
  name: `Order ${uuid}`,
  dose: '1 Tablet',
  frequency: 'Twice a day',
  route: 'Oral',
  careSetting: 'INPATIENT',
  asNeeded: false,
  durationDays: 3,
  ...extra,
});

const renderRound = (medicines = [medicine('order-a')]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MedicineRound beds={[bed]} medicines={[medicines]} />
    </QueryClientProvider>,
  );

describe('MedicineRound', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useActivePractitioner as jest.Mock).mockReturnValue({
      practitioner: { uuid: 'prov-1' },
    });
    (getDoseSlots as jest.Mock).mockResolvedValue([
      slot('a', 20),
      slot('b', -90),
      slot('c', 300),
      slot('d', -300, 'COMPLETED', {
        recordedBy: 'Kavita Rawat',
        recordedAt: minutesFromNow(-290),
      }),
    ]);
    (getScheduledOrderUuids as jest.Mock).mockResolvedValue(
      new Set(['order-a']),
    );
  });

  it('lists overdue then due doses, and keeps later and recorded ones apart', async () => {
    renderRound();
    const due = await screen.findByRole('region', {
      name: 'Due now and overdue',
    });
    const rows = await within(due).findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Medicine b'),
      expect.stringContaining('Medicine a'),
    ]);
    expect(within(rows[0]).getByText('Overdue')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Due')).toBeInTheDocument();
    const recorded = screen.getByRole('region', { name: 'Recorded today' });
    expect(within(recorded).getByText(/By Kavita Rawat/)).toBeInTheDocument();
    expect(
      within(recorded).getByText('1 more dose later today'),
    ).toBeInTheDocument();
  });

  it("records a dose as given in the nurse's name", async () => {
    renderRound();
    const due = await screen.findByRole('region', {
      name: 'Due now and overdue',
    });
    const row = (await within(due).findAllByRole('listitem'))[1];
    await userEvent.click(within(row).getByRole('button', { name: 'Given' }));
    const [url, [body]] = (post as jest.Mock).mock.calls[0];
    expect(url).toContain('/ipd/scheduledMedicationAdministrations');
    expect(body).toMatchObject({ slotUuid: 'a', status: 'completed' });
    expect(body.providers[0].providerUuid).toBe('prov-1');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved: Medicine a given.',
    );
  });

  it('asks why before saving a dose as not given', async () => {
    renderRound();
    const due = await screen.findByRole('region', {
      name: 'Due now and overdue',
    });
    const row = (await within(due).findAllByRole('listitem'))[0];
    await userEvent.click(
      within(row).getByRole('button', { name: 'Not given' }),
    );
    await userEvent.selectOptions(
      within(row).getByLabelText('Why not given'),
      'NIL_BY_MOUTH',
    );
    await userEvent.click(
      within(row).getByRole('button', { name: 'Save as not given' }),
    );
    const [, [body]] = (post as jest.Mock).mock.calls[0];
    expect(body).toMatchObject({
      slotUuid: 'b',
      status: 'not-done',
      statusReason: 'Nil by mouth',
    });
  });

  it('offers usual times for inpatient orders that have none, and schedules them', async () => {
    renderRound([
      medicine('order-a'),
      medicine('order-new', { name: 'Ceftriaxone 1 g' }),
      medicine('order-home', { careSetting: 'OUTPATIENT' }),
      medicine('order-sos', { asNeeded: true }),
    ]);
    const section = await screen.findByRole('region', {
      name: 'New orders without times',
    });
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Ceftriaxone 1 g');
    expect(rows[0]).toHaveTextContent('Suggested: 08:00, 20:00');
    await userEvent.click(
      within(rows[0]).getByRole('button', { name: 'Use these times' }),
    );
    const [url, body] = (post as jest.Mock).mock.calls[0];
    expect(url).toContain('/ipd/schedule/type/medication');
    expect(body).toMatchObject({
      orderUuid: 'order-new',
      patientUuid: 'p1',
      providerUuid: 'prov-1',
    });
  });
});
