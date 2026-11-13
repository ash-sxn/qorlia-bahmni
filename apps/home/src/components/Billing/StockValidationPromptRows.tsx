import styles from './BillingPage.module.scss';
import type { StockValidationPromptRow } from './billingService';

export function StockValidationPromptRows({
  rows,
}: {
  rows: StockValidationPromptRow[];
}) {
  return (
    <div
      className={styles.tableScroll}
      role="region"
      aria-label="Saved prompt rows"
      tabIndex={0}
    >
      <table>
        <caption>
          Native saved prompt values, quantities in the unit shown
        </caption>
        <thead>
          <tr>
            {[
              'Record',
              'Quantity / selection',
              'Unit',
              'Batch / serial',
              'Expiry (UTC)',
              'Cost price',
              'Sale price',
              'MRP',
              'Balance',
              'Expiring soon',
              'Warning',
            ].map((text) => (
              <th scope="col" key={text}>
                {text}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.section === 'operations' ? (
              <tr key={row.value.id}>
                <td>{row.value.product_id[1]}</td>
                <td>{row.value.qty_done}</td>
                <td>{row.value.product_uom_id[1]}</td>
                <td>
                  {row.value.lot_id
                    ? row.value.lot_id[1]
                    : row.value.lot_name || 'Not set'}
                </td>
                <td>{row.value.expiration_date || 'Not set'}</td>
                <td>{row.value.cost_price}</td>
                <td>{row.value.sale_price}</td>
                <td>{row.value.mrp}</td>
                <td>{row.value.balance}</td>
                <td>
                  {row.value.is_move_line_lot_expiring_soon ? 'Yes' : 'No'}
                </td>
                <td>
                  {row.value.expiry_warning
                    ? `${row.value.expiry_warning.title}: ${row.value.expiry_warning.message}`
                    : 'None'}
                </td>
              </tr>
            ) : row.section === 'lots' ? (
              <tr key={row.value[0]}>
                <td>{row.value[1]}</td>
                <td colSpan={10}>Expired batch</td>
              </tr>
            ) : (
              <tr key={row.value.transfer[0]}>
                <td>{row.value.transfer[1]}</td>
                <td colSpan={10}>
                  {row.value.selected ? 'Selected' : 'Not selected'}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
