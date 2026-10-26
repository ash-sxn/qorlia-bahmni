import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getStockValidationStepCompactStatus,
  getStockValidationStepPromptPage,
  getStockValidationStepReferencePage,
  type PagedStockConfirmationReferences,
  type StockValidationPromptPage,
  type StockValidationStepRequest,
} from './billingService';
import { confirmationModelLabel } from './StockConfirmationEffects';
import {
  clearStockValidationRecovery,
  loadStockValidationRecovery,
} from './stockReservationRecovery';
import { transferLabel as label } from './stockTransferPages';
import { StockValidationPromptRows } from './StockValidationPromptRows';

type Props = {
  uid: number;
  request: StockValidationStepRequest;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
  continueReview: () => void;
  continueCompleteReview?: () => void;
};
type Page<T> = { page: T; readTo: number };

export function SavedValidationRecoveryModal({
  uid,
  request,
  close,
  reconnect,
  returnFocus,
  continueReview,
  continueCompleteReview,
}: Props) {
  const client = useQueryClient();
  const mounted = useRef(true),
    busyRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const promptHeading = useRef<HTMLHeadingElement>(null);
  const referenceHeading = useRef<HTMLHeadingElement>(null);
  const errorHeading = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const [prompt, setPrompt] = useState<Page<StockValidationPromptPage> | null>(
    null,
  );
  const [references, setReferences] =
    useState<Page<PagedStockConfirmationReferences> | null>(null);
  const status = useQuery({
    queryKey: ['billing', 'saved-validation-recovery', uid, request],
    queryFn: async () => {
      const stored = await loadStockValidationRecovery(uid);
      if (JSON.stringify(stored) !== JSON.stringify(request))
        throw new Error(
          'Recovery storage changed. Return to transfers and resume the stored request.',
        );
      return getStockValidationStepCompactStatus(request);
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  useEffect(() => {
    if (!status.isFetching) heading.current?.focus();
  }, [status.isFetching]);
  useEffect(() => {
    if (!busy && failure) errorHeading.current?.focus();
  }, [busy, failure]);
  const outcome = status.data;
  const expired =
    failure instanceof BillingSessionExpired ||
    status.error instanceof BillingSessionExpired;
  const locked = busy || status.isFetching || status.isError || expired;
  const allReferences =
    !!references &&
    references.page.total_count === outcome?.reference_count &&
    references.readTo === references.page.total_count;
  const allPrompt =
    !!prompt &&
    prompt.page.version === outcome?.prompt_version &&
    prompt.page.total_count === outcome.prompt_count &&
    prompt.readTo === prompt.page.total_count;
  const legacySize =
    !!outcome &&
    outcome.current.transfer.move_count <= 500 &&
    outcome.current.transfer.operation_count <= 2000;
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current || status.isFetching || status.isError || expired)
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
                'Saved validation recovery is unavailable. Keep the original request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const readPrompt = (after = 0) =>
    run(async () => {
      if (!outcome?.next_step || !outcome.prompt_version) return;
      if (after > 0 && prompt?.page.version !== outcome.prompt_version)
        throw new Error(
          'The saved prompt changed. Check the request again before reading its pages.',
        );
      const page = await getStockValidationStepPromptPage(
        request,
        after,
        outcome.prompt_version,
        50,
      );
      if (
        page.total_count !== outcome.prompt_count ||
        page.descriptor.kind !== outcome.next_step.kind
      )
        throw new Error(
          'The saved prompt changed. Check the request again before reading its pages.',
        );
      if (!mounted.current) return;
      setPrompt({
        page,
        readTo: Math.max(
          prompt?.page.version === page.version ? prompt.readTo : 0,
          after + page.rows.length,
        ),
      });
      promptHeading.current?.focus();
    });
  const readReferences = (after = 0) =>
    run(async () => {
      if (!outcome?.accepted) return;
      const page = await getStockValidationStepReferencePage(
        request,
        after,
        references?.page.version ?? false,
        50,
      );
      if (page.total_count !== outcome.reference_count)
        throw new Error(
          'The saved references changed. Check the request again before reading their pages.',
        );
      if (!mounted.current) return;
      setReferences({
        page,
        readTo: Math.max(references?.readTo ?? 0, after + page.rows.length),
      });
      referenceHeading.current?.focus();
    });
  const resolve = (finish: boolean) =>
    run(async () => {
      if (!outcome || !references || !allReferences || failure) return;
      if (
        finish
          ? !outcome.accepted || !outcome.terminal
          : !outcome.next_step ||
            outcome.next_step.kind === 'sms' ||
            !allPrompt ||
            (!legacySize && !continueCompleteReview)
      )
        return;
      const current = await getStockValidationStepCompactStatus(request);
      if (
        !current.accepted ||
        current.state_after !== outcome.state_after ||
        current.reference_count !== outcome.reference_count ||
        current.terminal !== outcome.terminal ||
        current.prompt_version !== outcome.prompt_version ||
        current.current.version !== outcome.current.version
      )
        throw new Error(
          'The validation outcome changed. Check the exact request again before continuing.',
        );
      await getStockValidationStepReferencePage(
        request,
        0,
        references.page.version,
        50,
      );
      if (!mounted.current) return;
      if (!finish) {
        (continueCompleteReview ?? continueReview)();
        return;
      }
      if (await clearStockValidationRecovery(uid, request))
        throw new Error(
          'Recovery storage changed. Keep the pending request and reload its status.',
        );
      await client.invalidateQueries({
        queryKey: ['billing', 'reservation-recovery', uid],
        refetchType: 'none',
      });
      await client.invalidateQueries({
        queryKey: ['billing', 'order-deliveries', uid],
        refetchType: 'none',
      });
      if (mounted.current) close();
    });
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Saved validation recovery"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Saved validation recovery"
        aria-busy={busy || status.isFetching}
      >
        <h2 ref={heading} tabIndex={-1}>
          Exact saved validation request
        </h2>
        <p>
          Request: {request.request_key}. Reading does not retry a write,
          recreate a prompt or change stock. Closing keeps the recovery request.
        </p>
        {status.isFetching ? (
          <p role="status">Checking the exact native receipt...</p>
        ) : status.isError ? (
          <p role="alert">{status.error.message}</p>
        ) : outcome ? (
          <>
            <h3>{outcome.current.transfer.name}</h3>
            <p>
              Order #{request.order_id} · Transfer #{request.transfer_id} ·
              Current state: {outcome.current.transfer.state} · Company:{' '}
              {label(outcome.current.transfer.company)}
            </p>
            <p>
              From: {label(outcome.current.transfer.source)} · To:{' '}
              {label(outcome.current.transfer.destination)}
            </p>
            <p>
              {outcome.current.transfer.move_count} product moves ·{' '}
              {outcome.current.transfer.operation_count} recorded operations
            </p>
            {!outcome.accepted ? (
              <>
                <p role="status">
                  No receipt found yet. This does not prove the original write
                  stopped. Keep this exact request; do not start a new
                  validation.
                </p>
                {legacySize ? (
                  <Button
                    kind="tertiary"
                    disabled={locked}
                    onClick={continueReview}
                  >
                    Open identical-request recovery
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <p>
                  Accepted native action: {outcome.state_after}.{' '}
                  {outcome.state_after !== 'done'
                    ? 'The accepted action did not complete the transfer.'
                    : 'The accepted action completed the transfer.'}{' '}
                  Current transfer state is shown separately.
                </p>
                <section aria-label="Saved validation document references">
                  <h3 ref={referenceHeading} tabIndex={-1}>
                    Business references ({outcome.reference_count})
                  </h3>
                  {references ? (
                    <>
                      <p>
                        References{' '}
                        {references.page.total_count
                          ? references.page.after + 1
                          : 0}{' '}
                        to {references.page.after + references.page.rows.length}{' '}
                        of {references.page.total_count}.
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
                      {!references.page.total_count ? (
                        <p>No new business document references were created.</p>
                      ) : null}
                      {references.page.after > 0 ? (
                        <Button
                          kind="tertiary"
                          disabled={locked || !!failure}
                          onClick={() =>
                            void readReferences(
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
                          disabled={locked || !!failure}
                          onClick={() =>
                            void readReferences(
                              references.page.next_after as number,
                            )
                          }
                        >
                          Next reference page
                        </Button>
                      ) : null}
                      <p role="status">
                        {allReferences
                          ? 'All reference pages have been read.'
                          : 'Read every reference page before finishing or continuing.'}
                      </p>
                    </>
                  ) : (
                    <Button
                      kind="tertiary"
                      disabled={locked || !!failure}
                      onClick={() => void readReferences()}
                    >
                      Read saved references
                    </Button>
                  )}
                </section>
                {outcome.continuation_reason ? (
                  <p role="status">{outcome.continuation_reason}</p>
                ) : null}
                {outcome.next_step ? (
                  <section aria-label="Saved native validation prompt">
                    <h3 ref={promptHeading} tabIndex={-1}>
                      {outcome.next_step.title}
                    </h3>
                    <p>
                      {outcome.prompt_count} saved prompt rows. Earlier accepted
                      effects remain saved. This reader never processes the
                      prompt.
                    </p>
                    {outcome.next_step.kind === 'receipt' ? (
                      <p>
                        From: {label(outcome.next_step.source ?? false)} · To:{' '}
                        {label(outcome.next_step.destination ?? false)}
                      </p>
                    ) : null}
                    {outcome.next_step.description ? (
                      <p>{outcome.next_step.description}</p>
                    ) : null}
                    {outcome.next_step.blocked_reason ? (
                      <p role="status">{outcome.next_step.blocked_reason}</p>
                    ) : null}
                    {prompt ? (
                      <>
                        <p>
                          Prompt rows{' '}
                          {prompt.page.total_count ? prompt.page.after + 1 : 0}{' '}
                          to {prompt.page.after + prompt.page.rows.length} of{' '}
                          {prompt.page.total_count}.
                        </p>
                        <StockValidationPromptRows rows={prompt.page.rows} />
                        {prompt.page.after > 0 ? (
                          <Button
                            kind="tertiary"
                            disabled={locked || !!failure}
                            onClick={() =>
                              void readPrompt(
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
                            disabled={locked || !!failure}
                            onClick={() =>
                              void readPrompt(prompt.page.next_after as number)
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
                        disabled={locked || !!failure}
                        onClick={() => void readPrompt()}
                      >
                        Read saved prompt
                      </Button>
                    )}
                    {(legacySize || continueCompleteReview) &&
                    outcome.next_step.kind !== 'sms' ? (
                      <Button
                        disabled={
                          locked || !!failure || !allPrompt || !allReferences
                        }
                        onClick={() => void resolve(false)}
                      >
                        Continue saved native workflow
                      </Button>
                    ) : null}
                  </section>
                ) : null}
                {outcome.terminal ? (
                  <Button
                    disabled={locked || !!failure || !allReferences}
                    onClick={() => void resolve(true)}
                  >
                    Finish recovered validation and reload transfers
                  </Button>
                ) : null}
              </>
            )}
            {!legacySize ? (
              <p role="status">
                This transfer exceeds the current validation writer limits. Its
                saved outcome remains readable here. Large-transfer validation
                and retry are not enabled yet; the original request stays
                stored.
              </p>
            ) : null}
          </>
        ) : null}
        {failure ? (
          <p role="alert" ref={errorHeading} tabIndex={-1}>
            {failure.message}
          </p>
        ) : null}
        {expired ? (
          <Button kind="tertiary" disabled={busy} onClick={reconnect}>
            Reconnect Billing
          </Button>
        ) : (
          <Button
            kind="tertiary"
            disabled={busy || status.isFetching}
            onClick={() => {
              setFailure(null);
              setPrompt(null);
              setReferences(null);
              void status.refetch();
            }}
          >
            Check exact validation request
          </Button>
        )}
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
