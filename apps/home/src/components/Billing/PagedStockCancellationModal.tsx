import {
  PagedStockWriteModal,
  type PagedStockWriteModalProps,
} from './PagedStockWriteModal';

export function PagedStockCancellationModal(
  props: Omit<PagedStockWriteModalProps, 'orderId'> & {
    orderId: number | false;
  },
) {
  return <PagedStockWriteModal {...props} kind="cancellation" />;
}
