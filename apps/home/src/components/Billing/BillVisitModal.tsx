import { Button, Modal } from '@bahmni/design-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { invoiceName, money } from './billingFormat';
import styles from './BillingPage.module.scss';
import {
  BillingSessionExpired,
  ChargeOrder,
  getChargeOrderLines,
  getDraftChoices,
  getInvoiceWorkflow,
  getOrderWorkflow,
} from './billingService';
import {
  addOrderProduct,
  BillingOutcome,
  BillingStage,
  billVisit,
  canAddCharges,
  finaliseInvoice,
} from './cashierBilling';
import cashier from './CashierPanel.module.scss';
import { DraftOrderEditor } from './DraftOrderEditor';

export type BillTarget =
  | { kind: 'order'; order: ChargeOrder }
  | { kind: 'invoice'; invoiceId: number };

const STAGE_TEXT: Record<BillingStage, string> = {
  confirm: 'Confirming the visit charges...',
  invoice: 'Creating the bill...',
  post: 'Finalising the bill...',
};

// Products named like this are offered as the consultation fee. A clinic can
// keep one per doctor or visit type, each with its own price in Billing.
const CONSULTATION_SEARCH = 'Consultation';

type Props = {
  uid: number;
  target: BillTarget;
  close: () => void;
  /** Billing finished and this bill has money due. */
  pay: (invoiceId: number) => void;
  /** Billing finished with nothing to collect. */
  finished: (message: string) => void;
  reconnect: () => void;
};

/**
 * The cashier's review of one visit: what was charged, an optional
 * consultation fee, then one action that creates and finalises the bill
 * through the same native workflows as the Accounting view.
 */
