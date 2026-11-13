import styles from './BillingPage.module.scss';
import { StockOperationReview } from './billingService';

const label = (value: [number, string] | false) =>
  value ? value[1] : 'Not set';
export function StockOperationEffects({
  review,
}: {
  review: StockOperationReview;
}) {
  const after = review.after;
  return (
    <section className={styles.review} aria-label="Reviewed operation effects">
      <h3>
        {review.action === 'delete'
          ? 'Review operation removal'
          : 'Review saved operation values'}
      </h3>
      <p>
        Native preview only. Saving this preparation does not validate the
        transfer, deliver stock, post an invoice or record a payment.
      </p>
      {review.form.warning ? <p role="status">{review.form.warning}</p> : null}
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Resulting stock operations"
        tabIndex={0}
      >
        <table>
          <caption>Resulting detailed operations in their own units</caption>
          <thead>
            <tr>
              {[
                'Product',
                'Unit',
                'Reserved',
                'Recorded done',
                'Batch / serial',
                'Expiry (UTC)',
                'Source',
                'Destination',
                'Source package',
                'Destination package',
                'Owner',
              ].map((name) => (
                <th key={name} scope="col">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {after.transfer.operations.map((line, index) => (
              <tr key={line.id || `new-${index}`}>
                <td>{label(line.product)}</td>
                <td>{label(line.unit)}</td>
                <td>{line.reserved}</td>
                <td>{line.done}</td>
                <td>{line.lot ? line.lot[1] : line.lot_name || 'Not set'}</td>
                <td>{line.expiry_date || 'Not set'}</td>
                <td>{label(line.source)}</td>
                <td>{label(line.destination)}</td>
                <td>{label(line.source_package)}</td>
                <td>{label(line.destination_package)}</td>
                <td>{label(line.owner)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!after.transfer.operations.length ? (
        <p>No detailed operations remain after this action.</p>
      ) : null}
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Native pricing and balance"
        tabIndex={0}
      >
        <table>
          <caption>
            Operation prices and native balance after this action
          </caption>
          <thead>
            <tr>
              {[
                'Operation',
                'Cost price',
                'Sale price',
                'MRP',
                'Native balance',
              ].map((name) => (
                <th key={name} scope="col">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {after.form_rows.map((row, index) => (
              <tr key={row.id || `new-price-${index}`}>
                <td>{row.id ? `Operation ${row.id}` : 'New operation'}</td>
                <td>{row.values.cost_price}</td>
                <td>{row.values.sale_price}</td>
                <td>{row.values.mrp}</td>
                <td>{row.values.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Reviewed inventory reservations"
        tabIndex={0}
      >
        <table>
          <caption>
            Inventory in product stock units, not operation units
          </caption>
          <thead>
            <tr>
              {[
                'Product',
                'Stock unit',
                'Location',
                'Batch / serial',
                'Physical stock',
                'Reserved before',
                'Reserved after',
              ].map((name) => (
                <th key={name} scope="col">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {review.quant_after.map((quant, index) => (
              <tr key={quant.id}>
                <td>{label(quant.product_id)}</td>
                <td>{label(quant.unit)}</td>
                <td>{label(quant.location_id)}</td>
                <td>{label(quant.lot_id)}</td>
                <td>{quant.quantity}</td>
                <td>{review.quant_before[index].reserved_quantity}</td>
                <td>{quant.reserved_quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {after.packages.length ? (
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Resulting package-level operations"
          tabIndex={0}
        >
          <table>
            <caption>Package-level operations after this action</caption>
            <thead>
              <tr>
                {['Package', 'Status', 'Source', 'Destination'].map((name) => (
                  <th key={name} scope="col">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {after.packages.map((row, index) => (
                <tr key={row.id || `new-package-${index}`}>
                  <td>{label(row.package_id)}</td>
                  <td>{row.state}</td>
                  <td>{label(row.location_id)}</td>
                  <td>{label(row.location_dest_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
