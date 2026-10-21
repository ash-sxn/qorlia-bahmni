import { Button, Modal } from '@bahmni/design-system';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getInventoryStoredForm,
  previewInventoryStoredForm,
  getInventoryStoredSaveReview,
  checkedInventoryStoredSaveRequest,
  saveInventoryStoredForm,
  type InventoryHeaderEdit,
  type InventoryStoredPreview,
  type InventoryStoredSaveReview,
  type InventoryStoredSaveRequest,
} from './billingService';
import {
  InventoryHeaderFields,
  inventoryHeaderInputValue,
  inventoryHeaderText,
} from './InventoryHeaderFields';
import { InventoryHeaderRecovery } from './InventoryHeaderRecovery';
import { StockConfirmationEffects } from './StockConfirmationEffects';
import {
  loadInventoryStoredSaveRecovery,
  persistInventoryStoredSaveRecovery,
} from './stockReservationRecovery';

type Props = {
  uid: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
  openTransfer: (id: number) => void;
  returnFocus?: () => void;
};
type Cursor = { after: number; version: string | false; token: string | false };
type Review = { page: InventoryStoredSaveReview; cursors: Cursor[] };
type LeaveTarget = 'close' | 'reload' | 'reconnect' | { transferId: number };
export function InventoryHeaderEditor(props: Props) {
  return <HeaderEditor key={`${props.uid}:${props.transferId}`} {...props} />;
}
function HeaderEditor({
  uid,
  transferId,
  close,
  reconnect,
  openTransfer,
  returnFocus,
}: Props) {
  const mounted = useRef(true),
    busyRef = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<Error | null>(null);
  const [view, setView] = useState<InventoryStoredPreview | null>(null);
  const [edits, setEdits] = useState<InventoryHeaderEdit[]>([]),
    [local, setLocal] = useState<Record<number, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [discard, setDiscard] = useState<LeaveTarget | null>(null);
  const [handoff, setHandoff] = useState<{
    request: InventoryStoredSaveRequest;
    error: Error | null;
  } | null>(null);
  const loaded = useQuery({
    queryKey: ['billing', 'inventory-header-form', uid, transferId],
    queryFn: async () => {
      const request = await loadInventoryStoredSaveRecovery(uid);
      if (request && request.transfer_id !== transferId)
        throw new Error(
          'A header save for another transfer is pending. Resume it from Billing.',
        );
      return request
        ? { request, form: null }
        : { request: null, form: await getInventoryStoredForm(transferId) };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const form = review?.page.form ?? view?.form ?? loaded.data?.form?.form;
  const version = loaded.data?.form?.version;
  const pending =
    handoff ??
    (loaded.data?.request
      ? { request: loaded.data.request, error: null }
      : null);
  const dirty = edits.length > 0 || Object.keys(local).length > 0;
  const hasPending = pending !== null;
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked =
    busy ||
    loaded.isFetching ||
    loaded.isError ||
    expired ||
    !!discard ||
    !!pending;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  useEffect(() => {
    if (!dirty || hasPending) return;
    // shortcut: this covers full-page unload; add router-history blocking before navigation parity acceptance.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, hasPending]);
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
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
                'The native transfer form is unavailable. Nothing new was saved.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const executeLeave = (target: LeaveTarget) => {
    if (typeof target === 'object') {
      close();
      openTransfer(target.transferId);
    } else if (target === 'close') close();
    else if (target === 'reconnect') reconnect();
    else {
      setView(null);
      setEdits([]);
      setLocal({});
      setReview(null);
      setFailure(null);
      void loaded.refetch();
    }
  };
  const leave = (target: LeaveTarget) => {
    if (busyRef.current) return;
    if (dirty && !pending) setDiscard(target);
    else executeLeave(target);
  };
  const change = (node: number, value: InventoryHeaderEdit['value']) => {
    if (
      locked ||
      review ||
      !form ||
      !version ||
      !form.layout[node]?.rules.visible ||
      form.layout[node].rules.readonly
    )
      return;
    void run(async () => {
      const next = [...edits, { node, value }];
      const updated = await previewInventoryStoredForm({
        transfer_id: transferId,
        version,
        edits: next,
      });
      if (mounted.current) {
        setView(updated);
        setEdits(next);
        setLocal((old) => {
          const remaining = { ...old };
          delete remaining[node];
          return remaining;
        });
      }
    });
  };
  const blur = (node: number) => {
    if (local[node] === undefined || !form || locked || review) return;
    try {
      const name = form.layout[node].field;
      const value = inventoryHeaderInputValue(
        form.fields[name].type,
        local[node],
        form.timezone,
      );
      if (
        value === form.values[name] ||
        (value === false && form.values[name] === '')
      )
        setLocal((old) => {
          const next = { ...old };
          delete next[node];
          return next;
        });
      else change(node, value);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Enter a valid native field value.'),
      );
    }
  };
  const readReview = (previous = false) =>
    void run(async () => {
      if (
        !form ||
        !version ||
        pending ||
        discard ||
        expired ||
        !edits.length ||
        Object.keys(local).length
      )
        return;
      const old = review?.page;
      if (!previous && old?.next_after === false) return;
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
      if (!cursors.length) return;
      setReview(null);
      const cursor = cursors.at(-1)!;
      const page = await getInventoryStoredSaveReview(
        { transfer_id: transferId, version, edits },
        cursor.after,
        cursor.version,
        cursor.token,
      );
      if (
        old &&
        (page.review_version !== old.review_version ||
          page.effect_count !== old.effect_count ||
          page.state_after !== old.state_after ||
          page.form.version !== old.form.version)
      )
        throw new Error(
          'Native save effects changed between pages. Start a new complete review.',
        );
      if (mounted.current) setReview({ page, cursors });
    });
  const save = () =>
    void run(async () => {
      if (
        !review ||
        !version ||
        pending ||
        discard ||
        expired ||
        failure ||
        review.page.next_after !== false ||
        !review.page.review_complete_token ||
        Object.keys(local).length
      )
        return;
      const request = checkedInventoryStoredSaveRequest({
        transfer_id: transferId,
        version,
        edits,
        review_version: review.page.review_version,
        review_complete_token: review.page.review_complete_token,
        request_key: crypto.randomUUID(),
      });
      try {
        await persistInventoryStoredSaveRecovery(uid, request);
        if (!mounted.current) return;
        await saveInventoryStoredForm(request);
        if (mounted.current) setHandoff({ request, error: null });
      } catch (error) {
        // Storage may have committed before a lost account/read acknowledgement; keep this UUID even then.
        if (mounted.current)
          setHandoff({
            request,
            error:
              error instanceof Error
                ? error
                : new Error('The exact save outcome is unknown.'),
          });
      }
    });
  if (pending)
    return (
      <InventoryHeaderRecovery
        uid={uid}
        transferId={transferId}
        close={close}
        reconnect={reconnect}
        initial={pending}
      />
    );
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Edit transfer header"
      preventCloseOnClickOutside
      onRequestClose={() => leave('close')}
    >
      <section
        className={styles.card}
        aria-label="Native transfer header editor"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Transfer #{transferId}. Changes use native field permissions,
          conditions and relation searches. Review every native effect before
          Save. Stock rows and detailed operations keep their separate
          workflows.
        </p>
        {loaded.isFetching ? (
          <p role="status">Loading the native transfer form...</p>
        ) : null}
        {loaded.error ? (
          <p role="alert">{loaded.error.message} No editable form is shown.</p>
        ) : null}
        {form && version && !loaded.isFetching && !loaded.isError ? (
          <>
            {form.warning ? (
              <p role="alert">
                {inventoryHeaderText(form.warning.title, 'Native warning')}:{' '}
                {inventoryHeaderText(form.warning.message)}
              </p>
            ) : null}
            {form.unsupported.length ? (
              <p role="alert">
                Native field adapters are missing: {form.unsupported.join(', ')}
                . Save is unavailable.
              </p>
            ) : null}
            <InventoryHeaderFields
              uid={uid}
              form={form}
              selection={{ transfer_id: transferId, version, edits }}
              local={local}
              disabled={locked || !!review}
              edit={(node, value) => {
                setLocal((old) => ({ ...old, [node]: value }));
                setFailure(null);
              }}
              blur={blur}
              change={change}
              reconnect={() => leave('reconnect')}
              openTransfer={(id) => leave({ transferId: id })}
            />
            {Object.keys(local).length > 0 ? (
              <div>
                <p role="status">
                  Some field input has not passed native onchange yet. Leave
                  each edited field to apply its rules, or explicitly discard
                  the unapplied input. A hidden or newly readonly field cannot
                  be applied.
                </p>
                <Button
                  kind="tertiary"
                  disabled={locked || !!review}
                  onClick={() => {
                    setLocal({});
                    setFailure(null);
                  }}
                >
                  Discard unapplied header inputs
                </Button>
              </div>
            ) : null}
            {busy ? (
              <p role="status">
                Applying native rules or checking the exact reviewed save...
              </p>
            ) : null}
            {!review ? (
              <Button
                disabled={
                  locked ||
                  !edits.length ||
                  !!Object.keys(local).length ||
                  !!form.unsupported.length
                }
                onClick={() => readReview()}
              >
                Review header save effects
              </Button>
            ) : (
              <>
                <h3 ref={heading} tabIndex={-1}>
                  Header save effect page {review.cursors.length}
                </h3>
                <p role="status">
                  {review.page.after} earlier effects reviewed.{' '}
                  {review.page.effect_count} total effects. Changed fields:{' '}
                  {review.page.changed_fields.join(', ') || 'None'}. This
                  preview has not been saved.
                </p>
                <StockConfirmationEffects
                  effects={review.page.effects}
                  workflow="header save"
                />
                <div className={styles.toolbar}>
                  <Button
                    kind="tertiary"
                    disabled={
                      locked || !!failure || review.cursors.length === 1
                    }
                    onClick={() => readReview(true)}
                  >
                    Previous header effects
                  </Button>
                  {review.page.next_after !== false ? (
                    <Button
                      kind="tertiary"
                      disabled={locked || !!failure}
                      onClick={() => readReview()}
                    >
                      Review next header effects
                    </Button>
                  ) : (
                    <p>All effect pages reviewed.</p>
                  )}
                  <Button
                    disabled={
                      locked ||
                      !!failure ||
                      review.page.next_after !== false ||
                      !review.page.review_complete_token
                    }
                    onClick={save}
                  >
                    Save reviewed transfer header
                  </Button>
                  <Button
                    kind="tertiary"
                    disabled={locked}
                    onClick={() => setReview(null)}
                  >
                    Return to header edits
                  </Button>
                </div>
              </>
            )}
          </>
        ) : null}
        {failure ? <p role="alert">{failure.message}</p> : null}
        <div className={styles.toolbar}>
          {expired ? (
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={() => leave('reconnect')}
            >
              Reconnect Billing
            </Button>
          ) : (
            <Button
              kind="tertiary"
              disabled={busy || loaded.isFetching}
              onClick={() => leave('reload')}
            >
              Reload native header
            </Button>
          )}
          <Button
            kind="tertiary"
            disabled={busy}
            onClick={() => leave('close')}
          >
            Close header editor
          </Button>
        </div>
        {discard ? (
          <fieldset>
            <legend>Discard unsaved header changes?</legend>
            <p>No Save was sent. Your local edits and review will be lost.</p>
            <Button
              kind="danger"
              onClick={() => {
                const target = discard;
                setDiscard(null);
                executeLeave(target);
              }}
            >
              Discard header edits
            </Button>
            <Button kind="tertiary" onClick={() => setDiscard(null)}>
              Keep header edits
            </Button>
          </fieldset>
        ) : null}
      </section>
    </Modal>
  );
}
