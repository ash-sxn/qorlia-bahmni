import { TextInput } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import styles from './InsuranceDesk.module.scss';
import {
  COST_HEADS,
  CostHead,
  formatRupees,
  parseRupees,
  totalEstimate,
} from './preauthEstimate';

interface CostEstimateTableProps {
  amounts: Readonly<Record<CostHead, string>>;
  /** Left out for the printed preview, which shows the amounts only. */
  onChange?: (amounts: Record<CostHead, string>) => void;
}

/**
 * Cost by head with a running total. On screen each head is a box to type in; on paper
 * it is the amount. The total is withheld while any box holds something that is not an amount.
 */
export const CostEstimateTable = ({
  amounts,
  onChange,
}: CostEstimateTableProps) => {
  const { t } = useTranslation();
  const total = totalEstimate(amounts);

  return (
    <table className={styles.estimate}>
      <tbody>
        {COST_HEADS.map((head) => {
          const invalid = parseRupees(amounts[head]) === null;
          return (
            <tr key={head}>
              <th scope="row">
                {onChange ? (
                  <label htmlFor={`cost-${head}`}>
                    {t(`PREAUTH_COST_${head.toUpperCase()}`)}
                  </label>
                ) : (
                  t(`PREAUTH_COST_${head.toUpperCase()}`)
                )}
              </th>
              <td>
                {onChange ? (
                  <TextInput
                    id={`cost-${head}`}
                    labelText=""
                    hideLabel
                    inputMode="numeric"
                    value={amounts[head]}
                    invalid={invalid}
                    invalidText={t('PREAUTH_AMOUNT_INVALID')}
                    onChange={(event) =>
                      onChange({ ...amounts, [head]: event.target.value })
                    }
                  />
                ) : (
                  formatRupees(parseRupees(amounts[head]) ?? 0)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{t('PREAUTH_TOTAL')}</th>
          <td>
            <output aria-label={onChange ? t('PREAUTH_TOTAL') : undefined}>
              {total === null
                ? t('PREAUTH_TOTAL_INVALID')
                : formatRupees(total)}
            </output>
          </td>
        </tr>
      </tfoot>
    </table>
  );
};
