import { Modal } from '@bahmni/design-system';
import React, { useLayoutEffect, useRef } from 'react';

export interface ConfirmationModalProps {
  open: boolean;
  heading: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  isSubmitting?: boolean;
  danger?: boolean;
  testId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  open,
  heading,
  body,
  confirmLabel,
  cancelLabel,
  isSubmitting = false,
  danger = false,
  testId = 'confirmation-modal',
  onConfirm,
  onCancel,
}) => {
  const launcherRef = useRef<HTMLElement | null>(null);
  const lifecycle = useRef({ open: false, version: 0 });
  useLayoutEffect(() => {
    const version = ++lifecycle.current.version;
    if (open && !lifecycle.current.open) {
      // Capture before Carbon moves focus, without recapturing its Cancel
      // button when StrictMode replays the opening effects.
      const launcher = document.activeElement;
      launcherRef.current = launcher instanceof HTMLElement ? launcher : null;
    }
    lifecycle.current.open = open;
    if (!open) return;
    return () => {
      // Carbon handles open=false. Also restore when a caller unmounts us,
      // but not during StrictMode's simulated cleanup or a newer opening.
      queueMicrotask(() => {
        if (
          lifecycle.current.version === version &&
          launcherRef.current?.isConnected
        ) {
          launcherRef.current.focus();
        }
      });
    };
  }, [open]);

  return (
    <Modal
      open={open}
      // Carbon only calls focus(), but its type excludes link launchers such
      // as the document screen's Back to search action.
      launcherButtonRef={
        launcherRef as React.RefObject<HTMLButtonElement | null>
      }
      danger={danger}
      testId={testId}
      modalHeading={heading}
      // Safe initial focus must not depend on danger styling.
      selectorPrimaryFocus=".cds--btn--secondary"
      primaryButtonText={confirmLabel}
      secondaryButtonText={cancelLabel}
      primaryButtonDisabled={isSubmitting}
      onRequestClose={onCancel}
      onRequestSubmit={onConfirm}
    >
      {body}
    </Modal>
  );
};

export default ConfirmationModal;
