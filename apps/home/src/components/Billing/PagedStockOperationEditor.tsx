import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  changePagedStockOperationForm,
  checkedPagedStockOperationRequest,
  getPagedStockOperationForm,
  getPagedStockOperationReview,
  savePagedStockOperation,
  type PagedStockOperationRequest,
  type PagedStockOperationReview,
  type StockOperationEdit,
  type StockOperationField,
  type StockOperationForm,
  type StockOperationSelection,
} from './billingService';
import { PagedStockWriteModal } from './PagedStockWriteModal';
import { StockConfirmationEffects } from './StockConfirmationEffects';
import {
  StockOperationFields,
  stockOperationInputValue,
} from './StockOperationFields';
import {
  isStockOperationRequest,
  loadPagedStockWriteRecovery,
  persistPagedStockWriteRecovery,
} from './stockReservationRecovery';

type Props = {
  uid: number;
  selection: StockOperationSelection;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
};
type Cursor = { after: number; version: string | false; token: string | false };
type Review = { page: PagedStockOperationReview; cursors: Cursor[] };

export function PagedStockOperationEditor(props: Props) {
  return (
    <OperationForm
      key={`${props.uid}:${props.selection.order_id}:${props.selection.transfer_id}:${props.selection.move_id}:${props.selection.operation_id}`}
      {...props}
    />
  );
}

