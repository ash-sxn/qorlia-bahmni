import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  checkedPagedStockValidationRequest,
  getPagedStockValidation,
  getPagedStockValidationReview,
  getPagedStockValidationStatus,
  getPagedStockValidationPromptPage,
  getPagedStockValidationReferencePage,
  getStockValidationStepCompactStatus,
  getStockValidationStepPromptPage,
  getStockValidationStepReferencePage,
  savePagedStockValidation,
  stopPagedStockValidation,
  type PagedStockValidationLoad,
  type PagedStockValidationRequest,
  type PagedStockValidationStatus,
  type PagedStockValidationReview,
  type PagedStockValidationPromptPage,
  type PagedStockValidationReferences,
  type StockValidationStepRequest,
  type StockValidationDecision,
} from './billingService';
import {
  confirmationModelLabel,
  StockConfirmationEffects,
} from './StockConfirmationEffects';
import {
  loadStockWriteRecovery,
  loadPagedStockValidationRecovery,
  isPagedStockValidationRequest,
  persistPagedStockValidationRecovery,
  clearPagedStockValidationRecovery,
  restoreStoppedPagedStockValidationRecovery,
} from './stockReservationRecovery';
import { transferLabel as label } from './stockTransferPages';
import { StockValidationPromptRows } from './StockValidationPromptRows';

