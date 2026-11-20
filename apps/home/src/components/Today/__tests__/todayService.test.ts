import { get } from '@bahmni/services';
import { getTodayQueue, isWaiting } from '../todayService';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
}));

const visit = (overrides: Record<string, unknown>) => ({
  uuid: 'v',
  startDatetime: '2026-11-18T10:00:00.000+0530',
  stopDatetime: null,
  visitType: { display: 'OPD' },
  patient: {
    uuid: 'p',
    display: 'ABC200049 - Sunita Verma',
    person: { age: 52, gender: 'F', display: 'Sunita Verma' },
  },
  encounters: [],
  ...overrides,
});

describe('getTodayQueue', () => {
  it("reads today's outpatient visits, oldest first, and leaves out admissions", async () => {
    (get as jest.Mock).mockResolvedValue({
      results: [
        visit({ uuid: 'late', startDatetime: '2026-11-18T11:00:00.000+0530' }),
        visit({ uuid: 'ipd', visitType: { display: 'IPD' } }),
        visit({
          uuid: 'early',
          startDatetime: '2026-11-18T09:00:00.000+0530',
          encounters: [{ encounterType: { display: 'Consultation' } }],
        }),
      ],
    });

    const queue = await getTodayQueue(new Date(2026, 10, 18, 12));

    expect((get as jest.Mock).mock.calls[0][0]).toContain(
      'fromStartDate=2026-11-18T00%3A00%3A00',
    );
    expect(queue.map(({ visitUuid }) => visitUuid)).toEqual(['early', 'late']);
    expect(queue[1]).toMatchObject({
      name: 'Sunita Verma',
      identifier: 'ABC200049',
      age: 52,
    });
    expect(queue.map(isWaiting)).toEqual([false, true]);
  });

  it('does not count a closed visit as waiting', () => {
    expect(
      isWaiting({
        visitUuid: 'v',
        patientUuid: 'p',
        name: '',
        identifier: '',
        age: null,
        gender: '',
        visitType: 'OPD',
        started: '',
        open: false,
        seen: false,
      }),
    ).toBe(false);
  });
});
