import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedStockValidationStepRequest,
  getStockValidation,
  getStockValidationStatus,
  previewStockValidationStep,
  getStockValidationStepStatus,
  saveStockValidationStep,
  saveStockValidation,
  StockValidationDecision,
  StockValidationLoad,
  StockValidationStepReview,
  StockValidationStepStatus,
  StockValidationStatus,
} from './billingService';
import {
  confirmationModelLabel,
  StockConfirmationEffects,
} from './StockConfirmationEffects';
import {
  clearStockValidationRecovery,
  loadStockValidationRecovery,
  persistStockValidationRecovery,
  replaceStockValidationRecovery,
  isStockValidationStepRequest,
  StockValidationRecoveryRequest,
} from './stockReservationRecovery';
import { StockValidationStep } from './StockValidationStep';

type Props = {
  uid: number;
  orderId: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
};
export function StockValidationModal(props: Props) {
  return (
    <ValidationReview
      key={`${props.uid}:${props.orderId}:${props.transferId}`}
      {...props}
    />
  );
}
const decisionLabel = (decision: StockValidationDecision) =>
  decision.kind === 'receipt'
    ? 'Receipt review confirmed'
    : decision.kind === 'expiry'
      ? decision.proceed
        ? 'Process expired batches'
        : 'Do not process expired batches'
      : decision.kind === 'immediate'
        ? decision.selected
          ? 'Apply immediate quantities'
          : 'Do not process this immediate transfer'
        : decision.selected
          ? 'Create a backorder'
          : 'Cancel remaining demand';
const label = (relation: [number, string] | false) =>
  relation ? relation[1] : 'Not set';
