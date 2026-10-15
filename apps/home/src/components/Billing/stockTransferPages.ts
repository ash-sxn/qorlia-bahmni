import type {
  OrderDeliveryPage,
  OrderTransferDetailPage,
  OrderTransferDetailSection,
  OrderTransferSummary,
} from './billingService';

export const transferStates = {
  draft: 'Draft',
  waiting: 'Waiting for another operation',
  confirmed: 'Waiting for availability',
  assigned: 'Ready',
  done: 'Done',
  cancel: 'Cancelled',
};
export const transferLabel = (relation: [number, string] | false) =>
  relation ? relation[1] : 'Not set';

export function coherentTransferPages(
  pages: OrderDeliveryPage[],
  orderId: number,
) {
  const first = pages[0];
  if (!first) return false;
  let position = 0,
    after = 0,
    lastId = 0;
  for (const page of pages) {
    if (
      page.order_id !== orderId ||
      page.order_name !== first.order_name ||
      page.order_state !== first.order_state ||
      page.version !== first.version ||
      page.total_count !== first.total_count ||
      page.position !== position ||
      page.after !== after
    )
      return false;
    for (const row of page.rows) {
      if (row.id <= lastId) return false;
      lastId = row.id;
    }
    position += page.rows.length;
    after = page.next_after === false ? -1 : page.next_after;
  }
  return position <= first.total_count;
}

export function sameTransferSummary(
  left: OrderTransferSummary,
  right: OrderTransferSummary,
) {
  return Object.entries(left).every(
    ([key, value]) =>
      JSON.stringify(value) ===
      JSON.stringify(right[key as keyof OrderTransferSummary]),
  );
}

export function coherentTransferDetail(
  page: OrderTransferDetailPage,
  snapshot: Pick<
    OrderDeliveryPage,
    'order_id' | 'order_name' | 'order_state' | 'version'
  >,
  transferId: number,
  section: OrderTransferDetailSection,
  cursor: { after: number; position: number },
) {
  return (
    page.order_id === snapshot.order_id &&
    page.order_name === snapshot.order_name &&
    page.order_state === snapshot.order_state &&
    page.version === snapshot.version &&
    page.transfer.id === transferId &&
    page.section === section &&
    page.after === cursor.after &&
    page.position === cursor.position
  );
}
