import { Button, TextInput } from '@bahmni/design-system';
import { useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getPagedStockReturnLocations,
  type PagedStockReturnLocations,
  type PagedStockConfirmationSelection,
} from './billingService';

export function StockReturnLocation({
  selection,
  disabled,
  change,
  reconnect,
}: {
  selection: PagedStockConfirmationSelection;
  disabled: boolean;
  change: (location: [number, string]) => void;
  reconnect: () => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<PagedStockReturnLocations | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<Error | null>(null);
  const search = async (after = 0) => {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setPage(null);
    try {
      const value = await getPagedStockReturnLocations(
        selection,
        query,
        after,
        25,
      );
      setPage(value);
    } catch (value) {
      setError(
        value instanceof Error
          ? value
          : new Error('Location search is unavailable.'),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-label="Native return destination search" aria-busy={busy}>
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <TextInput
          id="return-destination-search"
          labelText="Search return destinations"
          value={query}
          maxLength={200}
          disabled={disabled || busy}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(null);
            setError(null);
          }}
        />
        <Button type="submit" kind="tertiary" disabled={disabled || busy}>
          Search native destinations
        </Button>
      </form>
      {busy ? (
        <p role="status">Searching permitted return destinations...</p>
      ) : null}
      {error ? <p role="alert">{error.message}</p> : null}
      {error instanceof BillingSessionExpired ? (
        <Button kind="tertiary" onClick={reconnect}>
          Reconnect Billing
        </Button>
      ) : null}
      {page ? (
        <>
          {page.rows.length === 0 ? (
            <p>No matching permitted destinations.</p>
          ) : null}
          <ul>
            {page.rows.map((row) => (
              <li key={row[0]}>
                <Button
                  kind="ghost"
                  disabled={disabled || busy}
                  onClick={() => change(row)}
                >
                  Use destination {row[1]}
                </Button>
              </li>
            ))}
          </ul>
          {page.next_after !== false ? (
            <Button
              kind="tertiary"
              disabled={disabled || busy}
              onClick={() => void search(page.next_after as number)}
            >
              More return destinations
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
