import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  downloadInvoiceReport,
  getInvoiceReports,
  InvoiceReportKey,
} from './billingService';

export function InvoiceReportsModal({
  uid,
  invoiceId,
  close,
  reconnect,
}: {
  uid: number;
  invoiceId: number;
  close: () => void;
  reconnect: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const reports = useQuery({
    queryKey: ['billing', 'invoice-reports', uid, invoiceId],
    queryFn: () => getInvoiceReports(invoiceId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const expired =
    reports.error instanceof BillingSessionExpired ||
    failure instanceof BillingSessionExpired;
  const download = async (key: InvoiceReportKey) => {
    if (busyRef.current || reports.isFetching || reports.isError || expired)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      const { filename, blob } = await downloadInvoiceReport(invoiceId, key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        // Allow the browser to start the download before releasing its object URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(
        'PDF download requested. Open the downloaded file to view or print it.',
      );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Invoice PDF download failed.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Invoice PDF reports"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Invoice PDF reports"
        aria-busy={busy}
      >
        <p>
          Download the current saved invoice or credit note using native Billing
          reports. Unsaved edits are not included.
        </p>
        <p>
          Printing does not post a draft or receive money. Native Billing may
          save a PDF attachment for a posted document.
        </p>
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect to download this report.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : reports.isFetching ? (
          <p role="status">Loading available reports...</p>
        ) : reports.isError ? (
          <p role="alert">{reports.error.message}</p>
        ) : reports.data?.length === 0 ? (
          <p>No invoice PDF reports are available to your Billing account.</p>
        ) : (
          <div className={styles.toolbar}>
            {reports.data?.map((report) => (
              <Button
                key={report.key}
                kind="tertiary"
                disabled={busy}
                onClick={() => void download(report.key)}
              >
                Download {report.name}
              </Button>
            ))}
          </div>
        )}
        {busy ? (
          <p role="status">Generating the native PDF. Please wait...</p>
        ) : null}
        {failure && !expired ? (
          <p role="alert">{failure.message} No automatic retry was sent.</p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        <div className={styles.toolbar}>
          <Button
            kind="tertiary"
            disabled={busy || expired || reports.isFetching}
            onClick={async () => {
              const result = await reports.refetch();
              if (!result.isError) setFailure(null);
            }}
          >
            Reload available reports
          </Button>
          <Button kind="tertiary" disabled={busy} onClick={close}>
            Back to invoices
          </Button>
        </div>
      </section>
    </Modal>
  );
}
