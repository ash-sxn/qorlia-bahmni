import { Dropdown, Search, Tag } from '@bahmni/design-system';
import { getFormattedPatientById, useTranslation } from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import {
  DEFAULT_FILTERS,
  filterReferrals,
  ReferralFilters,
  sortReferrals,
  specialities,
} from './filterReferrals';
import { loadDirectory, usesSyntheticReferrals } from './referralDirectory';
import styles from './ReferralNetwork.module.scss';
import { ENTRY_KINDS, ReferralEntry } from './types';

interface Option {
  value: string;
  label: string;
}

const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
/** Noon avoids the date moving a day in time zones behind UTC. */
export const formatVerifiedOn = (isoDate: string) =>
  day.format(new Date(`${isoDate}T12:00:00`));

/** Verified specialists and hospitals to refer a patient to. Read-only. */
export const ReferralDirectoryPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const patientUuid = searchParams.get('patient') ?? '';
  const directory = useMemo(() => loadDirectory(), []);
  const [filters, setFilters] = useState<ReferralFilters>(DEFAULT_FILTERS);
  const patient = useQuery({
    queryKey: ['referral-network', 'patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid),
    enabled: patientUuid !== '',
    retry: false,
    refetchOnWindowFocus: false,
  });

  const letterLink = (entry: ReferralEntry) =>
    `/home/referrals/${entry.id}/letter${patientUuid ? `?patient=${encodeURIComponent(patientUuid)}` : ''}`;

  const renderDropdown = (
    id: string,
    title: string,
    options: Option[],
    value: string,
    onSelect: (value: string) => void,
  ) => (
    <Dropdown<Option>
      id={id}
      titleText={title}
      label={title}
      items={options}
      itemToString={(option) => option?.label ?? ''}
      selectedItem={options.find((option) => option.value === value)}
      onChange={({ selectedItem }) => {
        if (selectedItem) {
          onSelect(selectedItem.value);
        }
      }}
    />
  );

  const renderEntry = (entry: ReferralEntry) => (
    <li key={entry.id} className={styles.entry}>
      <h2>
        {entry.name}
        <Tag type={entry.kind === 'doctor' ? 'blue' : 'purple'}>
          {t(`REFERRAL_KIND_${entry.kind.toUpperCase()}`)}
        </Tag>
      </h2>
      <p>
        {[entry.speciality, entry.organisation, entry.city]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <dl className={styles.facts}>
        <dt>{t('REFERRAL_PHONE')}</dt>
        <dd>
          <a href={`tel:${entry.phone.replace(/[^+\d]/g, '')}`}>
            {entry.phone}
          </a>
        </dd>
        {entry.timings && (
          <>
            <dt>{t('REFERRAL_TIMINGS')}</dt>
            <dd>{entry.timings}</dd>
          </>
        )}
        <dt>{t('REFERRAL_PMJAY')}</dt>
        <dd>{t(`REFERRAL_PMJAY_${entry.acceptsPmjay.toUpperCase()}`)}</dd>
      </dl>
      <p className={styles.muted}>
        {t('REFERRAL_VERIFIED', {
          date: formatVerifiedOn(entry.verifiedOn),
          by: entry.verifiedBy,
        })}
      </p>
      <Link to={letterLink(entry)}>{t('REFERRAL_WRITE_LETTER')}</Link>
    </li>
  );

  const renderDirectory = () => {
    if (!directory.ok) {
      return (
        <p role="alert" className={styles.error}>
          {t('REFERRAL_LOAD_ERROR')}
        </p>
      );
    }
    if (directory.entries.length === 0) {
      return <p className={styles.muted}>{t('REFERRAL_EMPTY')}</p>;
    }

    const allOption = { value: 'all', label: t('REFERRAL_FILTER_ALL') };
    const shown = sortReferrals(filterReferrals(directory.entries, filters));

    return (
      <>
        <div className={styles.filters}>
          <Search
            size="lg"
            labelText={t('REFERRAL_SEARCH_LABEL')}
            placeholder={t('REFERRAL_SEARCH_PLACEHOLDER')}
            closeButtonLabelText={t('REFERRAL_SEARCH_CLEAR')}
            value={filters.query}
            onChange={(event) =>
              setFilters({ ...filters, query: event.target.value })
            }
          />
          {renderDropdown(
            'referral-filter-speciality',
            t('REFERRAL_FILTER_SPECIALITY'),
            [
              allOption,
              ...specialities(directory.entries).map((value) => ({
                value,
                label: value,
              })),
            ],
            filters.speciality,
            (speciality) => setFilters({ ...filters, speciality }),
          )}
          {renderDropdown(
            'referral-filter-kind',
            t('REFERRAL_FILTER_KIND'),
            [
              allOption,
              ...ENTRY_KINDS.map((value) => ({
                value,
                label: t(`REFERRAL_KIND_${value.toUpperCase()}`),
              })),
            ],
            filters.kind,
            (kind) =>
              setFilters({ ...filters, kind: kind as ReferralFilters['kind'] }),
          )}
        </div>
        <p className={styles.muted} role="status">
          {t('REFERRAL_RESULT_COUNT', { count: shown.length })}
        </p>
        {shown.length > 0 ? (
          <ul className={styles.entries} aria-label={t('REFERRAL_RESULTS')}>
            {shown.map(renderEntry)}
          </ul>
        ) : (
          <p className={styles.muted}>{t('REFERRAL_NO_RESULTS')}</p>
        )}
      </>
    );
  };

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to="/home/">{t('HOME_LABEL')}</Link>
        <h1>{t('REFERRAL_TITLE')}</h1>
        <p>{t('REFERRAL_INTRO')}</p>
        {usesSyntheticReferrals && (
          <p className={styles.notice}>{t('REFERRAL_SYNTHETIC_NOTICE')}</p>
        )}
        {patient.data && (
          <p className={styles.notice}>
            {t('REFERRAL_FOR_PATIENT', {
              name: patient.data.fullName,
              id: patient.data.identifier,
            })}
          </p>
        )}
        {renderDirectory()}
      </main>
    </>
  );
};
