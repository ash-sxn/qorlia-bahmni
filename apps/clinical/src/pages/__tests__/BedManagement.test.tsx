import { groupBedsByRoom } from '../BedManagement';

describe('groupBedsByRoom', () => {
  it('keeps beds in their reported rooms', () => {
    const rooms = groupBedsByRoom([
      {
        bedId: 1,
        bedNumber: 'GW1-01',
        location: 'Room 1',
        status: 'AVAILABLE',
      },
      { bedId: 2, bedNumber: 'GW2-01', location: 'Room 2', status: 'OCCUPIED' },
      {
        bedId: 3,
        bedNumber: 'GW1-02',
        location: 'Room 1',
        status: 'AVAILABLE',
      },
    ]);

    expect(
      rooms.map(([name, beds]) => [name, beds.map((bed) => bed.bedNumber)]),
    ).toEqual([
      ['Room 1', ['GW1-01', 'GW1-02']],
      ['Room 2', ['GW2-01']],
    ]);
  });
});
