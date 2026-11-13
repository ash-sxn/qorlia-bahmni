import { Button, Modal, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  downloadCustomerStatement,
  getCustomerStatement,
} from './billingService';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function CustomerStatementModal({
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
  const [end, setEnd] = useState(today);
  const [start, setStart] = useState(() => `${today().slice(0, 7)}-01`);
  const [range, setRange] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const statement = useQuery({
    queryKey: [
      'billing',
      'customer-statement',
      uid,
      invoiceId,
      range?.start,
      range?.end,
    ],
    queryFn: () => getCustomerStatement(invoiceId, range!.start, range!.end),
    enabled: range !== null,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const expired =
    statement.error instanceof BillingSessionExpired ||
    failure instanceof BillingSessionExpired;
  const data = statement.data;
  const download = async () => {
    if (
      busyRef.current ||
      statement.isFetching ||
      statement.isError ||
      expired ||
      !data
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      const { filename, blob } = await downloadCustomerStatement(
        invoiceId,
        data.date_from,
        data.date_to,
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
        // Let the browser start downloading before releasing its object URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(
        'PDF download requested. Open the downloaded file to view or print it.',
      );
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Statement PDF download failed.'),
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
      modalHeading="Customer account statement"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Customer account statement"
        aria-busy={busy}
      >
        <p>
          Posted receivable entries visible to your Billing account, for the
          invoice&apos;s commercial customer and company. Drafts are excluded.
          Dates are accounting dates.
        </p>
        <p>
          Balances use the company currency. A negative balance is customer
          credit. This is a dated ledger, not today&apos;s unpaid-invoice list
          or confirmation of bank clearance.
        </p>
        <form
          className={styles.toolbar}
          onSubmit={(event) => {
            event.preventDefault();
            if (busyRef.current || expired) return;
            setFailure(null);
            setNotice('');
            if (range?.start === start && range.end === end)
              void statement.refetch();
            else setRange({ start, end });
          }}
        >
          <TextInput
            id="statement-start"
            type="date"
            labelText="From accounting date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
            disabled={busy}
          />
          <TextInput
            id="statement-end"
            type="date"
            labelText="Through accounting date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
            min={start}
            disabled={busy}
          />
          <Button
            type="submit"
            disabled={statement.isFetching || expired || busy}
          >
            Load statement
          </Button>
        </form>
        {expired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect to view the statement.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : statement.isFetching ? (
          <p role="status">Loading posted customer entries...</p>
        ) : statement.isError ? (
          <div role="alert">
            <p>{statement.error.message}</p>
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => {
                setFailure(null);
                setNotice('');
                void statement.refetch();
              }}
            >
              Reload statement
            </Button>
          </div>
        ) : data ? (
          <>
            <h2>{data.customer}</h2>
            <p>
              {data.company} · {data.date_from} to {data.date_to} ·{' '}
              {data.currency[1]}
            </p>
            <dl className={styles.totals}>
              <dt>Opening balance</dt>
              <dd>{money(data.opening, data.currency[1])}</dd>
              <dt>Period debits</dt>
              <dd>{money(data.debit, data.currency[1])}</dd>
              <dt>Period credits</dt>
              <dd>{money(data.credit, data.currency[1])}</dd>
              <dt>Closing balance</dt>
              <dd>{money(data.closing, data.currency[1])}</dd>
            </dl>
            {data.rows.length ? (
              <div
                className={styles.tableScroll}
                tabIndex={0}
                role="region"
                aria-label="Scrollable customer receivable entries"
              >
                <table className={styles.statementTable}>
                  <caption>Posted customer receivable entries</caption>
                  <thead>
                    <tr>
                      {[
                        'Accounting date',
                        'Document / reference',
                        'Journal / account',
                        'Debit',
                        'Credit',
                        'Running balance',
                        'Document currency amount',
                      ].map((title) => (
                        <th key={title} scope="col">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.date}</td>
                        <td>
                          {row.document}
                          <br />
                          {row.reference || row.label || ''}
                        </td>
                        <td>
                          {row.journal}
                          <br />
                          {row.account}
                        </td>
                        <td>{money(row.debit, data.currency[1])}</td>
                        <td>{money(row.credit, data.currency[1])}</td>
                        <td>{money(row.balance, data.currency[1])}</td>
                        <td>{money(row.amount_currency, row.currency[1])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No posted receivable entries in this period. The opening balance
                is still included.
              </p>
            )}
            <p>
              Download a current ledger snapshot for the displayed period.
              Edited dates are not printed until loaded.
            </p>
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => void download()}
            >
              Download statement PDF
            </Button>
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => {
                setFailure(null);
                setNotice('');
                void statement.refetch();
              }}
            >
              Reload statement
            </Button>
          </>
        ) : (
          <p>Select the accounting period, then load the statement.</p>
        )}
        {busy ? <p role="status">Generating statement PDF...</p> : null}
        {failure && !expired ? (
          <p role="alert">
            {failure.message} No automatic retry was made. You can request the
            download again.
          </p>
        ) : null}
        {notice && !expired ? <p role="status">{notice}</p> : null}
        <Button kind="tertiary" onClick={close} disabled={busy}>
          Back to invoices
        </Button>
      </section>
    </Modal>
  );
}
