import { Tag } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import {
  formatCaseDateTime,
  formatRupees,
  hasOpenQuery,
  outstandingAmount,
} from './caseFigures';
import styles from './InsuranceDesk.module.scss';
import { CaseStatus, InsuranceCase } from './types';

const STATUS_TAG_TYPES = {
  admitted: 'gray',
  preauthorisation_pending: 'blue',
  preauthorisation_approved: 'teal',
  enhancement_pending: 'blue',
  discharge_pending: 'blue',
  final_approved: 'teal',
  claim_submitted: 'cyan',
  settled: 'green',
  short_paid: 'purple',
  denied: 'red',
  documents_handed_over: 'cyan',
  closed: 'gray',
} as const satisfies Record<CaseStatus, string>;

interface CaseListProps {
  cases: InsuranceCase[];
}

export const CaseList = ({ cases }: CaseListProps) => {
  const { t, i18n } = useTranslation();

  return (
    <ul className={styles.list}>
      {cases.map((insuranceCase) => {
        const outstanding = outstandingAmount(insuranceCase);

        return (
          <li key={insuranceCase.id} className={styles.card}>
            <h2 className={styles.cardTitle}>
              {insuranceCase.patientDisplayName}
            </h2>
            <div className={styles.meta}>
              <Tag type={STATUS_TAG_TYPES[insuranceCase.status]} size="sm">
                {t(
                  `INSURANCE_DESK_STATUS_${insuranceCase.status.toUpperCase()}`,
                )}
              </Tag>
              {hasOpenQuery(insuranceCase) && (
                <Tag type="magenta" size="sm">
                  {t('INSURANCE_DESK_OPEN_QUERY')}
                </Tag>
              )}
              <span>
                {t('INSURANCE_DESK_RECORDED_BY', {
                  name: insuranceCase.statusRecordedBy,
                  date: formatCaseDateTime(
                    insuranceCase.statusRecordedAt,
                    i18n.language,
                  ),
                })}
              </span>
            </div>
            <p className={styles.meta}>
              <span>{insuranceCase.patientIdentifier}</span>
              <span>
                {t(
                  `INSURANCE_DESK_ROUTE_${insuranceCase.claimRoute.toUpperCase()}`,
                )}
              </span>
              <span>{insuranceCase.payerName}</span>
              {insuranceCase.tpaName && <span>{insuranceCase.tpaName}</span>}
              <span>{insuranceCase.policyNumber}</span>
            </p>
            {outstanding !== null && (
              <p className={styles.outstanding}>
                {t('INSURANCE_DESK_OUTSTANDING', {
                  amount: formatRupees(outstanding),
                })}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
