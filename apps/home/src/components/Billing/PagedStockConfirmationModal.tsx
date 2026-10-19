import {
  PagedStockWriteModal,
  type PagedStockWriteModalProps,
} from './PagedStockWriteModal';

export function PagedStockConfirmationModal(props: PagedStockWriteModalProps) {
  return <PagedStockWriteModal {...props} kind="confirmation" />;
}