function OperationForm({
  uid,
  selection,
  close,
  reconnect,
  returnFocus,
}: Props) {
  const mounted = useRef(true),
    busyRef = useRef(false);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<StockOperationForm | null>(null);
  const [edits, setEdits] = useState<StockOperationEdit[]>([]);
  const [local, setLocal] = useState<
    Partial<Record<StockOperationField, string>>
  >({});
  const [review, setReview] = useState<Review | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [recovery, setRecovery] = useState<{
    request: PagedStockOperationRequest;
    error: Error | null;
  } | null>(null);
  const [discard, setDiscard] = useState<
    'close' | 'reconnect' | 'reload' | null
  >(null);
  const loaded = useQuery({
    queryKey: ['billing', 'stock-operation-form-paged', uid, selection],
    queryFn: async () => {
      const request = await loadPagedStockWriteRecovery(uid);
      if (request && !isStockOperationRequest(request))
        throw new Error(
          'Another stock request is pending. Resume its original workflow before editing an operation.',
        );
      return request
        ? { request, form: null }
        : { request: null, form: await getPagedStockOperationForm(selection) };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const request = recovery?.request ?? loaded.data?.request;
  const form = view ?? loaded.data?.form;
  const dirty = edits.length > 0 || Object.keys(local).length > 0;
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked =
    busy ||
    loaded.isFetching ||
    loaded.isError ||
    expired ||
    !!request ||
    !!discard;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  useEffect(() => {
    if (review && !busy) heading.current?.focus();
  }, [review, busy]);
  useEffect(() => {
    if (!dirty && !request) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, request]);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || loaded.isFetching || loaded.isError || expired)
      return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      if (mounted.current)
        setFailure(
          error instanceof Error
            ? error
            : new Error(
                'Stock operation is unavailable. Keep the original request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const executeLeave = (action: 'close' | 'reconnect' | 'reload') => {
    if (action === 'close') close();
    else if (action === 'reconnect') reconnect();
    else {
      setView(null);
      setEdits([]);
      setLocal({});
      setReview(null);
      setFailure(null);
      void loaded.refetch();
    }
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
    if (locked || review || !form || form.rules[field].readonly) return;
    void run(async () => {
      const next = [...edits, { field, value }];
      const updated = await changePagedStockOperationForm({
        ...selection,
        version: form.version,
        edits: next,
      });
      if (mounted.current) {
        setView(updated);
        setEdits(next);
        setLocal({});
      }
    });
  };
  const commitInput = (field: StockOperationField) => {
    const raw = local[field];
    if (raw === undefined || !form || locked || review) return;
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
  const readPage = (action: 'save' | 'delete', previous = false) =>
    void run(async () => {
      if (
        !form ||
        request ||
        Object.keys(local).length ||
        (action === 'save'
          ? !form.write_ready || (!!form.operation_id && !edits.length)
          : !form.can_delete || dirty)
      )
        return;
      const old = review?.page;
      const cursors = review
        ? previous
          ? review.cursors.slice(0, -1)
          : [
              ...review.cursors,
              {
                after: review.page.next_after as number,
                version: review.page.review_version,
                token: review.page.continuation_token,
              },
            ]
        : [{ after: 0, version: false as const, token: false as const }];
      if (
        !cursors.length ||
        (review &&
          (old?.action !== action || (!previous && old.next_after === false)))
      )
        return;
      const cursor = cursors[cursors.length - 1];
      setReview(null);
      const page = await getPagedStockOperationReview(
        {
          ...selection,
          version: form.version,
          edits: action === 'delete' ? [] : edits,
          action,
        },
        cursor.after,
        cursor.version,
        cursor.token,
        50,
      );
      if (
        old &&
        (page.review_version !== old.review_version ||
          page.total_count !== old.total_count ||
          page.state_after !== old.state_after ||
          page.operation_key !== old.operation_key ||
          page.action !== old.action ||
          JSON.stringify(page.edits) !== JSON.stringify(old.edits))
      )
        throw new Error(
          'Operation pages changed. Reload the native form and start a new review.',
        );
      if (mounted.current) setReview({ page, cursors });
    });
  const save = () =>
    void run(async () => {
      const page = review?.page;
      if (
        request ||
        !form ||
        !page ||
        failure ||
        Object.keys(local).length ||
        !page.write_ready ||
        page.next_after !== false ||
        !page.review_complete_token ||
        (page.action === 'save' ? !form.write_ready : !form.can_delete)
      )
        return;
      const exact = checkedPagedStockOperationRequest({
        order_id: page.order_id,
        transfer_id: page.transfer_id,
        move_id: page.move_id,
        operation_id: page.operation_id,
        version: page.version,
        edits: page.edits,
        action: page.action,
        review_version: page.review_version,
        review_complete_token: page.review_complete_token,
        request_key: crypto.randomUUID(),
      });
      await persistPagedStockWriteRecovery(uid, exact);
      if (!mounted.current) return;
      let error: Error | null = null;
      try {
        await savePagedStockOperation(exact);
      } catch (cause) {
        error =
          cause instanceof Error
            ? cause
            : new Error(
                'The save response is unavailable. Check the exact operation request.',
              );
      }
      if (mounted.current) setRecovery({ request: exact, error });
    });

  if (request)
    return (
      <PagedStockWriteModal
        kind="operation"
        uid={uid}
        orderId={selection.order_id}
        transferId={selection.transfer_id}
        close={close}
        reconnect={reconnect}
        initialFailure={recovery?.error}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Complete stock operation editor"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      <section
        className={styles.card}
        aria-label="Complete stock operation editor"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Prepare native operation quantities, batches, locations and prices.
          Recorded done quantities are not delivered stock until validation.
          This editor does not validate a transfer or post financial records.
        </p>
        {loaded.isFetching ? (
          <p role="status">Reading the native form and recovery request...</p>
        ) : loaded.isError ? (
          <p role="alert">{loaded.error.message}</p>
        ) : form ? (
          <>
            <h2>{form.product ? form.product[1] : 'Stock operation'}</h2>
            <p>
              Order #{form.order_id} · Transfer #{form.transfer_id} · Move #
              {form.move_id} ·{' '}
              {form.operation_id
                ? `Operation #${form.operation_id}`
                : 'New operation'}{' '}
              · State: {form.state} · Native balance: {form.balance} · Reserved:{' '}
              {form.reserved}
            </p>
            {form.reason ? <p role="status">{form.reason}</p> : null}
            {(review?.page.form ?? form).warning ? (
              <p role="status">{(review?.page.form ?? form).warning}</p>
            ) : null}
            {(review?.page.form ?? form).expiry_warning ? (
              <p role="status">
                Native expiry warning: the batch expiry for this operation is
                within 30 days or has passed.
              </p>
            ) : null}
            <StockOperationFields
              uid={uid}
              form={review?.page.form ?? form}
              request={{ ...selection, version: form.version, edits }}
              local={local}
              disabled={locked || !!review}
              protocol="complete"
              change={commit}
              blur={commitInput}
              reconnect={() => leave('reconnect')}
              edit={(field, value) => {
                setLocal((old) => ({ ...old, [field]: value }));
                setFailure(null);
              }}
            />
            {busy ? (
              <p role="status">
                Applying native operation rules or reading the complete
                review...
              </p>
            ) : null}
            {!review ? (
              <>
                <Button
                  disabled={
                    locked ||
                    !!failure ||
                    !form.write_ready ||
                    !!Object.keys(local).length ||
                    (!!form.operation_id && !edits.length)
                  }
                  onClick={() => readPage('save')}
                >
                  Review operation changes
                </Button>
                {form.operation_id ? (
                  <Button
                    kind="danger"
                    disabled={locked || !!failure || !form.can_delete || dirty}
                    onClick={() => readPage('delete')}
                  >
                    Review operation removal
                  </Button>
                ) : null}
                {dirty && form.operation_id ? (
                  <p>Save or discard unsaved edits before reviewing removal.</p>
                ) : null}
              </>
            ) : (
              <>
                <h3 ref={heading} tabIndex={-1}>
                  Operation effect page {review.cursors.length}
                </h3>
                <p role="status">
                  {review.page.after} earlier effects reviewed ·{' '}
                  {review.page.total_count} total effects · Action:{' '}
                  {review.page.action === 'delete'
                    ? 'Remove operation'
                    : 'Save operation'}{' '}
                  · Resulting state: {review.page.state_after}. This preview has
                  not been saved.
                </p>
                <StockConfirmationEffects
                  effects={review.page.effects}
                  workflow="operation"
                />
                <Button
                  kind="tertiary"
                  disabled={locked || !!failure || review.cursors.length === 1}
                  onClick={() => readPage(review.page.action, true)}
                >
                  Previous operation effects
                </Button>
                {review.page.next_after !== false ? (
                  <Button
                    kind="tertiary"
                    disabled={locked || !!failure}
                    onClick={() => readPage(review.page.action)}
                  >
                    Review next operation effects
                  </Button>
                ) : (
                  <p role="status">
                    All effect pages reviewed. The complete review is ready to
                    save.
                  </p>
                )}
                <Button
                  kind={review.page.action === 'delete' ? 'danger' : 'primary'}
                  disabled={
                    locked ||
                    !!failure ||
                    !review.page.write_ready ||
                    review.page.next_after !== false ||
                    !review.page.review_complete_token
                  }
                  onClick={save}
                >
                  Save reviewed operation action
                </Button>
                <Button
                  kind="tertiary"
                  disabled={locked}
                  onClick={() => setReview(null)}
                >
                  Return to operation edits
                </Button>
              </>
            )}
          </>
        ) : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        {!expired ? (
          <Button
            kind="tertiary"
            disabled={busy || loaded.isFetching}
            onClick={() => leave('reload')}
          >
            Reload stock form
          </Button>
        ) : (
          <Button
            kind="tertiary"
            disabled={busy}
            onClick={() => leave('reconnect')}
          >
            Reconnect Billing
          </Button>
        )}
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