type Request = StockValidationStepRequest | PagedStockValidationRequest;
type Status = PagedStockValidationStatus;
type Props = {
  uid: number;
  orderId: number | false;
  transferId: number;
  legacyParent?: StockValidationStepRequest;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
};
type Session = {
  request: Request | null;
  outcome: Status | null;
  load: PagedStockValidationLoad | null;
  error: Error | null;
};
type Cursor = { after: number; version: string | false; token: string | false };
type Review = { page: PagedStockValidationReview; cursors: Cursor[] };
type ReadPage<T> = { page: T; readTo: number };
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
async function readStatus(request: Request): Promise<Status> {
  if (isPagedStockValidationRequest(request))
    return getPagedStockValidationStatus(request);
  const { accepted, current, ...receipt } =
    await getStockValidationStepCompactStatus(request);
  return {
    accepted,
    stopped: false,
    request_key: request.request_key,
    current,
    receipt: accepted ? receipt : false,
  };
}
async function readPrompt(request: Request, after: number, version: string) {
  if (isPagedStockValidationRequest(request))
    return getPagedStockValidationPromptPage(request, after, version, 50);
  return {
    ...(await getStockValidationStepPromptPage(request, after, version, 50)),
    receipt_key: request.request_key,
  };
}
async function readReferences(
  request: Request,
  after: number,
  version: string | false,
) {
  if (isPagedStockValidationRequest(request))
    return getPagedStockValidationReferencePage(request, after, version, 50);
  return {
    ...(await getStockValidationStepReferencePage(request, after, version, 50)),
    receipt_key: request.request_key,
  };
}
function reviewSnapshot(page: PagedStockValidationReview) {
  return [
    page.order_id,
    page.transfer_id,
    page.version,
    page.continuation_key,
    page.decisions,
    page.review_version,
    page.state_after,
    page.write_ready,
    page.input_prompt,
    page.next_step,
    page.terminal,
    page.total_count,
    page.prompt_count,
    page.effect_count,
  ];
}
export function PagedStockValidationModal(props: Props) {
  return (
    <ValidationReview
      key={`${props.uid}:${props.orderId}:${props.transferId}:${props.legacyParent?.request_key ?? ''}`}
      {...props}
    />
  );
}
function ValidationReview({
  uid,
  orderId,
  transferId,
  legacyParent,
  close,
  reconnect,
  returnFocus,
}: Props) {
  const client = useQueryClient();
  const mounted = useRef(true),
    busyRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null);
  const promptHeading = useRef<HTMLHeadingElement>(null),
    referenceHeading = useRef<HTMLHeadingElement>(null);
  const errorHeading = useRef<HTMLParagraphElement>(null),
    stopHeading = useRef<HTMLLegendElement>(null);
  const stopTrigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<Error | null>(null);
  const [local, setLocal] = useState<Session | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [prompt, setPrompt] =
    useState<ReadPage<PagedStockValidationPromptPage> | null>(null);
  const [references, setReferences] =
    useState<ReadPage<PagedStockValidationReferences> | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  const loaded = useQuery({
    queryKey: [
      'billing',
      'stock-validation-paged',
      uid,
      orderId,
      transferId,
      legacyParent?.request_key ?? false,
    ],
    queryFn: async (): Promise<Session> => {
      const pending = await loadStockWriteRecovery(uid);
      if (
        pending &&
        (pending.order_id !== orderId ||
          pending.transfer_id !== transferId ||
          (!isPagedStockValidationRequest(pending) &&
            (!legacyParent || !same(pending, legacyParent))))
      )
        throw new Error(
          'Another stock request is pending. Resume its original workflow.',
        );
      if (!pending && legacyParent)
        throw new Error(
          'The preceding recovery request changed. Return to transfers.',
        );
      const request = pending as Request | null;
      if (request) {
        try {
          if (
            isPagedStockValidationRequest(request) &&
            !same(
              (await loadPagedStockValidationRecovery(uid))?.request,
              request,
            )
          )
            throw new Error(
              'Validation history changed. Return to transfers and resume it.',
            );
          return {
            request,
            outcome: await readStatus(request),
            load: null,
            error: null,
          };
        } catch (error) {
          return {
            request,
            outcome: null,
            load: null,
            error:
              error instanceof Error
                ? error
                : new Error('Validation recovery is unavailable.'),
          };
        }
      }
      return {
        request: null,
        outcome: null,
        load: await getPagedStockValidation(orderId, transferId),
        error: null,
      };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const session = local ?? loaded.data;
  const request = session?.request ?? null,
    outcome = session?.outcome ?? null;
  const receipt =
    outcome?.receipt === false ? null : (outcome?.receipt ?? null);
  const state =
    review && session?.load
      ? session.load
      : (outcome?.current ?? session?.load);
  const error = failure ?? session?.error ?? loaded.error;
  const expired = error instanceof BillingSessionExpired;
  const locked = busy || loaded.isFetching || loaded.isError || expired;
  const allReferences =
    !!references &&
    !!receipt &&
    references.page.receipt_key === receipt.request_key &&
    references.page.total_count === receipt.reference_count &&
    references.readTo === receipt.reference_count;
  const allPrompt =
    !!prompt &&
    !!receipt &&
    prompt.page.receipt_key === receipt.request_key &&
    prompt.page.version === receipt.prompt_version &&
    prompt.page.total_count === receipt.prompt_count &&
    prompt.readTo === receipt.prompt_count;
  useEffect(() => {
    if (!loaded.isFetching) heading.current?.focus();
  }, [loaded.isFetching]);
  useEffect(() => {
    if (!busy && error) errorHeading.current?.focus();
  }, [busy, error]);
  useEffect(() => {
    if (!busy && review) reviewHeading.current?.focus();
  }, [busy, review]);
  useEffect(() => {
    if (!busy && prompt) promptHeading.current?.focus();
  }, [busy, prompt]);
  useEffect(() => {
    if (!busy && references) referenceHeading.current?.focus();
  }, [busy, references]);
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
                'Validation is unavailable. Keep the exact recovery request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const show = (value: Status, exact: Request) => {
    if (!mounted.current) return;
    setLocal({ request: exact, outcome: value, load: null, error: null });
    setReview(null);
    setPrompt(null);
    setReferences(null);
    setConfirmStop(false);
    queueMicrotask(() => {
      if (mounted.current) heading.current?.focus();
    });
  };
  const freshOutcome = async () => {
    if (
      !request ||
      !outcome ||
      !same(await loadStockWriteRecovery(uid), request)
    )
      throw new Error(
        'Recovery storage changed. Keep the exact pending request.',
      );
    const fresh = await readStatus(request);
    if (!same(fresh, outcome))
      throw new Error(
        'The native outcome changed. Check the exact request again.',
      );
    return fresh;
  };
  const checkPages = async () => {
    if (!request || !receipt || !references || !allReferences)
      throw new Error('Read every saved reference page first.');
    const page = await readReferences(request, 0, references.page.version);
    if (
      page.receipt_key !== receipt.request_key ||
      page.total_count !== receipt.reference_count
    )
      throw new Error(
        'Saved reference identity changed. Check the exact request again.',
      );
    if (receipt.next_step) {
      if (!allPrompt || !receipt.prompt_version)
        throw new Error('Read every saved native prompt page first.');
      const page = await readPrompt(request, 0, receipt.prompt_version);
      if (
        page.receipt_key !== receipt.request_key ||
        !same(page.descriptor, receipt.next_step) ||
        page.total_count !== receipt.prompt_count
      )
        throw new Error(
          'Saved prompt identity changed. Check the exact request again.',
        );
    }
  };
  const begin = (decision?: StockValidationDecision) =>
    run(async () => {
      if (
        !session ||
        error ||
        (request &&
          (!outcome?.accepted ||
            !receipt?.next_step ||
            receipt.terminal ||
            receipt.continuation_reason ||
            !decision ||
            !allPrompt ||
            !allReferences))
      )
        return;
      setReview(null);
      if (request) {
        await freshOutcome();
        await checkPages();
      }
      const load = await getPagedStockValidation(orderId, transferId);
      if (!load.write_ready || load.reason)
        throw new Error(load.reason || 'Native validation is unavailable.');
      const page = await getPagedStockValidationReview({
        order_id: orderId,
        transfer_id: transferId,
        version: load.version,
        continuation_key: request?.request_key ?? false,
        decisions: decision ? [decision] : [],
      });
      if (mounted.current) {
        setLocal({ ...session, load });
        setReview({
          page,
          cursors: [{ after: 0, version: false, token: false }],
        });
      }
    });
  const reviewPage = (previous: boolean) =>
    run(async () => {
      if (!review || error) return;
      const old = review.page;
      const cursors = previous
        ? review.cursors.slice(0, -1)
        : [
            ...review.cursors,
            {
              after: old.next_after as number,
              version: old.review_version,
              token: old.continuation_token,
            },
          ];
      if (!cursors.length || (!previous && old.next_after === false)) return;
      const cursor = cursors[cursors.length - 1];
      setReview(null);
      const page = await getPagedStockValidationReview(
        {
          order_id: old.order_id,
          transfer_id: old.transfer_id,
          version: old.version,
          continuation_key: old.continuation_key,
          decisions: old.decisions,
        },
        cursor.after,
        cursor.version,
        cursor.token,
        50,
      );
      if (!same(reviewSnapshot(page), reviewSnapshot(old)))
        throw new Error(
          'Validation review pages changed. Start the review again.',
        );
      if (mounted.current) setReview({ page, cursors });
    });
  const save = () =>
    run(async () => {
      let exact: PagedStockValidationRequest;
      if (review) {
        if (
          error ||
          !review.page.write_ready ||
          review.page.next_after !== false ||
          !review.page.review_complete_token ||
          !session?.load?.write_ready
        )
          return;
        if (request) {
          await freshOutcome();
          await checkPages();
        }
        exact = checkedPagedStockValidationRequest({
          order_id: review.page.order_id,
          transfer_id: review.page.transfer_id,
          version: review.page.version,
          continuation_key: review.page.continuation_key,
          decisions: review.page.decisions,
          review_version: review.page.review_version,
          review_complete_token: review.page.review_complete_token,
          request_key: crypto.randomUUID(),
        });
        await persistPagedStockValidationRecovery(
          uid,
          exact,
          request ?? undefined,
        );
      } else {
        if (
          !request ||
          !isPagedStockValidationRequest(request) ||
          outcome?.accepted ||
          outcome?.stopped
        )
          return;
        exact = request;
        await persistPagedStockValidationRecovery(uid, exact);
      }
      if (!mounted.current) return;
      setLocal({ request: exact, outcome: null, load: null, error: null });
      setReview(null);
      setPrompt(null);
      setReferences(null);
      show(await savePagedStockValidation(exact), exact);
    });
  const savedPage = (kind: 'prompt' | 'reference', after = 0) =>
    run(async () => {
      if (!request || !receipt || error) return;
      if (kind === 'prompt') {
        if (
          !receipt.next_step ||
          !receipt.prompt_version ||
          after > (prompt?.readTo ?? 0)
        )
          return;
        const page = await readPrompt(request, after, receipt.prompt_version);
        if (
          page.receipt_key !== receipt.request_key ||
          page.total_count !== receipt.prompt_count ||
          !same(page.descriptor, receipt.next_step)
        )
          throw new Error(
            'Saved prompt identity changed. Check the request again.',
          );
        if (mounted.current)
          setPrompt({
            page,
            readTo: Math.max(prompt?.readTo ?? 0, after + page.rows.length),
          });
      } else {
        if (after > (references?.readTo ?? 0)) return;
        const page = await readReferences(
          request,
          after,
          references?.page.version ?? false,
        );
        if (
          page.receipt_key !== receipt.request_key ||
          page.total_count !== receipt.reference_count
        )
          throw new Error(
            'Saved reference identity changed. Check the request again.',
          );
        if (mounted.current)
          setReferences({
            page,
            readTo: Math.max(references?.readTo ?? 0, after + page.rows.length),
          });
      }
    });
  const refreshAfterResolution = async () => {
    await Promise.all([
      ...[
        'reservation-recovery',
        'order-deliveries',
        'order-transfer-details',
        'charge-lines',
      ].map((key) =>
        client.invalidateQueries({
          queryKey: ['billing', key, uid],
          refetchType: 'none',
        }),
      ),
      ...[
        'inventory-transfers',
        'inventory-transfer-load',
        'inventory-transfer-detail',
      ].map((key) =>
        client.invalidateQueries({
          queryKey: ['billing', key, uid],
          refetchType: 'active',
        }),
      ),
    ]);
    if (mounted.current) close();
  };
  const finish = () =>
    run(async () => {
      if (
        !request ||
        !isPagedStockValidationRequest(request) ||
        !outcome?.accepted ||
        !receipt?.terminal ||
        !allReferences ||
        error
      )
        return;
      await freshOutcome();
      await checkPages();
      if (!mounted.current) return;
      if (await clearPagedStockValidationRecovery(uid, request))
        throw new Error('Recovery storage changed. Keep its pending request.');
      await refreshAfterResolution();
    });
  const stop = () =>
    run(async () => {
      if (
        !request ||
        !isPagedStockValidationRequest(request) ||
        !confirmStop ||
        outcome?.accepted ||
        outcome?.stopped
      )
        return;
      const value = await stopPagedStockValidation(request);
      show(value, request);
    });
  const restore = () =>
    run(async () => {
      if (
        !request ||
        !isPagedStockValidationRequest(request) ||
        !outcome?.stopped
      )
        return;
      await freshOutcome();
      if (!mounted.current) return;
      await restoreStoppedPagedStockValidationRecovery(uid, request);
      await refreshAfterResolution();
    });
  const check = () =>
    run(async () => {
      if (request) show(await readStatus(request), request);
    });
  const retryLoad = () => {
    setLocal(null);
    setReview(null);
    setPrompt(null);
    setReferences(null);
    setFailure(null);
    setConfirmStop(false);
    void loaded.refetch();
  };
  const canChoose =
    !locked &&
    !error &&
    !!outcome?.accepted &&
    !!receipt?.next_step &&
    allPrompt &&
    allReferences;
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Complete transfer validation review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Complete validation workflow"
        aria-busy={busy || loaded.isFetching}
      >
        <h2 ref={heading} tabIndex={-1}>
          Review, validate and recover
        </h2>
        <p>
          Each native action is reviewed before saving. Earlier accepted
          preparation remains saved even if a later choice is declined. Closing
          keeps pending recovery.
        </p>
        {loaded.isFetching ? (
          <p role="status">Loading native validation...</p>
        ) : null}
        {state ? (
          <>
            <h3>{state.transfer.name}</h3>
            <p>
              {orderId === false ? 'Inventory' : `Order #${orderId}`} · Transfer
              #{transferId} · Current state: {state.transfer.state} · Company:{' '}
              {label(state.transfer.company)}
            </p>
            <p>
              From: {label(state.transfer.source)} · To:{' '}
              {label(state.transfer.destination)}
            </p>
            <p>
              {state.transfer.move_count} product moves ·{' '}
              {state.transfer.operation_count} recorded operations
            </p>
          </>
        ) : null}
        {error ? (
          <p ref={errorHeading} tabIndex={-1} role="alert">
            {error.message}
          </p>
        ) : null}
        {expired ? (
          <Button onClick={reconnect}>Reconnect Billing</Button>
        ) : null}
        <Button
          kind="tertiary"
          disabled={busy || loaded.isFetching}
          onClick={retryLoad}
        >
          Reload validation and recovery
        </Button>
        {!request && session?.load?.reason ? (
          <p role="status">{session.load.reason}</p>
        ) : null}
        {!request && session?.load ? (
          <Button
            disabled={locked || !!error || !session.load.write_ready}
            onClick={() => void begin()}
          >
            Review native validation
          </Button>
        ) : null}
        {request ? (
          <>
            <p>Exact request: {request.request_key}</p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() => void check()}
            >
              Check exact validation request
            </Button>
            {!outcome?.accepted && !outcome?.stopped ? (
              <>
                <p role="status">
                  No accepted or stopped outcome is confirmed. Keep this exact
                  request. Do not start a new validation.
                </p>
                {isPagedStockValidationRequest(request) ? (
                  <>
                    <Button disabled={locked} onClick={() => void save()}>
                      Retry identical validation request
                    </Button>
                    <Button
                      ref={stopTrigger}
                      kind="tertiary"
                      disabled={locked}
                      onClick={() => {
                        setConfirmStop(true);
                        queueMicrotask(() => stopHeading.current?.focus());
                      }}
                    >
                      Stop this exact validation request
                    </Button>
                  </>
                ) : (
                  <p>
                    Return to transfers to recover this older request through
                    its original workflow.
                  </p>
                )}
              </>
            ) : null}
            {confirmStop ? (
              <fieldset>
                <legend ref={stopHeading} tabIndex={-1}>
                  Stop only request {request.request_key}?
                </legend>
                <p>
                  This prevents only an unaccepted request from applying later.
                  It does not undo earlier preparation or cancel the transfer.
                  If save already won, its accepted receipt will be recovered.
                </p>
                <Button
                  kind="tertiary"
                  disabled={locked}
                  onClick={() => {
                    setConfirmStop(false);
                    stopTrigger.current?.focus();
                  }}
                >
                  Keep pending request
                </Button>
                <Button
                  kind="danger"
                  disabled={locked}
                  onClick={() => void stop()}
                >
                  Confirm exact request stop
                </Button>
              </fieldset>
            ) : null}
            {outcome?.stopped ? (
              <>
                <p role="status">
                  This exact request is stopped.{' '}
                  {receipt
                    ? 'The prior accepted action and its native prompt remain saved.'
                    : 'No prior accepted action belongs to this request.'}
                </p>
                <Button disabled={locked} onClick={() => void restore()}>
                  {receipt
                    ? 'Recover prior saved step'
                    : 'Retire stopped request'}
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        {receipt ? (
          <>
            <p>
              Accepted action: {receipt.state_after}.{' '}
              {receipt.state_after === 'done'
                ? 'This action completed the transfer.'
                : 'Acceptance did not complete the transfer.'}{' '}
              Current state is shown separately.
            </p>
            {receipt.continuation_reason ? (
              <p role="status">{receipt.continuation_reason}</p>
            ) : null}
            <section aria-label="Saved validation references">
              <h3 ref={referenceHeading} tabIndex={-1}>
                Saved references ({receipt.reference_count})
              </h3>
              {references ? (
                <>
                  <p>
                    References {references.page.after} to{' '}
                    {references.page.after + references.page.rows.length} of{' '}
                    {references.page.total_count}.
                  </p>
                  <ul>
                    {references.page.rows.map((row) => (
                      <li key={row.key}>
                        {confirmationModelLabel(row.model)}:{' '}
                        {row.available
                          ? `${row.name} (#${row.id})`
                          : 'No longer available or not readable by this account'}
                      </li>
                    ))}
                  </ul>
                  {references.page.after > 0 ? (
                    <Button
                      kind="tertiary"
                      disabled={locked || !!error}
                      onClick={() =>
                        void savedPage(
                          'reference',
                          Math.max(0, references.page.after - 50),
                        )
                      }
                    >
                      Previous reference page
                    </Button>
                  ) : null}
                  {references.page.next_after !== false ? (
                    <Button
                      kind="tertiary"
                      disabled={locked || !!error}
                      onClick={() =>
                        void savedPage(
                          'reference',
                          references.page.next_after as number,
                        )
                      }
                    >
                      Next reference page
                    </Button>
                  ) : null}
                  <p role="status">
                    {allReferences
                      ? 'All saved reference pages have been read.'
                      : 'Read every saved reference page before continuing.'}
                  </p>
                </>
              ) : (
                <Button
                  kind="tertiary"
                  disabled={locked || !!error}
                  onClick={() => void savedPage('reference')}
                >
                  Read saved references
                </Button>
              )}
            </section>
            {receipt.next_step ? (
              <section aria-label="Saved native validation prompt">
                <h3 ref={promptHeading} tabIndex={-1}>
                  {receipt.next_step.title}
                </h3>
                <p>
                  {receipt.prompt_count} saved prompt rows. Read every page
                  before choosing the next native action.
                </p>
                {receipt.next_step.description ? (
                  <p>{receipt.next_step.description}</p>
                ) : null}
                {receipt.next_step.kind === 'receipt' ? (
                  <p>
                    From: {label(receipt.next_step.source ?? false)} · To:{' '}
                    {label(receipt.next_step.destination ?? false)}
                  </p>
                ) : null}
                {receipt.next_step.blocked_reason ? (
                  <p role="status">{receipt.next_step.blocked_reason}</p>
                ) : null}
                {prompt ? (
                  <>
                    <p>
                      Prompt rows {prompt.page.after} to{' '}
                      {prompt.page.after + prompt.page.rows.length} of{' '}
                      {prompt.page.total_count}.
                    </p>
                    <StockValidationPromptRows rows={prompt.page.rows} />
                    {prompt.page.after > 0 ? (
                      <Button
                        kind="tertiary"
                        disabled={locked || !!error}
                        onClick={() =>
                          void savedPage(
                            'prompt',
                            Math.max(0, prompt.page.after - 50),
                          )
                        }
                      >
                        Previous prompt page
                      </Button>
                    ) : null}
                    {prompt.page.next_after !== false ? (
                      <Button
                        kind="tertiary"
                        disabled={locked || !!error}
                        onClick={() =>
                          void savedPage(
                            'prompt',
                            prompt.page.next_after as number,
                          )
                        }
                      >
                        Next prompt page
                      </Button>
                    ) : null}
                    <p role="status">
                      {allPrompt
                        ? 'All saved prompt pages have been read.'
                        : 'Read every saved prompt page before continuing.'}
                    </p>
                  </>
                ) : (
                  <Button
                    kind="tertiary"
                    disabled={locked || !!error}
                    onClick={() => void savedPage('prompt')}
                  >
                    Read saved prompt
                  </Button>
                )}
                {receipt.next_step.kind === 'receipt' ? (
                  <Button
                    disabled={!canChoose}
                    onClick={() =>
                      void begin({ kind: 'receipt', confirm: true })
                    }
                  >
                    Review receipt confirmation
                  </Button>
                ) : receipt.next_step.kind === 'expiry' ? (
                  <>
                    <Button
                      kind="tertiary"
                      disabled={!canChoose}
                      onClick={() =>
                        void begin({ kind: 'expiry', proceed: false })
                      }
                    >
                      Review without expired batches
                    </Button>
                    <Button
                      kind="danger"
                      disabled={!canChoose}
                      onClick={() =>
                        void begin({ kind: 'expiry', proceed: true })
                      }
                    >
                      Review processing expired batches
                    </Button>
                  </>
                ) : receipt.next_step.kind === 'immediate' ||
                  receipt.next_step.kind === 'backorder' ? (
                  <>
                    <Button
                      disabled={!canChoose}
                      onClick={() =>
                        void begin({
                          kind:
                            receipt.next_step &&
                            receipt.next_step.kind === 'immediate'
                              ? 'immediate'
                              : 'backorder',
                          selected: true,
                        })
                      }
                    >
                      {receipt.next_step.kind === 'immediate'
                        ? 'Review immediate quantities'
                        : 'Review creating a backorder'}
                    </Button>
                    <Button
                      kind="tertiary"
                      disabled={!canChoose}
                      onClick={() =>
                        void begin({
                          kind:
                            receipt.next_step &&
                            receipt.next_step.kind === 'immediate'
                              ? 'immediate'
                              : 'backorder',
                          selected: false,
                        })
                      }
                    >
                      {receipt.next_step.kind === 'immediate'
                        ? 'Review without processing this transfer'
                        : 'Review cancelling remaining demand'}
                    </Button>
                  </>
                ) : null}
              </section>
            ) : null}
            {outcome?.accepted &&
            receipt.terminal &&
            request &&
            isPagedStockValidationRequest(request) ? (
              <Button
                disabled={locked || !!error || !allReferences}
                onClick={() => void finish()}
              >
                Finish accepted validation
              </Button>
            ) : null}
          </>
        ) : null}
        {review ? (
          <section aria-label="Complete native validation review">
            <h3 ref={reviewHeading} tabIndex={-1}>
              Validation review page {review.cursors.length}
            </h3>
            <p>
              Rows {review.page.after} to{' '}
              {Math.min(review.page.after + 50, review.page.total_count)} of{' '}
              {review.page.total_count}. Native state after this action:{' '}
              {review.page.state_after}.
            </p>
            <p>
              {review.page.prompt_count} saved input rows ·{' '}
              {review.page.effect_count} effect rows.{' '}
              {review.page.terminal
                ? 'This action ends the native prompt chain, but may decline delivery.'
                : `This action opens another native prompt: ${review.page.next_step ? review.page.next_step.title : ''}.`}
            </p>
            {review.page.prompt_rows.length ? (
              <StockValidationPromptRows rows={review.page.prompt_rows} />
            ) : null}
            <StockConfirmationEffects effects={review.page.effects} />
            {review.cursors.length > 1 ? (
              <Button
                kind="tertiary"
                disabled={locked || !!error}
                onClick={() => void reviewPage(true)}
              >
                Previous validation review page
              </Button>
            ) : null}
            {review.page.next_after !== false ? (
              <Button
                kind="tertiary"
                disabled={locked || !!error}
                onClick={() => void reviewPage(false)}
              >
                Review next validation page
              </Button>
            ) : null}
            <Button
              disabled={
                locked ||
                !!error ||
                !review.page.write_ready ||
                review.page.next_after !== false ||
                !review.page.review_complete_token
              }
              onClick={() => void save()}
            >
              Save reviewed native validation
            </Button>
          </section>
        ) : null}
        {busy ? (
          <p role="status">Checking native validation and exact recovery...</p>
        ) : null}
        <Button kind="tertiary" disabled={busy} onClick={close}>
          Close validation review
        </Button>
      </section>
    </Modal>
  );
}
