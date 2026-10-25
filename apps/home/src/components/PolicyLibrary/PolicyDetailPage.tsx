import { Tag } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { ReactNode, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import { formatPolicyDate } from './formatPolicyDate';
import { loadPolicyCatalogue, usesSyntheticExamples } from './policyCatalogue';
import styles from './PolicyLibrary.module.scss';
import { STATUS_TAG_TYPES } from './PolicyList';
import { isReviewOverdue, toIsoDate } from './reviewDates';
import { IsoDate, PolicyEntry } from './types';

const LIBRARY_PATH = '/home/policies';

export const PolicyDetailPage = () => {
  const { t, i18n } = useTranslation();
  const { policyId } = useParams<{ policyId: string }>();
  const catalogue = useMemo(() => loadPolicyCatalogue(), []);

  const notProvided = t('POLICY_LIBRARY_NOT_PROVIDED');
  const formatDate = (value: IsoDate | null) =>
    formatPolicyDate(value, i18n.language) ?? notProvided;

  const renderPolicy = (policy: PolicyEntry) => (
    <>
      <h1>{policy.title}</h1>
      <div className={styles.meta}>
        <Tag type={STATUS_TAG_TYPES[policy.reviewStatus]} size="sm">
          {t(`POLICY_LIBRARY_STATUS_${policy.reviewStatus.toUpperCase()}`)}
        </Tag>
        <span>
          {t(
            `POLICY_LIBRARY_JURISDICTION_${policy.jurisdiction.toUpperCase()}`,
          )}
        </span>
        <span>
          {t(`POLICY_LIBRARY_CATEGORY_${policy.category.toUpperCase()}`)}
        </span>
      </div>
      <p className={styles.meta}>
        {t('POLICY_LIBRARY_ISSUED_BY', { authority: policy.authority })}
      </p>
      {usesSyntheticExamples && (
        <p className={styles.notice}>{t('POLICY_LIBRARY_SYNTHETIC_NOTICE')}</p>
      )}
      {isReviewOverdue(policy.reviewDueOn, toIsoDate(new Date())) && (
        <p className={styles.warning}>{t('POLICY_LIBRARY_REVIEW_OVERDUE')}</p>
      )}

      <h2>{t('POLICY_LIBRARY_SUMMARY')}</h2>
      <p>{policy.summary}</p>

      <h2>{t('POLICY_LIBRARY_APPLIES_TO')}</h2>
      <p>{policy.applicabilityNote ?? notProvided}</p>

      <h2>{t('POLICY_LIBRARY_DATES')}</h2>
      <dl className={styles.dates}>
        <dt>{t('POLICY_LIBRARY_DATE_PUBLISHED')}</dt>
        <dd>{formatDate(policy.publishedOn)}</dd>
        <dt>{t('POLICY_LIBRARY_DATE_EFFECTIVE')}</dt>
        <dd>{formatDate(policy.effectiveOn)}</dd>
        <dt>{t('POLICY_LIBRARY_DATE_SOURCE_CHECKED')}</dt>
        <dd>{formatDate(policy.sourceCheckedOn)}</dd>
        <dt>{t('POLICY_LIBRARY_DATE_REVIEWED')}</dt>
        <dd>{formatDate(policy.reviewedOn)}</dd>
        <dt>{t('POLICY_LIBRARY_DATE_REVIEW_DUE')}</dt>
        <dd>{formatDate(policy.reviewDueOn)}</dd>
      </dl>

      <h2>{t('POLICY_LIBRARY_SOURCE')}</h2>
      <p className={styles.meta}>
        <a href={policy.sourceUrl} target="_blank" rel="noopener noreferrer">
          {t('POLICY_LIBRARY_OPEN_SOURCE')}
        </a>
        <span>{new URL(policy.sourceUrl).hostname}</span>
      </p>

      <p className={styles.notice}>{t('POLICY_LIBRARY_DETAIL_INFO_NOTE')}</p>
    </>
  );

  const renderContent = (): ReactNode => {
    if (!catalogue.ok) {
      return (
        <p role="alert" className={styles.notice}>
          {t('POLICY_LIBRARY_LOAD_ERROR')}
        </p>
      );
    }

    const policy = catalogue.entries.find((entry) => entry.id === policyId);
    if (!policy) {
      return (
        <>
          <h1>{t('POLICY_LIBRARY_NOT_FOUND')}</h1>
          <p>{t('POLICY_LIBRARY_NOT_FOUND_BODY')}</p>
        </>
      );
    }

    return renderPolicy(policy);
  };

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to={LIBRARY_PATH}>{t('POLICY_LIBRARY_BACK')}</Link>
        {renderContent()}
      </main>
    </>
  );
};
