import { Button, Checkbox } from '@bahmni/design-system';
import { useState } from 'react';
import styles from './BillingPage.module.scss';
import type {
  StockValidationDecision,
  StockValidationStep as Step,
} from './billingService';

export function StockValidationStep({
  step,
  disabled,
  choose,
}: {
  step: Step;
  disabled: boolean;
  choose: (decision: StockValidationDecision) => void;
}) {
  const [selected, setSelected] = useState(
    step.transfers[0]?.selected ?? false,
  );
  return (
    <section
      className={styles.review}
      aria-label="Next native validation decision"
    >
      <h3>{step.title}</h3>
      {step.kind === 'sms' ? (
        <p role="status">{step.blocked_reason}</p>
      ) : step.kind === 'receipt' ? (
        <>
          <p>
            From: {step.source ? step.source[1] : 'Not set'} · To:{' '}
            {step.destination ? step.destination[1] : 'Not set'}
          </p>
          <div
            className={styles.tableScroll}
            role="region"
            aria-label="Native receipt operation review"
            tabIndex={0}
          >
            <table>
              <caption>
                Saved operations in their native units. Prices are the native
                batch values.
              </caption>
              <thead>
                <tr>
                  {[
                    'Product',
                    'Quantity',
                    'Unit',
                    'Batch / serial',
                    'Expiry (UTC)',
                    'Cost price',
                    'Sale price',
                    'MRP',
                    'Balance quantity',
                    'Batch warning',
                  ].map((title) => (
                    <th scope="col" key={title}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {step.operations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.product_id[1]}</td>
                    <td>{row.qty_done}</td>
                    <td>{row.product_uom_id[1]}</td>
                    <td>
                      {row.lot_id ? row.lot_id[1] : row.lot_name || 'Not set'}
                    </td>
                    <td>{row.expiration_date || 'Not set'}</td>
                    <td>{row.cost_price}</td>
                    <td>{row.sale_price}</td>
                    <td>{row.mrp}</td>
                    <td>{row.balance}</td>
                    <td>
                      {row.expiry_warning ? (
                        <>
                          <strong>{row.expiry_warning.title}</strong>
                          <p>{row.expiry_warning.message}</p>
                        </>
                      ) : (
                        'None'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!step.operations.length ? (
            <p>
              No positive recorded-done operations are present in this native
              review.
            </p>
          ) : null}
          <p>
            To change these saved operations, return to stock transfers and edit
            them before reviewing validation again.
          </p>
          <Button
            disabled={disabled}
            onClick={() => choose({ kind: 'receipt', confirm: true })}
          >
            Confirm receipt review
          </Button>
        </>
      ) : step.kind === 'expiry' ? (
        <>
          <p>{step.description}</p>
          <ul>
            {step.lots.map((lot) => (
              <li key={lot[0]}>{lot[1]}</li>
            ))}
          </ul>
          <p>
            This choice is previewed first. Earlier preparation may remain even
            if expired batches are not processed.
          </p>
          <Button
            kind="tertiary"
            disabled={disabled}
            onClick={() => choose({ kind: 'expiry', proceed: false })}
          >
            Do not process expired batches
          </Button>
          <Button
            kind="danger"
            disabled={disabled}
            onClick={() => choose({ kind: 'expiry', proceed: true })}
          >
            Proceed with expired batches
          </Button>
        </>
      ) : (
        <>
          <Checkbox
            id="validation-native-transfer-choice"
            checked={selected}
            disabled={disabled}
            labelText={`${step.kind === 'immediate' ? 'Apply immediate quantities to' : 'Create a backorder for'} ${step.transfers[0].transfer[1]}`}
            onChange={(_event, { checked }) => setSelected(checked)}
          />
          <p>
            {step.kind === 'immediate'
              ? 'Leaving this unselected does not deliver this transfer.'
              : 'Leaving this unselected cancels the remaining demand instead of creating a backorder.'}
          </p>
          <Button
            disabled={disabled}
            onClick={() =>
              choose(
                step.kind === 'immediate'
                  ? { kind: 'immediate', selected }
                  : { kind: 'backorder', selected },
              )
            }
          >
            Review selected decision
          </Button>
        </>
      )}
    </section>
  );
}
