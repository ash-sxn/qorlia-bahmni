import { Button, Modal } from '@bahmni/design-system';
import { useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import { BillingSessionExpired, InvoiceWorkflow } from './billingService';
import { BillingStage, finaliseRefund } from './cashierBilling';
import cashier from './CashierPanel.module.scss';

/**
 * The step between creating a credit note and paying the patient back. A draft
 * credit note is finalised only when the cashier confirms; the payout itself
 * then opens in the cashier payment form.
 */
export function RefundModal({
  credit,
  close,
  pay,
  finished,
  reconnect,
}: {
  credit: InvoiceWorkflow;
  close: () => void;
  pay: (creditId: number) => void;
  finished: (message: string) => void;
  reconnect: () => void;
}) {
  const [stage, setStage] = useState<BillingStage | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [blocked, setBlocked] = useState('');
  const busyRef = useRef(false);
  const name = invoiceName(credit);
  const amount = money(credit.total, credit.currency[1]);
  const draft = credit.state === 'draft';

  const go = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setFailure(null);
    setBlocked('');
    try {
      const outcome = await finaliseRefund(credit.id, setStage);
      if (outcome.kind === 'pay') pay(outcome.invoiceId);
      else if (outcome.kind === 'done')
        finished(`${name} is finalised. Nothing is left to pay back.`);
      else setBlocked(outcome.message);
    } catch (error) {
      setFailure(
        error instanceof Error ? error : new Error('Billing did not answer.'),
      );
    } finally {
      busyRef.current = false;
      setStage(null);
    }
  };

  const busy = stage !== null;
  return (
    <Modal
      open
      passiveModal
      size="sm"
      modalHeading={`Refund · ${name}`}
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section aria-label="Refund" aria-busy={busy}>
        {failure instanceof BillingSessionExpired ? (
          <div role="alert">
            <p>
              Your Billing session expired. Reconnect, then check {name} in
              Accounting.
            </p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : (
          <>
            <p>
              Credit note {name} for <strong>{amount}</strong> is{' '}
              {draft ? 'saved as a draft' : 'ready'}.
            </p>
            {draft ? (
              <p className={cashier.subtle}>
                Finalising it lowers what the patient owes and lets you pay the
                money back. To refund only part of the bill, change the credit
                note in Accounting first.
              </p>
            ) : null}
            {busy ? (
              <p role="status">
                {stage === 'post'
                  ? 'Finalising the credit note...'
                  : 'Working...'}
              </p>
            ) : null}
            {blocked ? <p role="alert">{blocked}</p> : null}
            {failure ? (
              <div role="alert">
                <p>{failure.message}</p>
                <p>
                  The credit note may already be finalised. Check it in
                  Accounting before trying again.
                </p>
              </div>
            ) : null}
            <div className={styles.toolbar}>
              <Button
                disabled={busy || !!blocked || !!failure}
                onClick={() => void go()}
              >
                {draft ? 'Finalise and pay back' : 'Pay back'}
              </Button>
              <Button
                kind="ghost"
                disabled={busy}
                onClick={() =>
                  finished(
                    `${name} is ${draft ? 'saved as a draft' : 'ready'} in Accounting. No money was paid back yet.`,
                  )
                }
              >
                Later
              </Button>
            </div>
          </>
        )}
      </section>
    </Modal>
  );
}
