import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  changeStockOperationForm,
  checkedStockOperationRequest,
  getStockOperationForm,
  getStockOperationStatus,
  getStockReservation,
  previewStockOperation,
  saveStockOperation,
  StockOperationEdit,
  StockOperationField,
  StockOperationForm,
  StockOperationRequest,
  StockOperationReview,
  StockOperationSelection,
  StockOperationStatus,
} from './billingService';
import { StockOperationEffects } from './StockOperationEffects';
import {
  StockOperationFields,
  stockOperationInputValue,
} from './StockOperationFields';
import {
  clearStockOperationRecovery,
  loadStockOperationRecovery,
  persistStockOperationRecovery,
} from './stockReservationRecovery';

type Props = {
  uid: number;
  selection: StockOperationSelection;
  close: () => void;
  reconnect: () => void;
};
export function StockOperationEditor({
  uid,
  selection,
  close,
  reconnect,
}: Props) {
  const client = useQueryClient();
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<StockOperationForm | null>(null);
  const [edits, setEdits] = useState<StockOperationEdit[]>([]);
  const [local, setLocal] = useState<
    Partial<Record<StockOperationField, string>>
  >({});
  const [pending, setPending] = useState<
    StockOperationRequest | null | undefined
  >(undefined);
  const [accepted, setAccepted] = useState(false);
  const [current, setCurrent] = useState<
    StockOperationStatus['current'] | null
  >(null);
  const [review, setReview] = useState<StockOperationReview | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState<
    'close' | 'reconnect' | 'reload' | null
  >(null);
  const loaded = useQuery({
    queryKey: ['billing', 'stock-operation-editor', uid, selection],
    queryFn: async () => {
      const request = await loadStockOperationRecovery(uid);
      return request
        ? {
            request,
            form: null,
            current: await getStockReservation(
              request.order_id,
              request.transfer_id,
            ),
          }
        : {
            request: null,
            form: await getStockOperationForm(selection),
            current: null,
          };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const request =
    pending === undefined ? (loaded.data?.request ?? null) : pending;
  const form = view ?? loaded.data?.form;
  const savedState = current ?? loaded.data?.current;
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked =
    busy || loaded.isFetching || loaded.isError || expired || !!request;
  const dirty = edits.length > 0 || Object.keys(local).length > 0;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty && !request) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, request]);
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current || loaded.isFetching || loaded.isError || expired)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    setNotice('');
    try {
      await operation();
    } catch (error) {
      if (mounted.current)
        setFailure(
          error instanceof Error
            ? error
            : new Error(
                'Stock operation unavailable. Keep the exact recovery request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const executeLeave = (action: 'close' | 'reconnect' | 'reload') => {
    if (action === 'reload') {
      setView(null);
      setEdits([]);
      setLocal({});
      setReview(null);
      setFailure(null);
      void loaded.refetch();
    } else if (action === 'close') close();
    else reconnect();
  };
  const leave = (action: 'close' | 'reconnect' | 'reload') => {
    if (busyRef.current) return;
    if (dirty && !request) setDiscard(action);
    else executeLeave(action);
  };
  const commit = (
    field: StockOperationField,
    value: number | string | false,
  ) => {
    if (locked || !form || busyRef.current || form.rules[field].readonly)
      return;
    void run(async () => {
      const next = [...edits, { field, value }];
      const updated = await changeStockOperationForm({
        ...selection,
        version: form.version,
        edits: next,
      });
      if (mounted.current) {
        setView(updated);
        setEdits(next);
        setLocal({});
        setReview(null);
      }
    });
  };
  const commitInput = (field: StockOperationField) => {
    const raw = local[field];
    if (raw === undefined || !form || locked) return;
    let value: number | string | false;
    try {
      value = stockOperationInputValue(field, raw);
    } catch (error) {
      setFailure(
        error instanceof Error ? error : new Error('Invalid operation value.'),
      );
      return;
    }
    if (value === form.values[field] || (!value && !form.values[field])) {
      setLocal((old) => {
        const next = { ...old };
        delete next[field];
        return next;
      });
      return;
    }
    commit(field, value);
  };
  const show = (result: StockOperationStatus) => {
    if (!mounted.current) return;
    setCurrent(result.current);
    setAccepted(result.accepted);
    setReview(null);
    setNotice(
      result.accepted
        ? 'This exact operation request was accepted. Current saved stock state is shown below.'
        : 'No receipt found yet. This does not prove the original request stopped. Check again or retry only the identical request.',
    );
  };
  const save = () =>
    void run(async () => {
      if (!request && (!review || Object.keys(local).length || failure)) return;
      const exact =
        request ??
        checkedStockOperationRequest({
          ...selection,
          version: review!.version,
          edits: review!.edits,
          action: review!.action,
          review_version: review!.review_version,
          request_key: crypto.randomUUID(),
        });
      await persistStockOperationRecovery(uid, exact);
      if (!mounted.current) return;
      setPending(exact);
      try {
        show(await saveStockOperation(exact));
      } catch (error) {
        if (error instanceof BillingActionRejected) {
          await clearStockOperationRecovery(uid, exact);
          if (mounted.current) {
            setPending(null);
            setReview(null);
          }
        }
        throw error;
      }
    });
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Stock operation editor"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      <section
        className={styles.card}
        aria-label="Stock operation editor"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Prepare native operation quantities, batches and locations. Recorded
          done quantities are not delivered stock until validation. This editor
          does not validate a transfer or post financial records.
        </p>
        {loaded.isFetching ? (
          <p role="status">Reading the native form and recovery request...</p>
        ) : loaded.isError ? (
          <>
            <p role="alert">{loaded.error.message}</p>
            {!expired ? (
              <Button kind="tertiary" onClick={() => void loaded.refetch()}>
                Reload stock form
              </Button>
            ) : null}
          </>
        ) : request ? (
          <>
            <p>
              Order #{request.order_id} · Transfer #{request.transfer_id} ·{' '}
              {request.action === 'delete' ? 'Removal' : 'Save'} request. No
              write is retried automatically.
            </p>
            {savedState ? (
              <div
                className={styles.tableScroll}
                role="region"
                aria-label="Current saved operation quantities"
                tabIndex={0}
              >
                <table>
                  <caption>Current saved quantities in their own units</caption>
                  <thead>
                    <tr>
                      {[
                        'Product',
                        'Unit',
                        'Demand',
                        'Reserved',
                        'Recorded done',
                      ].map((name) => (
                        <th key={name} scope="col">
                          {name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {savedState.graph.transfer.moves.map((move) => (
                      <tr key={move.id}>
                        <td>{move.product ? move.product[1] : 'Not set'}</td>
                        <td>{move.unit ? move.unit[1] : 'Not set'}</td>
                        <td>{move.demand}</td>
                        <td>{move.reserved}</td>
                        <td>{move.done}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <Button
              kind="tertiary"
              disabled={busy || expired}
              onClick={() =>
                void run(async () =>
                  show(await getStockOperationStatus(request)),
                )
              }
            >
              Check operation request
            </Button>
            {!accepted ? (
              <Button kind="danger" disabled={busy || expired} onClick={save}>
                Retry identical operation request
              </Button>
            ) : (
              <Button
                kind="tertiary"
                disabled={busy || expired}
                onClick={() =>
                  void run(async () => {
                    const result = await getStockOperationStatus(request);
                    if (!result.accepted)
                      throw new Error(
                        'Accepted receipt unavailable. Keep this recovery request.',
                      );
                    await clearStockOperationRecovery(uid, request);
                    await client.invalidateQueries({
                      queryKey: ['billing', 'order-deliveries', uid],
                    });
                    await client.invalidateQueries({
                      queryKey: ['billing', 'reservation-recovery', uid],
                    });
                    await client.invalidateQueries({
                      queryKey: ['billing', 'stock-operation-editor', uid],
                      refetchType: 'none',
                    });
                    if (mounted.current) close();
                  })
                }
              >
                Finish and reload transfers
              </Button>
            )}
          </>
        ) : form ? (
          <>
            <h2>{form.product ? form.product[1] : 'Stock operation'}</h2>
            <p>
              {form.operation_id
                ? `Operation #${form.operation_id}`
                : 'New operation'}{' '}
              · Move #{form.move_id} · State: {form.state} · Native balance:{' '}
              {form.balance}
            </p>
            {form.reason ? <p role="status">{form.reason}</p> : null}
            {form.warning ? <p role="status">{form.warning}</p> : null}
            {form.expiry_warning ? (
              <p role="status">
                Native expiry warning: the batch expiry for this operation is
                within 30 days or has passed.
              </p>
            ) : null}
            <StockOperationFields
              uid={uid}
              form={form}
              request={{ ...selection, version: form.version, edits }}
              local={local}
              disabled={locked}
              protocol="legacy"
              change={commit}
              blur={commitInput}
              reconnect={() => leave('reconnect')}
              edit={(field, value) => {
                setLocal((old) => ({ ...old, [field]: value }));
                setReview(null);
                setFailure(null);
                setNotice('');
              }}
            />
            {busy ? (
              <p role="status">Applying native operation rules...</p>
            ) : null}
            <Button
              kind="primary"
              disabled={
                locked ||
                !form.write_ready ||
                !!Object.keys(local).length ||
                (!!form.operation_id && !edits.length)
              }
              onClick={() =>
                void run(async () => {
                  const result = await previewStockOperation({
                    ...selection,
                    version: form.version,
                    edits,
                    action: 'save',
                  });
                  if (mounted.current) setReview(result);
                })
              }
            >
              Review operation changes
            </Button>
            {form.operation_id ? (
              <Button
                kind="danger"
                disabled={locked || !form.can_delete || dirty}
                onClick={() =>
                  void run(async () => {
                    const result = await previewStockOperation({
                      ...selection,
                      version: form.version,
                      edits: [],
                      action: 'delete',
                    });
                    if (mounted.current) setReview(result);
                  })
                }
              >
                Review operation removal
              </Button>
            ) : null}
            {dirty && form.operation_id ? (
              <p>Save or discard unsaved edits before reviewing removal.</p>
            ) : null}
            {review ? (
              <>
                <StockOperationEffects review={review} />
                <Button
                  kind={review.action === 'delete' ? 'danger' : 'primary'}
                  disabled={locked || !!Object.keys(local).length || !!failure}
                  onClick={save}
                >
                  Save reviewed operation action
                </Button>
              </>
            ) : null}
            <Button
              kind="tertiary"
              disabled={busy || expired}
              onClick={() => leave('reload')}
            >
              Reload stock form
            </Button>
          </>
        ) : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {expired ? (
          <Button
            kind="tertiary"
            disabled={busy}
            onClick={() => leave('reconnect')}
          >
            Reconnect Billing
          </Button>
        ) : null}
        {discard ? (
          <div role="group" aria-label="Discard unsaved stock edits">
            <p>Discard the unsaved operation edits?</p>
            <Button
              kind="danger"
              onClick={() => {
                const action = discard;
                setDiscard(null);
                executeLeave(action);
              }}
            >
              Discard unsaved edits
            </Button>
            <Button kind="tertiary" onClick={() => setDiscard(null)}>
              Keep editing
            </Button>
          </div>
        ) : null}
        <Button kind="tertiary" disabled={busy} onClick={() => leave('close')}>
          Back to stock transfers
        </Button>
      </section>
    </Modal>
  );
}
