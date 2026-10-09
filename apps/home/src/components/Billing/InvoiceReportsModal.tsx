import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  DocumentReportKey,
  downloadDocumentReport,
  downloadInvoiceReport,
  getDocumentReports,
  getInvoiceReports,
  InvoiceReportKey,
} from './billingService';

export function BillingReportsModal({
  uid,
  recordId,
  kind,
  close,
  reconnect,
}: {
  uid: number;
  recordId: number;
  kind: 'invoice' | 'order' | 'payment';
  close: () => void;
  reconnect: () => void;
}) {
  const title =
    kind === 'invoice'
      ? 'Invoice PDF reports'
      : kind === 'order'
        ? 'Quotation and order PDF reports'
        : 'Payment receipt PDF reports';
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const reports = useQuery({
    queryKey: ['billing', `${kind}-reports`, uid, recordId],
    queryFn: async () =>
      kind === 'invoice'
        ? getInvoiceReports(recordId)
        : getDocumentReports(kind, recordId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const expired =
    reports.error instanceof BillingSessionExpired ||
    failure instanceof BillingSessionExpired;
  const download = async (key: InvoiceReportKey | DocumentReportKey) => {
    if (busyRef.current || reports.isFetching || reports.isError || expired)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      const { filename, blob } =
        kind === 'invoice'
          ? await downloadInvoiceReport(recordId, key as InvoiceReportKey)
          : await downloadDocumentReport(
              kind,
              recordId,
              key as DocumentReportKey,
            );
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
          : new Error('Billing PDF download failed.'),
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
      modalHeading={title}
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section className={styles.card} aria-label={title} aria-busy={busy}>
        {kind === 'invoice' ? (
          <>
            <p>
              Download the current saved invoice or credit note using native
              Billing reports. Unsaved edits are not included.
            </p>
            <p>
              Printing does not post a draft or receive money. Native Billing
              may save a PDF attachment for a posted document.
            </p>
          </>
        ) : kind === 'order' ? (
          <>
            <p>
              Download the current saved quotation or order. A pro-forma is not
              a posted invoice. Unsaved edits are not included.
            </p>
            <p>
              Printing does not confirm an order, post an invoice or move stock.
              Native Billing may save a PDF attachment.
            </p>
          </>
        ) : (
          <>
            <p>
              Download a report for this posted customer payment or refund. This
              shows the payment amount, not necessarily the amount allocated to
              just one invoice.
            </p>
            <p>
              Downloading does not record another payment or confirm bank
              clearance. Receipt balances describe the linked documents at
              generation, not the complete customer account. Updated allocations
              generate a new receipt snapshot; earlier archives are retained.
            </p>
          </>
        )}
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
          <p>No {kind} PDF reports are available to your Billing account.</p>
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
            {kind === 'invoice'
              ? 'Back to invoices'
              : kind === 'order'
                ? 'Back to order details'
                : 'Back to payment details'}
          </Button>
        </div>
      </section>
    </Modal>
  );
}

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
  return (
    <BillingReportsModal
      uid={uid}
      kind="invoice"
      recordId={invoiceId}
      close={close}
      reconnect={reconnect}
    />
  );
}
