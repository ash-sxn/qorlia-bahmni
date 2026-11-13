import { Button } from '@bahmni/design-system';
import styles from './BillingPage.module.scss';

type PlanningIssue = {
  delay_alert_date: string;
  late_elements: { id: number; name: string; model: string }[];
};

export function InventoryPlanningIssue({
  value,
  openTransfer,
  disabled,
}: {
  value: unknown;
  openTransfer: (id: number) => void;
  disabled: boolean;
}) {
  if (value === false || value == null || value === '') return null;
  let issue: PlanningIssue;
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : null;
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error();
    // The native widget does not open a popover without late_elements.
    if (!Object.hasOwn(data, 'late_elements')) return null;
    if (
      data.popoverTemplate !== 'stock.PopoverStockRescheduling' ||
      typeof data.delay_alert_date !== 'string' ||
      !Array.isArray(data.late_elements) ||
      !data.late_elements.every(
        (row: PlanningIssue['late_elements'][number]) =>
          row &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          Number.isSafeInteger(row.id) &&
          row.id > 0 &&
          typeof row.name === 'string' &&
          typeof row.model === 'string' &&
          /^[a-z][a-z0-9_.]*$/.test(row.model),
      )
    )
      throw new Error();
    const keys = data.late_elements.map(
      (row: PlanningIssue['late_elements'][number]) => `${row.model}:${row.id}`,
    );
    if (new Set(keys).size !== keys.length) throw new Error();
    issue = data;
  } catch {
    return (
      <p role="alert">
        Native planning details could not be displayed. Reload the header; no
        document was opened.
      </p>
    );
  }
  return (
    <details className={styles.effectRecord}>
      <summary>Planning issue</summary>
      <p>Preceding operations planned on {issue.delay_alert_date}.</p>
      {issue.late_elements.length ? (
        <ul>
          {issue.late_elements.map((row) => (
            <li key={`${row.model}:${row.id}`}>
              {row.model === 'stock.picking' ? (
                <Button
                  kind="tertiary"
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled) openTransfer(row.id);
                  }}
                >
                  Open {row.name}
                </Button>
              ) : (
                <p>
                  {row.name}: the native {row.model} destination is not
                  integrated yet. No legacy application will be opened.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No preceding documents were included in this native alert.</p>
      )}
    </details>
  );
}
