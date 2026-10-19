import {
  PagedStockWriteModal,
  type PagedStockWriteModalProps,
} from './PagedStockWriteModal';

export function PagedStockReservationModal(props: PagedStockWriteModalProps) {
  return <PagedStockWriteModal {...props} kind="preparation" />;
}
