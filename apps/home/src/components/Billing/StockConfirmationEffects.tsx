import styles from './BillingPage.module.scss';
import type {
  ConfirmationValue,
  StockConfirmationEffects as Effects,
  StockValidationEffects,
} from './billingService';

const models: Record<string, string> = {
  'stock.picking': 'Stock transfer',
  'stock.move': 'Stock move',
  'stock.move.line': 'Detailed operation',
  'stock.quant': 'Inventory quantity',
  'stock.lot': 'Batch / serial',
  'stock.package_level': 'Package operation',
  'stock.quant.package': 'Stock package',
  'procurement.group': 'Procurement group',
  'purchase.order': 'Vendor RFQ',
  'purchase.order.line': 'Vendor RFQ item',
  'stock.warehouse.orderpoint': 'Replenishment rule',
  'product.product': 'Product',
  'mail.message': 'Audit message',
  'mail.mail': 'Queued message',
  'mail.activity': 'Activity',
  'mail.notification': 'Notification',
  'mail.tracking.value': 'Tracked audit change',
  'ir.attachment': 'Attachment',
  'product.template': 'Product template',
  'ir.property': 'Company property',
  'account.move': 'Journal entry',
  'account.move.line': 'Journal item',
  'account.payment': 'Payment',
  'account.partial.reconcile': 'Partial allocation',
  'stock.valuation.layer': 'Stock valuation',
  'sale.order': 'Sales order',
  'sale.order.line': 'Order item',
  'account.full.reconcile': 'Full reconciliation',
  'account.analytic.line': 'Analytic item',
};
export const confirmationModelLabel = (model: string) => models[model] ?? model;
function generatedLabel(key: string) {
  const [, model, index] = key.split(':');
  return `New ${confirmationModelLabel(model).toLowerCase()} ${Number(index) + 1}`;
}
function display(
  value: ConfirmationValue | undefined,
  effects: Pick<Effects, 'labels'>,
  relation?: string | false,
  type?: string,
): string {
  if (value === undefined) return 'Not present';
  if (type === 'boolean' && typeof value === 'boolean')
    return value ? 'Yes' : 'No';
  if (value === null || value === false) return 'Not set';
  if (
    typeof value === 'string' &&
    value.startsWith('new:') &&
    (relation || type === 'many2one_reference')
  )
    return generatedLabel(value);
  if (relation && typeof value === 'number')
    return `${effects.labels[`${relation}:${value}`] ?? relation} (#${value})`;
  if (type === 'many2many' && Array.isArray(value))
    return value.length
      ? value
          .map((item) => display(item, effects, relation, 'many2one'))
          .join(', ')
      : 'None';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return value === '' ? 'Empty text' : String(value);
}

export function StockConfirmationEffects({
  effects,
  workflow = 'confirmation',
}: {
  effects: Effects | StockValidationEffects;
  workflow?:
    | 'confirmation'
    | 'preparation'
    | 'operation'
    | 'return creation'
    | 'cancellation';
}) {
  const validation = 'private_effect_counts' in effects;
  const privateCounts = validation
    ? effects.private_effect_counts
    : effects.private_audit_counts;
  const action =
    workflow === 'return creation' || workflow === 'cancellation'
      ? workflow
      : validation
        ? 'validation'
        : workflow;
  return (
    <section
      className={styles.review}
      aria-label={`Reviewed ${action} effects`}
    >
      <h3>Native {action} effects</h3>
      <p>
        Review created, changed and removed records. Quantities and prices
        retain their native units and currency fields. Audit markup is shown as
        text, never executed.
      </p>
      {Object.entries(effects.schema).map(([model, schema]) => {
        const created = effects.created[model],
          updated = effects.updated[model],
          deleted = effects.deleted[model];
        const rows = [
          ...created.map((row) => ({
            key: row.key,
            title: `Create: ${generatedLabel(row.key)}`,
            before: undefined,
            after: row.values,
            assigned: row.assigned_on_save,
          })),
          ...updated.map((row) => ({
            key: `updated-${row.id}`,
            title: `Change: ${confirmationModelLabel(model)} #${row.id}`,
            before: row.before,
            after: row.after,
            assigned: row.assigned_on_save ?? [],
          })),
          ...deleted.map((row) => ({
            key: `deleted-${row.id}`,
            title: `Remove: ${confirmationModelLabel(model)} #${row.id}`,
            before: row.values,
            after: undefined,
            assigned: [] as string[],
          })),
        ];
        return (
          <section
            key={model}
            aria-label={`${confirmationModelLabel(model)} effects`}
          >
            <h4>
              {confirmationModelLabel(model)}: {created.length} created,{' '}
              {updated.length} changed, {deleted.length} removed
            </h4>
            {rows.map((row) => {
              const fields = [
                ...new Set([
                  ...Object.keys(row.before ?? {}),
                  ...Object.keys(row.after ?? {}),
                ]),
              ].filter(
                (field) =>
                  !row.before ||
                  !row.after ||
                  [
                    'product_id',
                    'product_uom',
                    'product_uom_id',
                    'uom_id',
                    'currency_id',
                    'company_currency_id',
                    'company_id',
                  ].includes(field) ||
                  JSON.stringify(row.before[field]) !==
                    JSON.stringify(row.after[field]),
              );
              return (
                <details key={row.key} className={styles.effectRecord}>
                  <summary>{row.title}</summary>
                  {fields.length ? (
                    <div
                      className={styles.tableScroll}
                      role="region"
                      aria-label={`${row.title} fields`}
                      tabIndex={0}
                    >
                      <table>
                        <caption>{row.title}: native field values</caption>
                        <thead>
                          <tr>
                            <th scope="col">Field</th>
                            <th scope="col">Before</th>
                            <th scope="col">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((field) => (
                            <tr key={field}>
                              <th scope="row">
                                {schema[field].label}
                                <span className={styles.reference}>
                                  {field}
                                </span>
                              </th>
                              <td className={styles.messageBody}>
                                {display(
                                  row.before?.[field],
                                  effects,
                                  schema[field].relation,
                                  schema[field].type,
                                )}
                              </td>
                              <td className={styles.messageBody}>
                                {row.assigned.includes(field)
                                  ? 'Assigned by the native system on save'
                                  : display(
                                      row.after?.[field],
                                      effects,
                                      schema[field].relation,
                                      schema[field].type,
                                    )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>
                      No displayed business field changes. Native audit metadata
                      is still included in the signed review.
                    </p>
                  )}
                </details>
              );
            })}
          </section>
        );
      })}
      {Object.keys(privateCounts).length ? (
        <section
          aria-label={
            validation
              ? 'Private native record changes'
              : 'Private native audit changes'
          }
        >
          <h4>Additional native {validation ? 'record' : 'audit'} changes</h4>
          <p>
            Only counts are available under this account. Private content
            remains protected and is bound to this review.
          </p>
          <ul>
            {Object.entries(privateCounts).map(([model, counts]) => (
              <li key={model}>
                {confirmationModelLabel(model)}: {counts.created} created,{' '}
                {counts.updated} changed, {counts.deleted} removed
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!Object.keys(effects.schema).length &&
      !Object.keys(privateCounts).length ? (
        <p>No native record effects were returned.</p>
      ) : null}
    </section>
  );
}
