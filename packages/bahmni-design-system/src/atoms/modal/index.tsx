import {
  Modal as CarbonModal,
  ModalProps as CarbonModalProps,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@carbon/react';
import React from 'react';
import { createPortal } from 'react-dom';

export type ModalProps = CarbonModalProps & {
  testId?: string;
  portalId?: string;
};

export const Modal: React.FC<ModalProps> & {
  Header: typeof ModalHeader;
  Body: typeof ModalBody;
  Footer: typeof ModalFooter;
} = ({ testId, children, portalId, ...carbonProps }) => {
  /*
    Portal to div with id main-display-area for consistent positioning and stacking with
    layout-based modals and falls back to document.body if main-display-area doesn't exist.
    This ensures, consistent z-index stacking and positioning across all modals and
    layout-specific styling
  */

  return createPortal(
    <div
      id="modal-root"
      data-testid="modal-root-test-id"
      role={carbonProps.open ? 'region' : undefined}
      aria-label={
        carbonProps.open
          ? typeof carbonProps.modalHeading === 'string'
            ? `${carbonProps.modalHeading} dialog`
            : 'Open dialog'
          : undefined
      }
    >
      <CarbonModal {...carbonProps} data-testid={testId}>
        {children}
      </CarbonModal>
    </div>,
    (portalId ? document.getElementById(portalId) : null) ?? document.body,
  );
};

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export { ModalHeader, ModalBody, ModalFooter };
