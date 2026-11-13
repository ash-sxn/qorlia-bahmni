import { Tag } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import {
  exceededDecisionLimit,
  formatCaseDate,
  formatCaseDateTime,
  formatRupees,
  overdueDecisionLimit,
} from './caseFigures';
import styles from './InsuranceDesk.module.scss';
import { AuthorisationDecision, DocumentState, InsuranceCase } from './types';

const DECISION_TAG_TYPES = {
  pending: 'blue',
  approved: 'green',
  partly_approved: 'teal',
  denied: 'red',
} as const satisfies Record<AuthorisationDecision, string>;

const DOCUMENT_TAG_TYPES = {
  pending: 'purple',
  received: 'teal',
  sent: 'green',
  not_applicable: 'gray',
} as const satisfies Record<DocumentState, string>;

interface CaseRecordsProps {
  insuranceCase: InsuranceCase;
}

export const CaseRecords = ({ insuranceCase }: CaseRecordsProps) => {
  const { t, i18n } = useTranslation();
  const { authorisations, deductions, documents, queries, payments } =
    insuranceCase;

  const formatDateTime = (value: string) =>
    formatCaseDateTime(value, i18n.language);
  const noneRecorded = <p>{t('INSURANCE_DESK_NONE_RECORDED')}</p>;

  return (
    <>
      <h2>{t('INSURANCE_DESK_SECTION_AUTHORISATIONS')}</h2>
      {authorisations.length === 0 ? (
        noneRecorded
      ) : (
        <ul className={styles.records}>
          {authorisations.map((authorisation) => {
            const limit = exceededDecisionLimit(authorisation);
            const overdueLimit = overdueDecisionLimit(authorisation);

            return (
              <li
                key={`${authorisation.kind}-${authorisation.requestedAt}`}
                className={styles.card}
              >
                <div className={styles.meta}>
                  <span className={styles.recordTitle}>
                    {t(
                      `INSURANCE_DESK_AUTHORISATION_KIND_${authorisation.kind.toUpperCase()}`,
                    )}
                  </span>
                  <Tag
                    type={DECISION_TAG_TYPES[authorisation.decision]}
                    size="sm"
                  >
                    {t(
                      `INSURANCE_DESK_AUTHORISATION_DECISION_${authorisation.decision.toUpperCase()}`,
                    )}
                  </Tag>
                </div>
                <p className={styles.meta}>
                  <span>
                    {t('INSURANCE_DESK_AUTHORISATION_REQUESTED', {
                      amount: formatRupees(authorisation.requestedAmount),
                      date: formatDateTime(authorisation.requestedAt),
                    })}
                  </span>
                  {authorisation.approvedAmount !== null && (
                    <span>
                      {t('INSURANCE_DESK_AUTHORISATION_APPROVED_AMOUNT', {
                        amount: formatRupees(authorisation.approvedAmount),
                      })}
                    </span>
                  )}
                  {authorisation.decidedAt !== null && (
                    <span>
                      {t('INSURANCE_DESK_AUTHORISATION_DECIDED', {
                        date: formatDateTime(authorisation.decidedAt),
                      })}
                    </span>
                  )}
                </p>
                {limit !== null && (
                  <p className={styles.warning}>
                    {t('INSURANCE_DESK_AUTHORISATION_OVER_LIMIT', {
                      count: limit,
                    })}
                  </p>
                )}
                {overdueLimit !== null && (
                  <p className={styles.warning}>
                    {t('INSURANCE_DESK_AUTHORISATION_OVERDUE', {
                      count: overdueLimit,
                    })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2>{t('INSURANCE_DESK_SECTION_DEDUCTIONS')}</h2>
      {deductions.length === 0 ? (
        noneRecorded
      ) : (
        <ul className={styles.records}>
          {deductions.map((deduction) => (
            <li
              key={`${deduction.category}-${deduction.amount}-${deduction.note}`}
              className={styles.card}
            >
              <p className={styles.meta}>
                <span className={styles.recordTitle}>
                  {t(
                    `INSURANCE_DESK_DEDUCTION_CATEGORY_${deduction.category.toUpperCase()}`,
                  )}
                </span>
                <span>{formatRupees(deduction.amount)}</span>
              </p>
              {deduction.note && <p>{deduction.note}</p>}
            </li>
          ))}
        </ul>
      )}

      <h2>{t('INSURANCE_DESK_SECTION_DOCUMENTS')}</h2>
      {documents.length === 0 ? (
        noneRecorded
      ) : (
        <ul className={styles.records}>
          {documents.map((document) => (
            <li
              key={`${document.stage}-${document.type}`}
              className={styles.card}
            >
              <div className={styles.meta}>
                <span className={styles.recordTitle}>{document.type}</span>
                <Tag type={DOCUMENT_TAG_TYPES[document.state]} size="sm">
                  {t(
                    `INSURANCE_DESK_DOCUMENT_STATE_${document.state.toUpperCase()}`,
                  )}
                </Tag>
                <span>
                  {t(`INSURANCE_DESK_STAGE_${document.stage.toUpperCase()}`)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>{t('INSURANCE_DESK_SECTION_QUERIES')}</h2>
      {queries.length === 0 ? (
        noneRecorded
      ) : (
        <ul className={styles.records}>
          {queries.map((query) => (
            <li
              key={`${query.raisedAt}-${query.question}`}
              className={styles.card}
            >
              <p className={styles.recordTitle}>{query.question}</p>
              <div className={styles.meta}>
                <span>
                  {t(`INSURANCE_DESK_STAGE_${query.stage.toUpperCase()}`)}
                </span>
                <span>
                  {t('INSURANCE_DESK_QUERY_OWNER', { name: query.owner })}
                </span>
                <span>
                  {t('INSURANCE_DESK_QUERY_RAISED', {
                    date: formatDateTime(query.raisedAt),
                  })}
                </span>
                {query.answeredAt === null ? (
                  <Tag type="magenta" size="sm">
                    {t('INSURANCE_DESK_QUERY_NOT_ANSWERED')}
                  </Tag>
                ) : (
                  <span>
                    {t('INSURANCE_DESK_QUERY_ANSWERED', {
                      date: formatDateTime(query.answeredAt),
                    })}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {insuranceCase.claimRoute === 'cashless' && (
        <>
          <h2>{t('INSURANCE_DESK_SECTION_PAYMENTS')}</h2>
          {payments.length === 0 ? (
            noneRecorded
          ) : (
            <ul className={styles.records}>
              {payments.map((payment) => (
                <li key={payment.bankReference} className={styles.card}>
                  <p className={styles.recordTitle}>
                    {t('INSURANCE_DESK_PAYMENT_RECEIVED_ON', {
                      date: formatCaseDate(payment.receivedOn, i18n.language),
                    })}
                  </p>
                  <dl className={styles.facts}>
                    <dt>{t('INSURANCE_DESK_AMOUNT_RECEIVED')}</dt>
                    <dd>{formatRupees(payment.amount)}</dd>
                    <dt>{t('INSURANCE_DESK_AMOUNT_TDS')}</dt>
                    <dd>{formatRupees(payment.taxDeductedAtSource)}</dd>
                    <dt>{t('INSURANCE_DESK_AMOUNT_SETTLED')}</dt>
                    <dd>
                      {formatRupees(
                        payment.amount + payment.taxDeductedAtSource,
                      )}
                    </dd>
                    <dt>{t('INSURANCE_DESK_PAYMENT_BANK_REFERENCE')}</dt>
                    <dd>{payment.bankReference}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
};
