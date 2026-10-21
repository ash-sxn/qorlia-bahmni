import {
  PagedStockWriteModal,
  type PagedStockWriteModalProps,
} from './PagedStockWriteModal';

export function PagedStockConfirmationModal(
  props: Omit<PagedStockWriteModalProps, 'orderId'> & {
    orderId: number | false;
  },
) {
  return <PagedStockWriteModal {...props} kind="confirmation" />;
}
