import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  getInventoryStoredSaveStatus,
  getInventoryStoredSaveReferences,
  saveInventoryStoredForm,
  stopInventoryStoredSave,
  type InventoryStoredSaveRequest,
  type InventoryStoredSaveStatus,
  type PagedStockConfirmationReferences,
} from './billingService';
import { confirmationModelLabel } from './StockConfirmationEffects';
import {
  loadInventoryStoredSaveRecovery,
  persistInventoryStoredSaveRecovery,
  clearInventoryStoredSaveRecovery,
} from './stockReservationRecovery';
import { transferStates } from './stockTransferPages';

export type InventoryHeaderRecoveryProps = {
  uid: number;
  transferId: number;
  close: () => void;
  reconnect: () => void;
  returnFocus?: () => void;
  initial?: { request: InventoryStoredSaveRequest; error: Error | null };
};
export function InventoryHeaderRecovery(props: InventoryHeaderRecoveryProps) {
  return <Recovery key={`${props.uid}:${props.transferId}`} {...props} />;
}
function Recovery({
  uid,
  transferId,
  close,
  reconnect,
  returnFocus,
  initial,
}: InventoryHeaderRecoveryProps) {
  const mounted = useRef(true),
    busyRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null),
    stopTrigger = useRef<HTMLButtonElement>(null),
    stopHeading = useRef<HTMLLegendElement>(null),
    restoreStopFocus = useRef(false);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<Error | null>(initial?.error ?? null);
  const [outcome, setOutcome] = useState<InventoryStoredSaveStatus | null>(
    null,
  );
  const [references, setReferences] = useState<{
    page: PagedStockConfirmationReferences;
    cursors: number[];
  } | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const loaded = useQuery({
    queryKey: [
      'billing',
      'inventory-header-recovery',
      uid,
      transferId,
      initial?.request,
    ],
    queryFn: async () => {
      const stored = await loadInventoryStoredSaveRecovery(uid);
      if (
        initial &&
        stored &&
        JSON.stringify(stored) !== JSON.stringify(initial.request)
      )
        throw new Error(
          'The pending transfer request changed. Return to Billing and resume the original request.',
        );
      const request = stored ?? initial?.request ?? null;
      if (request && request.transfer_id !== transferId)
        throw new Error(
          'A header save for another transfer is pending. Resume it from Billing.',
        );
      return request;
    },
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const request = loaded.data;
  const locked = busy || loaded.isFetching || loaded.isError;
  const expired =
    failure instanceof BillingSessionExpired ||
    loaded.error instanceof BillingSessionExpired;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      returnFocus?.();
    };
  }, [returnFocus]);
  useEffect(() => {
    if (outcome) heading.current?.focus();
  }, [outcome]);
  useEffect(() => {
    if (confirmStop) stopHeading.current?.focus();
    else if (restoreStopFocus.current) {
      restoreStopFocus.current = false;
      stopTrigger.current?.focus();
    }
  }, [confirmStop]);
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
                'Recovery is unavailable. Keep the exact saved request.',
              ),
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const showOutcome = (value: InventoryStoredSaveStatus) => {
    if (!mounted.current) return;
    setOutcome(value);
    setReferences(null);
    setConfirmStop(false);
  };
  const check = () =>
    void run(async () => {
      if (!request) return;
      setOutcome(null);
      setReferences(null);
      showOutcome(await getInventoryStoredSaveStatus(request));
    });
  const write = (stop: boolean) =>
    void run(async () => {
      if (
        !request ||
        outcome?.accepted ||
        outcome?.stopped ||
        (stop && !confirmStop)
      )
        return;
      // Recheck this exact durable slot and account before any explicit retry or Stop.
      await persistInventoryStoredSaveRecovery(uid, request);
      if (!mounted.current) return;
      setOutcome(null);
      setReferences(null);
      showOutcome(
        await (stop
          ? stopInventoryStoredSave(request)
          : saveInventoryStoredForm(request)),
      );
    });
  const readReferences = (previous = false) =>
    void run(async () => {
      if (!request || !outcome?.accepted) return;
      const old = references?.page;
      if (!previous && old?.next_after === false) return;
      const cursors = references
        ? previous
          ? references.cursors.slice(0, -1)
          : [...references.cursors, references.page.next_after as number]
        : [0];
      if (!cursors.length) return;
      setReferences(null);
      const page = await getInventoryStoredSaveReferences(
        request,
        cursors.at(-1)!,
        old?.version ?? false,
      );
      if (page.total_count !== outcome.reference_count)
        throw new Error(
          'Saved reference counts changed. Check the exact request outcome again.',
        );
      if (mounted.current) setReferences({ page, cursors });
    });
  const allRead =
    outcome?.stopped === true ||
    (outcome?.accepted &&
      (outcome.reference_count === 0 || references?.page.next_after === false));
  const finish = () =>
    void run(async () => {
      if (!request || !allRead) return;
      await clearInventoryStoredSaveRecovery(uid, request);
      await Promise.all(
        [
          'reservation-recovery',
          'inventory-transfers',
          'inventory-transfer-load',
          'inventory-transfer-detail',
          'inventory-header-form',
        ].map((key) =>
          client.invalidateQueries({ queryKey: ['billing', key, uid] }),
        ),
      );
      if (mounted.current) close();
    });
  return (
    <Modal
      open
      passiveModal
      size="lg"
      modalHeading="Transfer header save recovery"
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section
        className={styles.card}
        aria-label="Transfer header save recovery"
        aria-busy={busy || loaded.isFetching}
      >
        <p>
          Transfer #{transferId}. Opening recovery never repeats a save. Stop
          prevents a still-pending request; it does not undo an accepted save or
          cancel this transfer.
        </p>
        {loaded.isFetching ? (
          <p role="status">Loading the exact saved request...</p>
        ) : null}
        {loaded.error ? (
          <p role="alert">
            {loaded.error.message} Recovery has not been cleared.
          </p>
        ) : null}
        {!loaded.isFetching && !loaded.isError && !request ? (
          <p>
            No pending header save was found. Return to the transfer to edit its
            header.
          </p>
        ) : null}
        {request ? (
          <>
            <p>
              Request: {request.request_key}. Keep browser data until this
              request is resolved.
            </p>
            <details>
              <summary>Saved ordered field inputs</summary>
              <p>
                {request.edits.length} ordered edits retained with the original
                review proof. Occurrence numbers refer to the original native
                form, not a later configuration. Do not copy these private
                inputs to a public report.
              </p>
              <ol>
                {Array.from(request.edits.entries()).map(([position, edit]) => (
                  <li key={`input:${position}`}>
                    Native field occurrence #{edit.node}
                    <pre className={styles.messageBody}>
                      {JSON.stringify(edit.value)}
                    </pre>
                  </li>
                ))}
              </ol>
            </details>
            <h3 ref={heading} tabIndex={-1}>
              Save outcome
            </h3>
            <p role="status">
              {outcome?.accepted
                ? `The exact save was accepted. Saved state: ${transferStates[outcome.state_after as keyof typeof transferStates] ?? outcome.state_after}. Current transfer: ${outcome.current.transfer.name}.`
                : outcome?.stopped
                  ? 'The exact pending request was stopped. No accepted save was undone.'
                  : 'Acceptance is not confirmed. This does not mean the save failed.'}
            </p>
            {outcome?.accepted ? (
              <>
                <p>
                  Changed fields: {outcome.changed_fields.join(', ') || 'None'}.
                  Generated references: {outcome.reference_count}.
                </p>
                {references ? (
                  <ul>
                    {references.page.rows.map((row) => (
                      <li key={row.key}>
                        {confirmationModelLabel(row.model)}:{' '}
                        {row.available
                          ? `${row.name} (#${row.id})`
                          : 'Not available to this account'}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {outcome.reference_count > 0 ? (
                  <div className={styles.toolbar}>
                    <Button
                      kind="tertiary"
                      disabled={
                        locked || !references || references.cursors.length < 2
                      }
                      onClick={() => readReferences(true)}
                    >
                      Previous saved references
                    </Button>
                    <Button
                      kind="tertiary"
                      disabled={locked || references?.page.next_after === false}
                      onClick={() => readReferences()}
                    >
                      {references
                        ? 'Next saved references'
                        : 'Read saved references'}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className={styles.toolbar}>
              <Button disabled={locked} onClick={check}>
                Check exact save outcome
              </Button>
              {!outcome?.accepted && !outcome?.stopped ? (
                <>
                  <Button
                    kind="tertiary"
                    disabled={locked || expired || !!confirmStop}
                    onClick={() => write(false)}
                  >
                    Retry exact header save
                  </Button>
                  <Button
                    ref={stopTrigger}
                    kind="danger"
                    disabled={locked || expired || confirmStop}
                    onClick={() => setConfirmStop(true)}
                  >
                    Stop pending header request
                  </Button>
                </>
              ) : null}
              {allRead ? (
                <Button disabled={locked || !!failure} onClick={finish}>
                  Finish and reload transfer
                </Button>
              ) : null}
            </div>
            {confirmStop ? (
              <fieldset>
                <legend ref={stopHeading} tabIndex={-1}>
                  Stop request {request.request_key} for transfer #{transferId}?
                </legend>
                <p>
                  This cannot undo a save already accepted by the server. If
                  Save won the race, its accepted result will be recovered.
                </p>
                <Button
                  kind="danger"
                  disabled={locked}
                  onClick={() => write(true)}
                >
                  Confirm stop of this request
                </Button>
                <Button
                  kind="tertiary"
                  disabled={locked}
                  onClick={() => {
                    restoreStopFocus.current = true;
                    setConfirmStop(false);
                  }}
                >
                  Keep pending request
                </Button>
              </fieldset>
            ) : null}
          </>
        ) : null}
        {busy ? (
          <p role="status">Checking or resolving the exact request...</p>
        ) : null}
        {failure ? (
          <p role="alert">{failure.message} The exact request is retained.</p>
        ) : null}
        {expired ? (
          <Button kind="tertiary" disabled={busy} onClick={reconnect}>
            Reconnect Billing, retaining recovery
          </Button>
        ) : null}
        {loaded.isError ? (
          <Button
            kind="tertiary"
            disabled={busy || loaded.isFetching}
            onClick={() => void loaded.refetch()}
          >
            Reload saved header request
          </Button>
        ) : null}
        <Button kind="tertiary" disabled={busy} onClick={close}>
          Close and retain unresolved recovery
        </Button>
      </section>
    </Modal>
  );
}
