import { Button } from '@bahmni/design-system';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getInventoryTransfer,
  getInventoryTransferDetailPage,
  InventoryTransferLoad,
  PagedStockOperationSelection,
} from './billingService';
import { PagedStockConfirmationModal } from './PagedStockConfirmationModal';
import { PagedStockOperationEditor } from './PagedStockOperationEditor';
import { PagedStockReservationModal } from './PagedStockReservationModal';
import {
  sameTransferSummary,
  formatTransferDate,
  transferLabel,
  transferStates,
} from './stockTransferPages';
import { StockMoveTable, StockOperationTable } from './StockTransferTables';

type Props = {
  uid: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
};
export function InventoryTransferDetails(props: Props) {
  const [revision, setRevision] = useState(0);
  const [workflow, setWorkflow] = useState<
    'confirmation' | 'preparation' | PagedStockOperationSelection | null
  >(null);
  const back = useRef<HTMLButtonElement>(null);
  const client = useQueryClient();
  const returnFocus = useCallback(() => back.current?.focus(), []);
  const Workflow =
    workflow === 'preparation'
      ? PagedStockReservationModal
      : PagedStockConfirmationModal;
  const closeWorkflow = () => {
    setWorkflow(null);
    setRevision((value) => value + 1);
    void client.invalidateQueries({
      queryKey: ['billing', 'inventory-transfers', props.uid],
    });
    void client.invalidateQueries({
      queryKey: ['billing', 'reservation-recovery', props.uid],
    });
  };
  return (
    <section className={styles.card} aria-label="Inventory transfer details">
      <Button ref={back} kind="tertiary" onClick={props.close}>
        Back to inventory transfers
      </Button>
      <ReadTransfer
        key={`${props.uid}:${props.transferId}:${revision}`}
        uid={props.uid}
        transferId={props.transferId}
        reconnect={props.reconnect}
        openWrite={setWorkflow}
        openOperation={(move_id, operation_id) =>
          setWorkflow({
            order_id: false,
            transfer_id: props.transferId,
            move_id,
            operation_id,
          })
        }
        reload={() => setRevision((value) => value + 1)}
      />
      {typeof workflow === 'string' ? (
        <Workflow
          uid={props.uid}
          orderId={false}
          transferId={props.transferId}
          reconnect={props.reconnect}
          returnFocus={returnFocus}
          close={closeWorkflow}
        />
      ) : workflow ? (
        <PagedStockOperationEditor
          uid={props.uid}
          selection={workflow}
          close={closeWorkflow}
          reconnect={props.reconnect}
          returnFocus={returnFocus}
        />
      ) : null}
    </section>
  );
}

