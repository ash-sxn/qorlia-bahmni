import type { ReactNode } from 'react';
import styles from './BillingPage.module.scss';
import type { InventoryMove, OrderTransfer } from './billingService';
import { transferLabel as label } from './stockTransferPages';

type Move = InventoryMove & { order_line?: OrderTransfer['customer'] };
export function StockMoveTable({
  rows,
  showOrderLine = false,
  actions,
}: {
  rows: Move[];
  showOrderLine?: boolean;
  actions?: (row: Move) => ReactNode;
}) {
  return (
    <div
      className={styles.tableScroll}
      role="region"
      aria-label="Transfer demand and reservations"
      tabIndex={0}
    >
      <table>
        <caption>Demand and reservation quantities in the unit shown</caption>
        <thead>
          <tr>
            {[
              'Product',
              'Unit',
              'Demand',
              'Reserved',
              'Recorded done',
              'Move status',
              ...(showOrderLine ? ['Order item'] : []),
              ...(actions ? ['Operations'] : []),
            ].map((title) => (
              <th scope="col" key={title}>
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((move) => (
            <tr key={move.id}>
              <td>{label(move.product)}</td>
              <td>{label(move.unit)}</td>
              <td>{move.demand}</td>
              <td>{move.reserved}</td>
              <td>{move.done}</td>
              <td>{move.state}</td>
              {showOrderLine ? (
                <td>{label(move.order_line ?? false)}</td>
              ) : null}
              {actions ? <td>{actions(move)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StockOperationTable({
  rows,
  actions,
}: {
  rows: OrderTransfer['operations'];
  actions?: (row: OrderTransfer['operations'][number]) => ReactNode;
}) {
  return (
    <div
      className={styles.tableScroll}
      role="region"
      aria-label="Detailed stock operations"
      tabIndex={0}
    >
      <table>
        <caption>Detailed operations, quantities in the unit shown</caption>
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
              ...(actions ? ['Edit'] : []),
            ].map((title) => (
              <th scope="col" key={title}>
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.id}>
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
              {actions ? <td>{actions(line)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
