import React, { ReactNode } from 'react';
import styles from './PatientBanner.module.scss';

export interface PatientBannerProps {
  name: string;
  /** Age and sex, ID, phone: shown in this order, separated by dots. */
  details: (string | null | undefined | false)[];
  /**
   * Allergies always show: a list, an empty list ("no known allergies" is the
   * caller's label), or a sentence while loading or when they could not be read.
   */
  allergies: { label: string; items: string[] } | { message: string };
  /** The open visit, when there is one. */
  visit?: string;
  /** The main action first, then the others. */
  actions?: ReactNode;
  /** A slimmer banner for work screens such as the consultation. */
  compact?: boolean;
  /** Where the patient name links to, for compact banners. */
  nameHref?: string;
  headingLevel?: 1 | 2;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const WarningIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 3 2 20h20Z" />
    <path d="M12 10v4M12 17v.01" />
  </svg>
);

/**
 * Who the patient is, their allergies and their open visit, kept in view on every
 * patient screen. Allergies are never hidden: a missing list says so.
 */
export const PatientBanner: React.FC<PatientBannerProps> = ({
  name,
  details,
  allergies,
  visit,
  actions,
  compact = false,
  nameHref,
  headingLevel = 1,
}) => {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const hasAllergies = 'items' in allergies && allergies.items.length > 0;
  let allergyText = 'message' in allergies ? allergies.message : '';
  if ('items' in allergies) {
    allergyText = hasAllergies
      ? `${allergies.label}: ${allergies.items.join(', ')}`
      : allergies.label;
  }
  return (
    <section
      className={`${styles.banner} ${compact ? styles.compact : ''}`}
      aria-label={name}
      data-testid="patient-banner"
    >
      <div className={styles.identity}>
        {!compact && (
          <span className={styles.avatar} aria-hidden="true">
            {initials(name)}
          </span>
        )}
        <div className={styles.text}>
          <Heading className={styles.name}>
            {nameHref ? <a href={nameHref}>{name}</a> : name}
          </Heading>
          <p className={styles.details}>
            {details.filter(Boolean).join(' · ')}
          </p>
          <div className={styles.chips}>
            <span
              className={`${styles.chip} ${hasAllergies ? styles.allergy : styles.neutral}`}
            >
              {hasAllergies && <WarningIcon />}
              {allergyText}
            </span>
            {visit && (
              <span className={`${styles.chip} ${styles.visit}`}>
                <span className={styles.dot} aria-hidden="true" />
                {visit}
              </span>
            )}
          </div>
        </div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
};

export default PatientBanner;
