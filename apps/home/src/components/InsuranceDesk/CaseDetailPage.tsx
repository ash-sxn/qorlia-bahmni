import { Tag } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { ReactNode, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import { loadCases, usesSyntheticCases } from './caseCatalogue';
import {
  formatCaseDateTime,
  formatRupees,
  hasOpenQuery,
  outstandingAmount,
  settledAmount,
  sum,
} from './caseFigures';
import { STATUS_TAG_TYPES } from './CaseList';
import { CaseRecords } from './CaseRecords';
import styles from './InsuranceDesk.module.scss';
import { InsuranceCase, IsoDateTime, Paise } from './types';

const DESK_PATH = '/home/insurance';

/** The list's query string, passed in router state when a card is opened. */
const getDeskSearch = (state: unknown): string => {
  const search = (state as { deskSearch?: unknown } | null)?.deskSearch;
  return typeof search === 'string' && search.startsWith('?') ? search : '';
};

export const CaseDetailPage = () => {
  const { t, i18n } = useTranslation();
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const catalogue = useMemo(() => loadCases(), []);

  const notRecorded = t('INSURANCE_DESK_NOT_RECORDED');
  const formatAmount = (value: Paise | null) =>
    value === null ? notRecorded : formatRupees(value);
  const formatDateTime = (value: IsoDateTime | null) =>
    value === null ? notRecorded : formatCaseDateTime(value, i18n.language);

  const renderCase = (insuranceCase: InsuranceCase) => {
    const { amounts, payments } = insuranceCase;

    return (
      <>
        <h1>{insuranceCase.patientDisplayName}</h1>
        <div className={styles.meta}>
          <Tag type={STATUS_TAG_TYPES[insuranceCase.status]} size="sm">
            {t(`INSURANCE_DESK_STATUS_${insuranceCase.status.toUpperCase()}`)}
          </Tag>
          {hasOpenQuery(insuranceCase) && (
            <Tag type="magenta" size="sm">
              {t('INSURANCE_DESK_OPEN_QUERY')}
            </Tag>
          )}
          <span>
            {t('INSURANCE_DESK_RECORDED_BY', {
              name: insuranceCase.statusRecordedBy,
              date: formatDateTime(insuranceCase.statusRecordedAt),
            })}
          </span>
        </div>
        <p>{t('INSURANCE_DESK_INFO_NOTE')}</p>
        {usesSyntheticCases && (
          <p className={styles.notice}>
            {t('INSURANCE_DESK_SYNTHETIC_NOTICE')}
          </p>
        )}
        {insuranceCase.denialReason && (
          <p className={styles.notice}>
            {t('INSURANCE_DESK_DENIAL_REASON', {
              reason: insuranceCase.denialReason,
            })}
          </p>
        )}
        {insuranceCase.closureNote && (
          <p className={styles.notice}>
            {t('INSURANCE_DESK_CLOSURE_NOTE', {
              note: insuranceCase.closureNote,
            })}
          </p>
        )}

        <h2>{t('INSURANCE_DESK_SECTION_DETAILS')}</h2>
        <dl className={styles.facts}>
          <dt>{t('INSURANCE_DESK_FIELD_PATIENT_IDENTIFIER')}</dt>
          <dd>{insuranceCase.patientIdentifier}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_VISIT_REFERENCE')}</dt>
          <dd>{insuranceCase.visitReference ?? notRecorded}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_CLAIM_ROUTE')}</dt>
          <dd>
            {t(
              `INSURANCE_DESK_ROUTE_${insuranceCase.claimRoute.toUpperCase()}`,
            )}
          </dd>
          <dt>{t('INSURANCE_DESK_FIELD_ADMISSION_TYPE')}</dt>
          <dd>
            {t(
              `INSURANCE_DESK_ADMISSION_${insuranceCase.admissionType.toUpperCase()}`,
            )}
          </dd>
          <dt>{t('INSURANCE_DESK_FIELD_PAYER')}</dt>
          <dd>{insuranceCase.payerName}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_TPA')}</dt>
          <dd>{insuranceCase.tpaName ?? t('INSURANCE_DESK_NO_TPA')}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_POLICY_NUMBER')}</dt>
          <dd>{insuranceCase.policyNumber}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_PAYER_REFERENCE')}</dt>
          <dd>{insuranceCase.payerReference ?? notRecorded}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_INVOICE_REFERENCE')}</dt>
          <dd>{insuranceCase.invoiceReference ?? notRecorded}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_ADMITTED')}</dt>
          <dd>{formatDateTime(insuranceCase.admittedAt)}</dd>
          <dt>{t('INSURANCE_DESK_FIELD_DISCHARGED')}</dt>
          <dd>{formatDateTime(insuranceCase.dischargedAt)}</dd>
        </dl>

        <h2>{t('INSURANCE_DESK_SECTION_AMOUNTS')}</h2>
        <dl className={styles.facts}>
          <dt>{t('INSURANCE_DESK_AMOUNT_BILLED')}</dt>
          <dd>{formatAmount(amounts.billed)}</dd>
          <dt>{t('INSURANCE_DESK_AMOUNT_CLAIMED')}</dt>
          <dd>{formatAmount(amounts.claimed)}</dd>
          <dt>{t('INSURANCE_DESK_AMOUNT_APPROVED')}</dt>
          <dd>{formatAmount(amounts.approved)}</dd>
          <dt>{t('INSURANCE_DESK_AMOUNT_PATIENT_RESPONSIBILITY')}</dt>
          <dd>{formatAmount(amounts.patientResponsibility)}</dd>
          <dt>{t('INSURANCE_DESK_AMOUNT_RECEIVED')}</dt>
          <dd>
            {insuranceCase.claimRoute === 'cashless'
              ? formatAmount(amounts.received)
              : t('INSURANCE_DESK_NOT_APPLICABLE')}
          </dd>
          {insuranceCase.claimRoute === 'cashless' && (
            <>
              <dt>{t('INSURANCE_DESK_AMOUNT_TDS')}</dt>
              <dd>
                {formatRupees(
                  sum(payments.map((payment) => payment.taxDeductedAtSource)),
                )}
              </dd>
              <dt>{t('INSURANCE_DESK_AMOUNT_SETTLED')}</dt>
              <dd>{formatRupees(settledAmount(payments))}</dd>
              <dt>{t('INSURANCE_DESK_AMOUNT_OUTSTANDING')}</dt>
              <dd>{formatAmount(outstandingAmount(insuranceCase))}</dd>
            </>
          )}
        </dl>

        <CaseRecords insuranceCase={insuranceCase} />
      </>
    );
  };

  const renderContent = (): ReactNode => {
    if (!catalogue.ok) {
      return (
        <p role="alert" className={styles.notice}>
          {t('INSURANCE_DESK_LOAD_ERROR')}
        </p>
      );
    }

    const insuranceCase = catalogue.cases.find(({ id }) => id === caseId);
    if (!insuranceCase) {
      return (
        <>
          <h1>{t('INSURANCE_DESK_NOT_FOUND')}</h1>
          <p>{t('INSURANCE_DESK_NOT_FOUND_BODY')}</p>
        </>
      );
    }

    return renderCase(insuranceCase);
  };

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to={`${DESK_PATH}${getDeskSearch(location.state)}`}>
          {t('INSURANCE_DESK_BACK')}
        </Link>
        {renderContent()}
      </main>
    </>
  );
};
