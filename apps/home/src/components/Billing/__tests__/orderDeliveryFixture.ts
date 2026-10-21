import {
  OrderDeliveries,
  OrderDeliveryPage,
  OrderTransferDetailPage,
  OrderTransferDetailSection,
} from '../billingService';

export const orderDeliveryFixture = (): OrderDeliveries => ({
  order_id: 9,
  order_name: 'QORLIAQA-ORDER',
  order_state: 'sale',
  version: 'a'.repeat(64),
  read_only: true,
  rows: [
    {
      id: 11,
      name: 'QORLIAQA/OUT/11',
      state: 'assigned',
      operation_type: [1, 'QA Delivery'],
      company: [1, 'QA Company'],
      customer: [2, 'QA Customer'],
      source: [3, 'QA Stock'],
      destination: [4, 'QA Customer location'],
      scheduled_date: '2026-10-14 10:00:00',
      date_done: false,
      origin: 'QORLIAQA-ORDER',
      backorder: false,
      moves: [
        {
          id: 12,
          state: 'assigned',
          product: [5, 'QA Medicine'],
          unit: [1, 'Units'],
          demand: 12,
          reserved: 6,
          done: 6,
          order_line: [10, 'QA Order item'],
        },
      ],
      operations: [
        {
          id: 13,
          move_id: 12,
          product: [5, 'QA Medicine'],
          unit: [2, 'Dozens'],
          reserved: 0.5,
          done: 0.5,
          lot: [6, 'QA-BATCH'],
          lot_name: false,
          expiry_date: '2027-01-01 00:00:00',
          source: [3, 'QA Stock'],
          destination: [4, 'QA Customer location'],
          source_package: false,
          destination_package: false,
          owner: false,
        },
      ],
    },
  ],
});

export const orderDeliveryPageFixture = (
  fixture = orderDeliveryFixture(),
  after = 0,
  limit = 25,
): OrderDeliveryPage => {
  const position =
    after === 0 ? 0 : fixture.rows.findIndex((row) => row.id === after) + 1;
  if (after && position === 0) throw new Error('Invalid fixture cursor.');
  const rows = fixture.rows
    .slice(position, position + limit)
    .map(({ moves, operations, ...header }) => ({
      ...header,
      move_count: moves.length,
      operation_count: operations.length,
    }));
  return {
    ...fixture,
    after,
    position,
    total_count: fixture.rows.length,
    next_after:
      position + rows.length < fixture.rows.length
        ? rows[rows.length - 1].id
        : false,
    rows,
  };
};

export const orderTransferDetailPageFixture = (
  section: OrderTransferDetailSection,
  fixture = orderDeliveryFixture(),
  transferId = 11,
  after = 0,
  limit = 50,
): OrderTransferDetailPage => {
  const transfer = orderDeliveryPageFixture(
    fixture,
    0,
    fixture.rows.length,
  ).rows.find((row) => row.id === transferId);
  const row = fixture.rows.find((item) => item.id === transferId);
  if (!transfer || !row)
    throw new Error('This transfer is no longer linked to the order.');
  const position =
    after === 0 ? 0 : row[section].findIndex((item) => item.id === after) + 1;
  if (after && position === 0)
    throw new Error('Invalid fixture detail cursor.');
  const rows = row[section].slice(position, position + limit);
  const shared: Omit<OrderTransferDetailPage, 'section' | 'rows'> = {
    ...fixture,
    transfer,
    after,
    position,
    total_count: row[section].length,
    next_after:
      position + rows.length < row[section].length
        ? rows[rows.length - 1].id
        : false,
  };
  return section === 'moves'
    ? { ...shared, section, rows: row.moves.slice(position, position + limit) }
    : {
        ...shared,
        section,
        rows: row.operations.slice(position, position + limit),
      };
};
