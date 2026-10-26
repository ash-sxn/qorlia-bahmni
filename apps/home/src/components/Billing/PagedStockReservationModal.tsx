import {
  PagedStockWriteModal,
  type PagedStockWriteModalProps,
} from './PagedStockWriteModal';

export function PagedStockReservationModal(
  props: Omit<PagedStockWriteModalProps, 'orderId'> & {
    orderId: number | false;
  },
) {
  return <PagedStockWriteModal {...props} kind="preparation" />;
}
