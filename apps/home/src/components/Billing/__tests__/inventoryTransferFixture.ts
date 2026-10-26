import type {
  InventoryTransferPage,
  InventoryTransferLoad,
  InventoryTransferDetailPage,
  OrderTransferDetailSection,
} from '../billingService';
import { orderDeliveryFixture } from './orderDeliveryFixture';

export function inventoryPage(): InventoryTransferPage {
  const row = orderDeliveryFixture().rows[0];
  Reflect.deleteProperty(row, 'moves');
  Reflect.deleteProperty(row, 'operations');
  return {
    read_only: true,
    filters: { search: '', operation: 'all', state: 'all' },
    offset: 0,
    next_offset: false,
    total_count: 1,
    timezone: 'Asia/Kolkata',
    rows: [row],
  };
}

export function inventoryLoad(): InventoryTransferLoad {
  return {
    read_only: true,
    version: 'd'.repeat(64),
    timezone: 'Asia/Kolkata',
    transfer: { ...inventoryPage().rows[0], move_count: 1, operation_count: 1 },
  };
}
export function inventoryDetail(
  section: OrderTransferDetailSection = 'moves',
): InventoryTransferDetailPage {
  const data = orderDeliveryFixture().rows[0];
  const common = {
    ...inventoryLoad(),
    after: 0,
    position: 0,
    total_count: 1,
    next_after: false as const,
  };
  if (section === 'operations')
    return { ...common, section, rows: data.operations };
  return {
    ...common,
    section,
    rows: data.moves.map((row) => {
      Reflect.deleteProperty(row, 'order_line');
      return row;
    }),
  };
}
