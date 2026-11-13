import { Button, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { money } from './billingFormat';
import styles from './BillingPage.module.scss';
import { BillingSessionExpired } from './billingService';
import cashier from './CashierPanel.module.scss';
import { getDayEnd } from './dayEnd';

const PRINT_CLASS = 'qorlia-print-day-end';

const localDate = (date = new Date()) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const formatDay = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));

/** Prints only the day-end report, then restores the page. */
const printReport = () => {
  document.body.classList.add(PRINT_CLASS);
  const restore = () => {
    document.body.classList.remove(PRINT_CLASS);
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
};

/**
 * The cashier's day-end: money received and refunded on one day, by payment
 * method, read from posted payments in Billing. It is a count of what Billing
 * recorded, not a check of the cash drawer.
 */
export function DayEndPanel({
  uid,
  reconnect,
}: {
  uid: number;
  reconnect: () => void;
}) {
  const [date, setDate] = useState(localDate);
  const [shown, setShown] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ['billing', 'day-end', uid, shown],
    queryFn: () => getDayEnd(shown as string),
    enabled: shown !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (shown === date) void report.refetch();
    else setShown(date);
  };

  const data = report.data;
  const currencies = [...new Set(data?.methods.map((row) => row.currency))];

  return (
    <section
      className={`${cashier.panel} ${cashier.dayEnd}`}
      aria-labelledby="day-end-heading"
    >
      <div className={cashier.header}>
        <div>
          <h2 id="day-end-heading">Day-end collections</h2>
          <p className={cashier.subtle}>
            Money received and refunded on one day, by payment method.
          </p>
        </div>
      </div>

      <form className={cashier.search} onSubmit={submit}>
        <TextInput
          id="day-end-date"
          labelText="Day"
          type="date"
          value={date}
          max={localDate()}
          onChange={(event) => setDate(event.target.value)}
        />
        <Button type="submit" size="md" disabled={!date || report.isFetching}>
          Show collections
        </Button>
      </form>

      {report.isFetching ? <p role="status">Adding up payments...</p> : null}
      {report.error instanceof BillingSessionExpired ? (
        <div role="alert">
          <p>Your Billing session expired. Reconnect to continue.</p>
          <Button kind="tertiary" onClick={reconnect}>
            Reconnect Billing
          </Button>
        </div>
      ) : report.isError ? (
        <p role="alert">{report.error.message}</p>
      ) : null}

      {data && !report.isFetching ? (
        <div className={cashier.dayEndReport}>
          <h3>Collections on {formatDay(data.date)}</h3>
          {data.methods.length === 0 ? (
            <p className={cashier.empty}>No payments were posted this day.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table>
                <caption className={cashier.visuallyHidden}>
                  Totals by payment method
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Payment method</th>
                    <th scope="col" className={cashier.amount}>
                      Payments
                    </th>
                    <th scope="col" className={cashier.amount}>
                      Received
                    </th>
                    <th scope="col" className={cashier.amount}>
                      Refunded
                    </th>
                    <th scope="col" className={cashier.amount}>
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.methods.map((row) => (
                    <tr key={`${row.journal}-${row.currency}`}>
                      <td>{row.journal}</td>
                      <td className={cashier.amount}>{row.count}</td>
                      <td className={cashier.amount}>
                        {money(row.received, row.currency)}
                      </td>
                      <td className={cashier.amount}>
                        {money(row.refunded, row.currency)}
                      </td>
                      <td className={`${cashier.amount} ${cashier.due}`}>
                        {money(row.received - row.refunded, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {currencies.map((currency) => {
                    const rows = data.methods.filter(
                      (row) => row.currency === currency,
                    );
                    const sum = (pick: (row: (typeof rows)[0]) => number) =>
                      rows.reduce((total, row) => total + pick(row), 0);
                    return (
                      <tr key={currency}>
                        <th scope="row">
                          Total{currencies.length > 1 ? ` (${currency})` : ''}
                        </th>
                        <td className={cashier.amount}>
                          {sum((row) => row.count)}
                        </td>
                        <td className={cashier.amount}>
                          {money(
                            sum((row) => row.received),
                            currency,
                          )}
                        </td>
                        <td className={cashier.amount}>
                          {money(
                            sum((row) => row.refunded),
                            currency,
                          )}
                        </td>
                        <td className={`${cashier.amount} ${cashier.due}`}>
                          {money(
                            sum((row) => row.received - row.refunded),
                            currency,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tfoot>
              </table>
            </div>
          )}
          {data.drafts > 0 ? (
            <p role="status">
              {data.drafts} draft payment{data.drafts === 1 ? ' is' : 's are'}{' '}
              not counted until posted in Accounting.
            </p>
          ) : null}
          <p className={cashier.subtle}>
            Counted from payments posted in Billing. Compare with the cash
            drawer and the bank before closing the day.
          </p>
          {data.methods.length ? (
            <div className={`${styles.toolbar} ${cashier.noPrint}`}>
              <Button kind="tertiary" onClick={printReport}>
                Print day-end report
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
