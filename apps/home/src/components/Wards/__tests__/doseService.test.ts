import { get, post } from '@bahmni/services';
import {
  buildSchedule,
  getScheduledOrderUuids,
  doseState,
  getDoseSlots,
  recordDose,
  suggestedHours,
  toDoseSlot,
} from '../doseService';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  post: jest.fn(),
}));

const at = (hours: number, minutes = 0) => {
  const date = new Date(2026, 10, 21, hours, minutes, 0, 0);
  return date;
};
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

const ipdSlot = (status: string, time: Date, extra = {}) => ({
  uuid: `slot-${seconds(time)}`,
  status,
  startTime: seconds(time),
  order: {
    uuid: 'order-1',
    drug: { display: 'Paracetamol 650 mg' },
    dose: 1,
    doseUnits: { display: 'Tablet' },
    route: { display: 'Oral' },
  },
  ...extra,
});

describe('doseService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads slots in seconds and orders them by time', async () => {
    (get as jest.Mock).mockResolvedValue([
      { slots: [ipdSlot('SCHEDULED', at(14)), ipdSlot('COMPLETED', at(8))] },
    ]);
    const slots = await getDoseSlots('p1', at(0), at(23, 59));
    expect((get as jest.Mock).mock.calls[0][0]).toContain(
      `startTime=${seconds(at(0))}`,
    );
    expect(slots.map((slot) => slot.time)).toEqual([
      at(8).getTime(),
      at(14).getTime(),
    ]);
    expect(slots[0]).toMatchObject({
      medicine: 'Paracetamol 650 mg',
      how: '1 Tablet · Oral',
      patientUuid: 'p1',
    });
  });

  it('keeps who recorded a dose and why it was not given', () => {
    const slot = toDoseSlot(
      ipdSlot('NOT_DONE', at(8), {
        medicationAdministration: {
          status: 'not-done',
          administeredDateTime: seconds(at(8, 5)),
          providers: [{ provider: { display: 'NURSE_KAVITA - Kavita Rawat' } }],
          notes: [{ text: 'Patient refused' }],
        },
      }),
      'p1',
    );
    expect(slot).toMatchObject({
      recordedBy: 'Kavita Rawat',
      recordedAt: at(8, 5).getTime(),
      reason: 'Patient refused',
    });
  });

  it('calls a dose due within the hour and overdue an hour after', () => {
    const slot = toDoseSlot(ipdSlot('SCHEDULED', at(14)), 'p1');
    expect(doseState(slot, at(12, 30))).toBe('later');
    expect(doseState(slot, at(13, 30))).toBe('due');
    expect(doseState(slot, at(14, 50))).toBe('due');
    expect(doseState(slot, at(15, 10))).toBe('overdue');
    expect(doseState({ ...slot, status: 'COMPLETED' }, at(15))).toBe('given');
    expect(doseState({ ...slot, status: 'NOT_DONE' }, at(15))).toBe(
      'not-given',
    );
  });

  it('records a dose as given, or not given with the reason as a note', async () => {
    const slot = toDoseSlot(ipdSlot('SCHEDULED', at(14)), 'p1');
    await recordDose(slot, 'prov-1', { given: true }, at(14, 2));
    await recordDose(
      slot,
      'prov-1',
      { given: false, reason: 'Nil by mouth' },
      at(14, 3),
    );
    const [given] = (post as jest.Mock).mock.calls[0][1];
    const [skipped] = (post as jest.Mock).mock.calls[1][1];
    expect((post as jest.Mock).mock.calls[0][0]).toBe(
      '/openmrs/ws/rest/v1/ipd/scheduledMedicationAdministrations',
    );
    expect(given).toMatchObject({
      patientUuid: 'p1',
      orderUuid: 'order-1',
      slotUuid: slot.uuid,
      status: 'completed',
      administeredDateTime: seconds(at(14, 2)),
      providers: [{ providerUuid: 'prov-1', function: 'performer' }],
      notes: [],
    });
    expect(skipped).toMatchObject({
      status: 'not-done',
      statusReason: 'Nil by mouth',
      notes: [{ authorUuid: 'prov-1', text: 'Nil by mouth' }],
    });
  });

  it('suggests usual ward times only for frequencies it knows', () => {
    expect(suggestedHours('Thrice a day')).toEqual([8, 14, 20]);
    expect(suggestedHours('Twice a day')).toEqual([8, 20]);
    expect(suggestedHours('Once a week')).toBeNull();
  });

  it('starts the daily pattern today when no time has passed', () => {
    const request = buildSchedule(
      { uuid: 'order-1', durationDays: 3 },
      'p1',
      'prov-1',
      [20, 8, 14],
      at(7),
    );
    expect(request.firstDaySlotsStartTime).toEqual([]);
    expect(request.dayWiseSlotsStartTime).toEqual(
      [8, 14, 20].map((h) => seconds(at(h))),
    );
    expect(request.remainingDaySlotsStartTime).toEqual([]);
  });

  it('like Bahmni, finishes today, starts tomorrow and makes up missed doses on the last day', () => {
    const request = buildSchedule(
      { uuid: 'order-1', durationDays: 3 },
      'p1',
      'prov-1',
      [8, 14, 20],
      at(15),
    );
    const day = 86_400;
    expect(request.firstDaySlotsStartTime).toEqual([seconds(at(20))]);
    expect(request.dayWiseSlotsStartTime).toEqual(
      [8, 14, 20].map((h) => seconds(at(h)) + day),
    );
    expect(request.remainingDaySlotsStartTime).toEqual(
      [8, 14].map((h) => seconds(at(h)) + 3 * day),
    );
    expect(request).toMatchObject({
      serviceType: 'MEDICATION_REQUEST',
      medicationFrequency: 'FIXED_SCHEDULE_FREQUENCY',
      orderUuid: 'order-1',
      providerUuid: 'prov-1',
    });
  });

  it('reads scheduled orders from the flat slot list the module returns', async () => {
    (get as jest.Mock).mockResolvedValue([
      ipdSlot('COMPLETED', at(8)),
      { ...ipdSlot('SCHEDULED', at(14)), order: { uuid: 'order-2' } },
    ]);
    expect(await getScheduledOrderUuids('p1')).toEqual(
      new Set(['order-1', 'order-2']),
    );
  });
});