function ReadTransfer({
  uid,
  transferId,
  reconnect,
  reload,
  openWrite,
  openOperation,
}: {
  uid: number;
  transferId: number;
  reconnect: () => void;
  reload: () => void;
  openWrite: (kind: 'confirmation' | 'preparation') => void;
  openOperation: (moveId: number, operationId: number | false) => void;
}) {
  const loaded = useQuery({
    queryKey: ['billing', 'inventory-transfer-load', uid, transferId],
    queryFn: () => getInventoryTransfer(transferId),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (loaded.isError)
    return (
      <div role="alert" aria-label="Inventory detail error">
        <p>{loaded.error.message} Previous details are hidden.</p>
        {loaded.error instanceof BillingSessionExpired ? (
          <Button onClick={reconnect}>Reconnect Billing</Button>
        ) : null}
        <Button onClick={reload}>Reload inventory details</Button>
      </div>
    );
  if (loaded.isFetching || !loaded.data)
    return <p role="status">Loading inventory transfer...</p>;
  return (
    <DetailPages
      key={loaded.data.version}
      uid={uid}
      loaded={loaded.data}
      reconnect={reconnect}
      reload={reload}
      openWrite={openWrite}
      openOperation={openOperation}
    />
  );
}

const sections = ['moves', 'operations'] as const;
type Section = (typeof sections)[number];
type Cursor = { after: number; position: number };
function DetailPages({
  uid,
  loaded,
  reconnect,
  reload,
  openWrite,
  openOperation,
}: {
  uid: number;
  loaded: InventoryTransferLoad;
  reconnect: () => void;
  reload: () => void;
  openWrite: (kind: 'confirmation' | 'preparation') => void;
  openOperation: (moveId: number, operationId: number | false) => void;
}) {
  const [cursors, setCursors] = useState<Record<Section, Cursor[]>>({
    moves: [{ after: 0, position: 0 }],
    operations: [{ after: 0, position: 0 }],
  });
  const queries = useQueries({
    queries: sections.map((section) => ({
      queryKey: [
        'billing',
        'inventory-transfer-detail',
        uid,
        loaded.transfer.id,
        loaded.version,
        section,
        cursors[section].at(-1)!.after,
      ],
      queryFn: () =>
        getInventoryTransferDetailPage(
          loaded.transfer.id,
          section,
          cursors[section].at(-1)!.after,
          loaded.version,
          50,
        ),
      retry: false,
      refetchOnMount: 'always' as const,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });
  const fetching = queries.some((query) => query.isFetching);
  const failure = queries.find((query) => query.error)?.error;
  const expired = queries.some(
    (query) => query.error instanceof BillingSessionExpired,
  );
  const coherent = queries.every(
    (query, index) =>
      !query.data ||
      (query.data.version === loaded.version &&
        query.data.timezone === loaded.timezone &&
        query.data.section === sections[index] &&
        query.data.after === cursors[sections[index]].at(-1)!.after &&
        query.data.position === cursors[sections[index]].at(-1)!.position &&
        sameTransferSummary(loaded.transfer, query.data.transfer)),
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const pageFocus = useRef<{
    section: Section;
    index: number;
    opener: HTMLButtonElement;
  } | null>(null);
  const pagination = useRef<Record<Section, HTMLDivElement | null>>({
    moves: null,
    operations: null,
  });
  const focused = useRef(false);
  useEffect(() => {
    if (
      !fetching &&
      !failure &&
      coherent &&
      !focused.current &&
      heading.current &&
      document.activeElement === document.body
    ) {
      focused.current = true;
      heading.current.focus();
    }
    if (fetching || !pageFocus.current) return;
    const previous = pageFocus.current;
    pageFocus.current = null;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== previous.opener
    )
      return;
    const buttons = Array.from(
      pagination.current[previous.section]?.querySelectorAll<HTMLButtonElement>(
        'button',
      ) ?? [],
    );
    const preferred = buttons[previous.index];
    const target =
      failure || !coherent
        ? reloadButton.current
        : preferred && !preferred.disabled
          ? preferred
          : (buttons.find((button) => !button.disabled) ??
            reloadButton.current);
    target?.focus();
  }, [fetching, failure, coherent]);
  if (failure || !coherent)
    return (
      <div role="alert" aria-label="Inventory detail error">
        <p>
          {failure?.message ??
            'Inventory detail pages do not match the selected transfer snapshot.'}{' '}
          Previous details are hidden.
        </p>
        {expired ? (
          <Button onClick={reconnect}>Reconnect Billing</Button>
        ) : null}
        <Button ref={reloadButton} onClick={reload}>
          Reload inventory details
        </Button>
      </div>
    );
  if (queries.some((query) => !query.data))
    return <p role="status">Loading native inventory detail pages...</p>;
  return (
    <>
      <h3 ref={heading} tabIndex={-1}>
        {loaded.transfer.name}
      </h3>
      <p>
        Status: {transferStates[loaded.transfer.state]} · Company:{' '}
        {transferLabel(loaded.transfer.company)}
      </p>
      <p>
        Contact: {transferLabel(loaded.transfer.customer)} · Source document:{' '}
        {loaded.transfer.origin || 'Not set'}
      </p>
      <p>
        From: {transferLabel(loaded.transfer.source)} · To:{' '}
        {transferLabel(loaded.transfer.destination)}
      </p>
      <p>
        Recorded done quantities are not proof of a completed stock movement.
        Confirmation and preparation have separate native effect reviews and do
        not deliver stock. Other global stock actions are still being
        integrated.
      </p>
      <p>
        Operation: {transferLabel(loaded.transfer.operation_type)} · Backorder
        of: {transferLabel(loaded.transfer.backorder)}
      </p>
      <p>
        Scheduled:{' '}
        {formatTransferDate(loaded.transfer.scheduled_date, loaded.timezone)} ·
        Completed:{' '}
        {formatTransferDate(loaded.transfer.date_done, loaded.timezone)}. Times
        shown in {loaded.timezone}.
      </p>
      <Button
        ref={reloadButton}
        kind="tertiary"
        disabled={fetching}
        onClick={reload}
      >
        Reload inventory details
      </Button>
      <Button
        kind="tertiary"
        disabled={fetching}
        onClick={() => openWrite('confirmation')}
      >
        Review or recover confirmation
      </Button>
      <Button
        kind="tertiary"
        disabled={fetching}
        onClick={() => openWrite('preparation')}
      >
        Prepare stock or recover request
      </Button>
      {sections.map((section, index) => {
        const page = queries[index].data!;
        const name =
          section === 'moves' ? 'stock moves' : 'detailed operations';
        return (
          <section
            key={section}
            aria-label={
              section === 'moves'
                ? 'Inventory stock moves'
                : 'Inventory detailed operations'
            }
          >
            <p role="status">
              {fetching
                ? 'Loading native inventory detail pages...'
                : `${page.position + (page.rows.length ? 1 : 0)} to ${page.position + page.rows.length} of ${page.total_count} ${name}.`}
            </p>
            <div
              className={styles.toolbar}
              ref={(element) => {
                pagination.current[section] = element;
              }}
            >
              <Button
                kind="tertiary"
                disabled={fetching || cursors[section].length === 1}
                onClick={(event) => {
                  pageFocus.current =
                    event.currentTarget === document.activeElement
                      ? { section, index: 0, opener: event.currentTarget }
                      : null;
                  setCursors((value) => ({
                    ...value,
                    [section]: value[section].slice(0, -1),
                  }));
                }}
              >
                Previous {name}
              </Button>
              <Button
                kind="tertiary"
                disabled={fetching || page.next_after === false}
                onClick={(event) => {
                  pageFocus.current =
                    event.currentTarget === document.activeElement
                      ? { section, index: 1, opener: event.currentTarget }
                      : null;
                  if (page.next_after !== false)
                    setCursors((value) => ({
                      ...value,
                      [section]: [
                        ...value[section],
                        {
                          after: page.next_after as number,
                          position: page.position + page.rows.length,
                        },
                      ],
                    }));
                }}
              >
                Next {name}
              </Button>
            </div>
            {fetching ? null : page.rows.length ? (
              page.section === 'moves' ? (
                <StockMoveTable
                  rows={page.rows}
                  actions={(move) => (
                    <Button
                      kind="tertiary"
                      disabled={
                        fetching || ['done', 'cancel'].includes(move.state)
                      }
                      onClick={() => openOperation(move.id, false)}
                    >
                      Add operation for move #{move.id}
                    </Button>
                  )}
                />
              ) : (
                <StockOperationTable
                  rows={page.rows}
                  actions={(line) => {
                    const moveId = line.move_id;
                    return moveId ? (
                      <Button
                        kind="tertiary"
                        disabled={fetching}
                        onClick={() => openOperation(moveId, line.id)}
                      >
                        Open operation #{line.id}
                      </Button>
                    ) : (
                      <span>No linked move</span>
                    );
                  }}
                />
              )
            ) : (
              <p>No {name} are recorded in this transfer.</p>
            )}
          </section>
        );
      })}
    </>
  );
}
