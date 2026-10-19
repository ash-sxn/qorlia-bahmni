import {
  PagedStockWriteModal,
  type PagedStockWriteModalProps,
} from './PagedStockWriteModal';

export function PagedStockCancellationModal(props: PagedStockWriteModalProps) {
  return <PagedStockWriteModal {...props} kind="cancellation" />;
}