const isStepStatus = (
  value: StockValidationStatus | StockValidationStepStatus,
): value is StockValidationStepStatus => 'terminal' in value;
function ValidationReview({
  uid,
  orderId,
  transferId,
  close,
  reconnect,
  returnFocus,
}: Props) {
  const client = useQueryClient();
  const mounted = useRef(true),
    busyRef = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null),
    receiptHeading = useRef<HTMLHeadingElement>(null),
    errorMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    StockValidationRecoveryRequest | null | undefined
  >(undefined);
  const [current, setCurrent] = useState<StockValidationLoad | null>(null);
  const [review, setReview] = useState<StockValidationStepReview | null>(null);
  const [receipt, setReceipt] = useState<
    StockValidationStatus | StockValidationStepStatus | null
  >(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const loaded = useQuery({
    queryKey: ['billing', 'stock-validation', uid, orderId, transferId],
    queryFn: async () => {
      const request = await loadStockValidationRecovery(uid);
      const state = await getStockValidation(
        request?.order_id ?? orderId,
        request?.transfer_id ?? transferId,
      );
      return { request, state };
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const request =
    pending === undefined ? (loaded.data?.request ?? null) : pending;
  const state = current ?? loaded.data?.state;
  const stepReceipt = receipt && isStepStatus(receipt) ? receipt : null;
  const continuing = !!(
    review &&
    request &&
    isStockValidationStepRequest(request) &&
    review.continuation_key === request.request_key &&
    stepReceipt?.accepted
  );
  const exactStatus = (value: StockValidationRecoveryRequest) =>
    isStockValidationStepRequest(value)
      ? getStockValidationStepStatus(value)
      : getStockValidationStatus(value);
  useEffect(() => {
    const target = failure
      ? errorMessage.current
      : review
        ? reviewHeading.current
        : receipt
          ? receiptHeading.current
          : null;
    target?.focus();
  }, [failure, receipt, review, request]);
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  const locked = busy || loaded.isFetching || loaded.isError || expired;
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
                'Validation status is unavailable. Check the exact request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const preview = (decision?: StockValidationDecision) =>
    run(async () => {
      if (!state || state.reason || !state.write_ready) return;
      if (
        request &&
        (!isStockValidationStepRequest(request) ||
          !stepReceipt?.next_step ||
          !decision)
      )
        return;
      setReview(null);
      const accepted = request ? await exactStatus(request) : null;
      if (!mounted.current) return;
      if (
        accepted &&
        (!isStepStatus(accepted) ||
          !accepted.accepted ||
          !accepted.next_step ||
          accepted.terminal)
      )
        throw new Error(
          'The saved native prompt is unavailable. Check the exact request before continuing.',
        );
      const latest = accepted?.current ?? state;
      const value = await previewStockValidationStep({
        order_id: latest.order_id,
        transfer_id: latest.transfer_id,
        version: latest.version,
        continuation_key: request?.request_key ?? false,
        decisions: decision ? [decision] : [],
      });
      if (mounted.current) {
        if (accepted) setReceipt(accepted);
        setCurrent(latest);
        setReview(value);
      }
    });
  const show = (result: StockValidationStatus | StockValidationStepStatus) => {
    if (!mounted.current) return;
    setCurrent(result.current);
    setReview(null);
    setReceipt(result.accepted ? result : null);
    setNotice(
      result.accepted
        ? 'The exact reviewed action was accepted. Read its native result below; acceptance does not always mean delivery.'
        : 'No receipt found yet. This does not prove the original request stopped. Check again or retry only the identical request.',
    );
  };
  const save = () =>
    run(async () => {
      if (receipt && !review) return;
      let exact = request;
      if (review) {
        if (
          !review.write_ready ||
          !state?.write_ready ||
          failure ||
          (request && !continuing)
        )
          return;
        const next = checkedStockValidationStepRequest({
          order_id: review.order_id,
          transfer_id: review.transfer_id,
          version: review.version,
          decisions: review.decisions,
          review_version: review.review_version,
          request_key: crypto.randomUUID(),
          continuation_key: review.continuation_key,
        });
        exact = next;
        if (continuing && request && isStockValidationStepRequest(request)) {
          const accepted = await getStockValidationStepStatus(request);
          if (!mounted.current) return;
          if (!accepted.accepted || !accepted.next_step || accepted.terminal)
            throw new Error(
              'The saved native prompt is unavailable. Keep its exact recovery request.',
            );
          await replaceStockValidationRecovery(uid, request, next);
        } else await persistStockValidationRecovery(uid, exact);
      } else {
        if (!exact) return;
        await persistStockValidationRecovery(uid, exact);
      }
      if (!mounted.current) return;
      setPending(exact);
      setReview(null);
      setReceipt(null);
      try {
        show(
          await (isStockValidationStepRequest(exact)
            ? saveStockValidationStep(exact)
            : saveStockValidation(exact)),
        );
      } catch (error) {
        if (error instanceof BillingActionRejected) {
          if (await clearStockValidationRecovery(uid, exact))
            throw new Error(
              'Recovery storage changed. Check the previous request before starting another step.',
            );
          if (mounted.current) {
            setPending(null);
            setReview(null);
          }
          await client.invalidateQueries({
            queryKey: ['billing', 'stock-validation', uid],
            refetchType: 'none',
          });
        }
        throw error;
      }
    });
  const finish = () =>
    run(async () => {
      if (!request) return;
      const result = await exactStatus(request);
      if (!result.accepted)
        throw new Error(
          'Accepted validation receipt unavailable. Keep this recovery request.',
        );
      if (await clearStockValidationRecovery(uid, request))
        throw new Error(
          'Recovery storage changed. Keep the pending request and reload its status.',
        );
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['billing', 'order-deliveries', uid],
        }),
        client.invalidateQueries({
          queryKey: ['billing', 'reservation-recovery', uid],
        }),
        ...[
          'stock-validation',
          'stock-confirmation',
          'stock-reservation',
          'stock-operation',
        ].map((key) =>
          client.invalidateQueries({
            queryKey: ['billing', key, uid],
            refetchType: 'none',
          }),
        ),
      ]);
      if (mounted.current) close();
    });
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Transfer validation review"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Transfer validation review"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Review the native receipt, immediate-transfer, backorder or expiry
          decisions one native action at a time. Previews are rolled back. Each
          saved step commits its reviewed effects. Closing the next prompt does
          not undo earlier preparation. Validation can move stock and create
          valuation or accounting records.
        </p>
        {loaded.isFetching ? (
          <p role="status">
            Reading native validation state and recovery request...
          </p>
        ) : loaded.isError ? (
          <p role="alert">{loaded.error.message}</p>
        ) : state ? (
          <>
            <h2>{state.graph.transfer.name}</h2>
            <p>
              Order #{state.order_id} · Transfer #{state.transfer_id} · Current
              state: {state.graph.transfer.state} · Company:{' '}
              {label(state.graph.transfer.company)}
            </p>
            <p>
              From: {label(state.graph.transfer.source)} · To:{' '}
              {label(state.graph.transfer.destination)}
            </p>
            {request &&
            (request.order_id !== orderId ||
              request.transfer_id !== transferId) ? (
              <p role="status">
                A previous validation for this order and transfer must be
                resolved before starting another stock action.
              </p>
            ) : null}
            {request && !isStockValidationStepRequest(request) ? (
              <p role="status">
                A legacy atomic validation request is stored. Recover that exact
                request before starting the new step-by-step workflow.
              </p>
            ) : null}
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Current transfer quantities"
              tabIndex={0}
            >
              <table>
                <caption>Current saved quantities in the unit shown</caption>
                <thead>
                  <tr>
                    {[
                      'Product',
                      'Unit',
                      'Demand',
                      'Reserved',
                      'Recorded done',
                    ].map((title) => (
                      <th scope="col" key={title}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.graph.transfer.moves.map((move) => (
                    <tr key={move.id}>
                      <td>{label(move.product)}</td>
                      <td>{label(move.unit)}</td>
                      <td>{move.demand}</td>
                      <td>{move.reserved}</td>
                      <td>{move.done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!request ? (
              <>
                {state.reason ? <p>{state.reason}</p> : null}
                {!state.write_ready ? (
                  <p>
                    Native validation saving is not available in this adapter.
                  </p>
                ) : null}
                {!review ? (
                  <Button
                    kind="tertiary"
                    disabled={
                      locked ||
                      !!state.reason ||
                      !state.write_ready ||
                      !!failure
                    }
                    onClick={() => void preview()}
                  >
                    Review native validation
                  </Button>
                ) : null}
              </>
            ) : null}
            {review && (!request || continuing) ? (
              <>
                <h3 ref={reviewHeading} tabIndex={-1}>
                  Validation preview
                </h3>
                <p>
                  Previewed native state after this action: {review.state_after}
                  . These effects are not saved yet. Earlier accepted steps
                  remain saved.
                </p>
                <section aria-label="Reviewed validation decisions">
                  <h3>This step</h3>
                  {review.decisions.length ? (
                    <ol>
                      {review.decisions.map((decision, index) => (
                        <li
                          key={JSON.stringify(
                            review.decisions.slice(0, index + 1),
                          )}
                        >
                          {decisionLabel(decision)}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>
                      Open the native Validate action. No prompt decision is
                      being processed yet.
                    </p>
                  )}
                </section>
                {review.next_step ? (
                  <p>
                    Next native prompt after saving: {review.next_step.title}.
                    Its decision is not processed by this save.
                  </p>
                ) : null}
                <StockConfirmationEffects effects={review.effects} />
                {review.state_after !== 'done' ? (
                  <p role="status">
                    This reviewed action leaves the transfer{' '}
                    {review.state_after}. It does not complete delivery.
                  </p>
                ) : null}
                <Button
                  disabled={
                    locked ||
                    !!failure ||
                    !review.write_ready ||
                    !state.write_ready
                  }
                  onClick={() => void save()}
                >
                  Save reviewed validation step
                </Button>
                <Button
                  kind="tertiary"
                  disabled={locked || !!failure}
                  onClick={() => setReview(null)}
                >
                  {request
                    ? 'Back to saved native prompt'
                    : 'Discard validation preview'}
                </Button>
              </>
            ) : null}
            {receipt && !review ? (
              <section aria-label="Saved validation references">
                <h3 ref={receiptHeading} tabIndex={-1}>
                  Accepted native validation action: {receipt.state_after}
                </h3>
                {receipt.state_after !== 'done' ? (
                  <p>
                    The transfer was not completed. The reviewed preparation or
                    other native effects may still have been saved.
                  </p>
                ) : null}
                <ul>
                  {Object.entries(receipt.references).map(([key, item]) => (
                    <li key={key}>
                      {confirmationModelLabel(item.model)}:{' '}
                      {item.available
                        ? `${item.name} (#${item.id})`
                        : 'No longer available or not readable by this account'}
                    </li>
                  ))}
                </ul>
                {!Object.keys(receipt.references).length ? (
                  <p>No new business document references were created.</p>
                ) : null}
                {stepReceipt?.continuation_reason ? (
                  <p role="status">{stepReceipt.continuation_reason}</p>
                ) : null}
                {stepReceipt?.next_step ? (
                  <StockValidationStep
                    key={JSON.stringify([
                      request?.request_key,
                      stepReceipt.next_step.kind,
                      stepReceipt.next_step.transfers,
                    ])}
                    step={stepReceipt.next_step}
                    disabled={
                      locked ||
                      !!failure ||
                      !!state.reason ||
                      !state.write_ready
                    }
                    choose={(decision) => void preview(decision)}
                  />
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
        {request ? (
          <>
            <p>
              Request: {request.request_key}.{' '}
              {receipt
                ? 'The exact native receipt is available.'
                : 'The request may already have been saved. No write is retried automatically.'}
            </p>
            <Button
              kind="tertiary"
              disabled={locked}
              onClick={() =>
                void run(async () => show(await exactStatus(request)))
              }
            >
              Check validation request
            </Button>
            {!receipt && !review ? (
              <Button
                kind="danger"
                disabled={locked}
                onClick={() => void save()}
              >
                Retry identical validation request
              </Button>
            ) : !review ? (
              <Button
                kind="tertiary"
                disabled={locked}
                onClick={() => void finish()}
              >
                {stepReceipt && !stepReceipt.terminal
                  ? 'Close saved prompt and reload transfers'
                  : 'Finish and reload transfers'}
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            kind="tertiary"
            disabled={busy || expired}
            onClick={() => {
              if (busyRef.current) return;
              setReview(null);
              setReceipt(null);
              setCurrent(null);
              setPending(undefined);
              setFailure(null);
              setNotice('');
              void loaded.refetch();
            }}
          >
            Reload validation state
          </Button>
        )}
        {failure ? (
          <p ref={errorMessage} tabIndex={-1} role="alert">
            {failure.message}
          </p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        {expired ? (
          <Button kind="tertiary" disabled={busy} onClick={reconnect}>
            Reconnect Billing
          </Button>
        ) : null}
        <Button
          kind="tertiary"
          disabled={busy}
          onClick={() => {
            if (!busyRef.current) close();
          }}
        >
          Back to stock transfers
        </Button>
      </section>
    </Modal>
  );
}