export function BillVisitModal({
  uid,
  target,
  close,
  pay,
  finished,
  reconnect,
}: Props) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<BillingStage | 'adding' | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [blocked, setBlocked] = useState('');
  const [editing, setEditing] = useState(false);
  const [feeChoices, setFeeChoices] = useState<[number, string][] | null>(null);
  const busyRef = useRef(false);
  const orderId = target.kind === 'order' ? target.order.id : null;
  const workflow = useQuery({
    queryKey: ['billing', 'cashier-bill', uid, orderId],
    queryFn: () => getOrderWorkflow(orderId as number),
    enabled: orderId !== null,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const lines = useQuery({
    queryKey: ['billing', 'cashier-bill-lines', uid, orderId],
    queryFn: () => getChargeOrderLines(orderId as number),
    enabled: orderId !== null,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const draftInvoice = useQuery({
    queryKey: [
      'billing',
      'cashier-invoice',
      uid,
      target.kind === 'invoice' ? target.invoiceId : null,
    ],
    queryFn: () =>
      getInvoiceWorkflow(target.kind === 'invoice' ? target.invoiceId : 0),
    enabled: target.kind === 'invoice',
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const busy = stage !== null;
  const loading =
    target.kind === 'order'
      ? workflow.isFetching || lines.isFetching
      : draftInvoice.isFetching;
  const loadError =
    target.kind === 'order'
      ? (workflow.error ?? lines.error)
      : draftInvoice.error;
  const expired =
    failure instanceof BillingSessionExpired ||
    loadError instanceof BillingSessionExpired;

  const reload = async () => {
    setFailure(null);
    setBlocked('');
    setFeeChoices(null);
    if (target.kind === 'order')
      await Promise.all([workflow.refetch(), lines.refetch()]);
    else await draftInvoice.refetch();
  };

  const guarded = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setFailure(null);
    setBlocked('');
    try {
      await task();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error
          : new Error('Billing did not answer. Reload to check the bill.'),
      );
    } finally {
      busyRef.current = false;
      setStage(null);
    }
  };

  const settle = (outcome: BillingOutcome) => {
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'billing' && query.queryKey[1] !== 'session',
    });
    if (outcome.kind === 'pay') pay(outcome.invoiceId);
    else if (outcome.kind === 'done')
      finished('Billed. Nothing is left to collect on this visit.');
    else setBlocked(outcome.message);
  };

  const createBill = () =>
    guarded(async () => {
      const outcome =
        target.kind === 'order'
          ? await billVisit(target.order.id, setStage)
          : await finaliseInvoice(target.invoiceId, setStage);
      settle(outcome);
    });

  const findFees = () =>
    guarded(async () => {
      setStage('adding');
      setFeeChoices(
        await getDraftChoices(
          'product',
          CONSULTATION_SEARCH,
          target.kind === 'order' && target.order.shop_id
            ? target.order.shop_id[0]
            : false,
        ),
      );
    });

  const addFee = (productId: number) =>
    guarded(async () => {
      if (target.kind !== 'order') return;
      setStage('adding');
      try {
        await addOrderProduct(target.order.id, productId, crypto.randomUUID());
      } finally {
        // Always re-read, so an unclear failure shows whether the fee landed
        // instead of inviting a second add.
        setFeeChoices(null);
        await Promise.all([workflow.refetch(), lines.refetch()]);
      }
    });

  if (editing && target.kind === 'order')
    return (
      <DraftOrderEditor
        uid={uid}
        orderId={target.order.id}
        close={() => {
          setEditing(false);
          void reload();
        }}
        saved={() => {
          setEditing(false);
          void reload();
        }}
        reconnect={reconnect}
      />
    );

  const order = workflow.data;
  const items = (lines.data ?? []).filter((line) => !line.display_type);
  const feeOnBill = items.some(
    (line) =>
      (feeChoices ?? []).some(
        ([id]) => line.product_id && id === line.product_id[0],
      ) || line.name.toLowerCase().includes(CONSULTATION_SEARCH.toLowerCase()),
  );
  const currency =
    target.kind === 'order'
      ? target.order.currency_id[1]
      : (draftInvoice.data?.currency[1] ?? 'INR');
  const total =
    target.kind === 'order'
      ? (order?.amount_total ?? target.order.amount_total)
      : (draftInvoice.data?.total ?? 0);
  const patient =
    target.kind === 'order'
      ? target.order.partner_id
        ? target.order.partner_id[1]
        : 'No patient'
      : (draftInvoice.data ? draftInvoice.data.customer : false) ||
        'No patient';
  const ready =
    !loading &&
    !loadError &&
    (target.kind === 'order' ? !!order : !!draftInvoice.data);

  return (
    <Modal
      open
      passiveModal
      size="md"
      modalHeading={`Bill ${patient}`}
      preventCloseOnClickOutside
      onRequestClose={() => {
        if (!busyRef.current) close();
      }}
    >
      <section aria-label="Visit bill review" aria-busy={busy || loading}>
        {target.kind === 'order' ? (
          <p className={cashier.subtle}>
            {target.order.name}
            {target.order.provider_name
              ? ` · ${target.order.provider_name}`
              : ''}
          </p>
        ) : draftInvoice.data ? (
          <p className={cashier.subtle}>
            Draft bill {invoiceName(draftInvoice.data)}
          </p>
        ) : null}

        {expired ? (
          <div role="alert">
            <p>Your Billing session expired. Reconnect to continue.</p>
            <Button kind="tertiary" onClick={reconnect}>
              Reconnect Billing
            </Button>
          </div>
        ) : loading ? (
          <p role="status">Loading the bill...</p>
        ) : loadError ? (
          <div role="alert">
            <p>{loadError.message}</p>
            <Button kind="tertiary" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        ) : null}

        {ready && target.kind === 'order' ? (
          <div className={styles.tableScroll}>
            <table>
              <caption className={cashier.visuallyHidden}>
                Charges on this visit
              </caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className={cashier.amount}>
                    Qty
                  </th>
                  <th scope="col" className={cashier.amount}>
                    Price
                  </th>
                  <th scope="col" className={cashier.amount}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((line) => (
                  <tr key={line.id}>
                    <td>{line.product_id ? line.product_id[1] : line.name}</td>
                    <td className={cashier.amount}>{line.product_uom_qty}</td>
                    <td className={cashier.amount}>
                      {line.price_unit > 0
                        ? money(line.price_unit, currency)
                        : 'No price'}
                    </td>
                    <td className={cashier.amount}>
                      {money(line.price_total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    Total
                  </th>
                  <td className={`${cashier.amount} ${cashier.due}`}>
                    {money(total, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        {ready && target.kind === 'invoice' ? (
          <p>
            Total: <strong>{money(total, currency)}</strong>
          </p>
        ) : null}

        {ready && total <= 0 ? (
          <p role="alert">
            This bill totals {money(0, currency)}. Check the item prices in
            Billing before collecting.
          </p>
        ) : null}
        {ready &&
        target.kind === 'order' &&
        order?.can_confirm &&
        (order.automation.delivery || order.automation.legacy_delivery) ? (
          <p className={cashier.subtle}>
            Medicines on this bill are issued from stock when the bill is
            created.
          </p>
        ) : null}

        {ready && order && canAddCharges(order) ? (
          <div className={cashier.feeRow}>
            {feeOnBill ? (
              <p className={cashier.subtle}>
                A consultation fee is on this bill.
              </p>
            ) : feeChoices === null ? (
              <Button
                kind="tertiary"
                size="sm"
                disabled={busy}
                onClick={() => void findFees()}
              >
                Add consultation fee
              </Button>
            ) : feeChoices.length === 0 ? (
              <p role="alert">
                No product named &ldquo;{CONSULTATION_SEARCH}&rdquo; is set up
                in Billing yet. Ask your administrator to add it with its price.
              </p>
            ) : (
              feeChoices.map(([id, name]) => (
                <Button
                  key={id}
                  kind="tertiary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void addFee(id)}
                >
                  Add {name}
                </Button>
              ))
            )}
            <Button
              kind="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Edit charges
            </Button>
          </div>
        ) : null}

        {stage ? (
          <p role="status">
            {stage === 'adding' ? 'Updating the bill...' : STAGE_TEXT[stage]}
          </p>
        ) : null}
        {blocked ? <p role="alert">{blocked}</p> : null}
        {failure && !expired ? (
          <div role="alert">
            <p>{failure.message}</p>
            <p>
              Nothing is sent twice. Reload to see where the bill stopped, then
              continue.
            </p>
          </div>
        ) : null}

        <div className={styles.toolbar}>
          <Button
            disabled={!ready || busy || !!blocked}
            onClick={() => void createBill()}
          >
            {failure
              ? 'Continue billing'
              : target.kind === 'order' && order?.can_confirm
                ? `Create bill · ${money(total, currency)}`
                : 'Finalise and collect'}
          </Button>
          <Button
            kind="tertiary"
            disabled={busy || loading}
            onClick={() => void reload()}
          >
            Reload
          </Button>
          <Button kind="ghost" disabled={busy} onClick={close}>
            Back to queue
          </Button>
        </div>
      </section>
    </Modal>
  );
}
