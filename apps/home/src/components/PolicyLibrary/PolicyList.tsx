import { Tag } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { Link } from 'react-router-dom';
import { formatPolicyDate } from './formatPolicyDate';
import styles from './PolicyLibrary.module.scss';
import { PolicyEntry, ReviewStatus } from './types';

const STATUS_TAG_TYPES = {
  reviewed: 'green',
  needs_review: 'purple',
  draft: 'gray',
} as const satisfies Record<ReviewStatus, string>;

interface PolicyListProps {
  policies: PolicyEntry[];
}

export const PolicyList = ({ policies }: PolicyListProps) => {
  const { t, i18n } = useTranslation();

  return (
    <ul className={styles.list}>
      {policies.map((policy) => (
        <li key={policy.id} className={styles.card}>
          <h2 className={styles.cardTitle}>
            <Link to={`/home/policies/${policy.id}`}>{policy.title}</Link>
          </h2>
          <div className={styles.meta}>
            <span>
              {t(
                `POLICY_LIBRARY_JURISDICTION_${policy.jurisdiction.toUpperCase()}`,
              )}
            </span>
            <span>
              {t(`POLICY_LIBRARY_CATEGORY_${policy.category.toUpperCase()}`)}
            </span>
            <Tag type={STATUS_TAG_TYPES[policy.reviewStatus]} size="sm">
              {t(`POLICY_LIBRARY_STATUS_${policy.reviewStatus.toUpperCase()}`)}
            </Tag>
          </div>
          <p className={styles.meta}>
            <span>{policy.authority}</span>
            <span>
              {t('POLICY_LIBRARY_PUBLISHED', {
                date:
                  formatPolicyDate(policy.publishedOn, i18n.language) ??
                  t('POLICY_LIBRARY_NOT_PROVIDED'),
              })}
            </span>
          </p>
          <p className={styles.summary}>{policy.summary}</p>
        </li>
      ))}
    </ul>
  );
};
