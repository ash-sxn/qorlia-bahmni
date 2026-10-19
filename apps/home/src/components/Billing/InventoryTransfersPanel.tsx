import { Button, TextInput } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getInventoryTransfers,
  InventoryOperation,
  InventoryState,
} from './billingService';
import { transferLabel, transferStates } from './stockTransferPages';

function date(value: string | false, timezone: string) {
  if (!value) return 'Not set';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value.replace(' ', 'T') + 'Z'));
  } catch {
    return 'Unavailable';
  }
}

export function InventoryTransfersPanel({
  uid,
  reconnect,
}: {
  uid: number;
  reconnect: () => void;
}) {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [operation, setOperation] = useState<InventoryOperation>('all');
  const [state, setState] = useState<InventoryState>('all');
  const [offset, setOffset] = useState(0);
  const page = useQuery({
    queryKey: [
      'billing',
      'inventory-transfers',
      uid,
      submitted,
      operation,
      state,
      offset,
    ],
    queryFn: () => getInventoryTransfers(submitted, operation, state, offset),
    retry: false,
  });
  return (
    <section className={styles.card} aria-label="Inventory transfers">
      <h2>Inventory transfers</h2>
      <p>
        Find receipts, deliveries and internal transfers, including transfers
        without a charge order. This list is read-only; stock actions and the
        remaining native inventory views are still being integrated.
      </p>
      <form
        className={styles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
          setOffset(0);
        }}
      >
        <TextInput
          id="inventory-search"
          labelText="Transfer reference or source document"
          maxLength={160}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label htmlFor="inventory-operation">
          Operation{' '}
          <select
            id="inventory-operation"
            value={operation}
            onChange={(event) => {
              setOperation(event.target.value as InventoryOperation);
              setOffset(0);
            }}
          >
            <option value="all">All operations</option>
            <option value="incoming">Receipts</option>
            <option value="outgoing">Deliveries</option>
            <option value="internal">Internal transfers</option>
          </select>
        </label>
        <label htmlFor="inventory-state">
          Status{' '}
          <select
            id="inventory-state"
            value={state}
            onChange={(event) => {
              setState(event.target.value as InventoryState);
              setOffset(0);
            }}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="waiting">Waiting</option>
            <option value="assigned">Ready</option>
            <option value="done">Done</option>
            <option value="cancel">Cancelled</option>
          </select>
        </label>
        <Button type="submit" disabled={page.isFetching}>
          Search transfers
        </Button>
        <Button
          kind="tertiary"
          disabled={page.isFetching}
          onClick={() => {
            setSearch('');
            setSubmitted('');
            setOperation('all');
            setState('all');
            setOffset(0);
          }}
        >
          Clear filters
        </Button>
        <Button
          kind="tertiary"
          disabled={page.isFetching}
          onClick={() => void page.refetch()}
        >
          Refresh transfers
        </Button>
      </form>
      {page.isFetching ? (
        <p role="status">Loading inventory transfers...</p>
      ) : null}
      {page.isError ? (
        <div role="alert" aria-label="Inventory error">
          <p>
            {page.error instanceof Error
              ? page.error.message
              : 'Inventory is unavailable.'}
          </p>
          {page.error instanceof BillingSessionExpired ? (
            <Button onClick={reconnect}>Reconnect Billing</Button>
          ) : (
            <Button onClick={() => void page.refetch()}>Retry inventory</Button>
          )}
        </div>
      ) : null}
      {page.data && !page.isFetching && !page.isError ? (
        <>
          <p>
            Times shown in {page.data.timezone}. Pages reflect the current
            inventory, not a saved stock review.
          </p>
          {page.data.rows.length ? (
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Inventory transfer table, scroll for more columns"
              tabIndex={0}
            >
              <table>
                <caption>Transfers in your active Billing companies</caption>
                <thead>
                  <tr>
                    {[
                      'Reference',
                      'Status',
                      'Operation',
                      'Contact',
                      'From',
                      'To',
                      'Scheduled',
                      'Completed',
                      'Source document',
                      'Company',
                      'Backorder of',
                    ].map((heading) => (
                      <th scope="col" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.data.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.name}</th>
                      <td>
                        {
                          transferStates[
                            row.state as keyof typeof transferStates
                          ]
                        }
                      </td>
                      <td>{transferLabel(row.operation_type)}</td>
                      <td>{transferLabel(row.customer)}</td>
                      <td>{transferLabel(row.source)}</td>
                      <td>{transferLabel(row.destination)}</td>
                      <td>{date(row.scheduled_date, page.data.timezone)}</td>
                      <td>{date(row.date_done, page.data.timezone)}</td>
                      <td>{row.origin || 'Not set'}</td>
                      <td>{transferLabel(row.company)}</td>
                      <td>{transferLabel(row.backorder)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No transfers match these filters. Try clearing the filters or
              checking another operation.
            </p>
          )}
          <div className={styles.toolbar}>
            <Button
              kind="tertiary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous transfer page
            </Button>
            <p>
              {page.data.total_count} matching transfers. Page{' '}
              {Math.floor(offset / 25) + 1}.
            </p>
            <Button
              kind="tertiary"
              disabled={page.data.next_offset === false}
              onClick={() => {
                if (page.data.next_offset !== false)
                  setOffset(page.data.next_offset);
              }}
            >
              Next transfer page
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
