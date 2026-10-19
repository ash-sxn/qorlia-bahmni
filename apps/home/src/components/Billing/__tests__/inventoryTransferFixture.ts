import type { InventoryTransferPage } from '../billingService';
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
