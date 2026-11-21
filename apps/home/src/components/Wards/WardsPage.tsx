import { Button, InlineLoading } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import { useHasPrivilege, useShellNavigation } from '@bahmni/widgets';
import { useQueries, useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { REVIEW_URLS } from '../HomeShell';
import today from '../Today/Today.module.scss';
import { MedicineRound } from './MedicineRound';
import styles from './Wards.module.scss';
import {
  CurrentMedicine,
  getCurrentMedicines,
  getLatestVitals,
  getOccupiedBeds,
  getWards,
  LatestVitals,
  vitalsDue,
  WardBed,
} from './wardService';

/** Read-only page: no automatic retry; refreshed every two minutes for the round. */
const QUERY_OPTIONS = { retry: false, refetchInterval: 120_000 } as const;

const clock = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const hoursAgo = (iso: string, now: Date) =>
  Math.max(
    0,
    Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000),
  );

const VitalsCell: React.FC<{ vitals?: LatestVitals; loading: boolean }> = ({
  vitals,
  loading,
}) => {
  const { t } = useTranslation();
  if (loading) return <InlineLoading description={t('WARDS_LOADING_ROW')} />;
  if (!vitals)
    return <span className={today.meta}>{t('WARDS_NOT_LOADED')}</span>;
  const now = new Date();
  const { values } = vitals;
  const parts = [
    values.systolic !== undefined &&
      values.diastolic !== undefined &&
      t('WARDS_VITAL_BP', { sys: values.systolic, dia: values.diastolic }),
    values.pulse !== undefined &&
      t('WARDS_VITAL_PULSE', { value: values.pulse }),
    values.temperature !== undefined &&
      t('WARDS_VITAL_TEMP', { value: values.temperature }),
    values.spo2 !== undefined && t('WARDS_VITAL_SPO2', { value: values.spo2 }),
    values.respiratoryRate !== undefined &&
      t('WARDS_VITAL_RR', { value: values.respiratoryRate }),
  ].filter(Boolean);
  const due = vitalsDue(vitals, now);
  return (
    <div className={styles.vitals}>
      <span className={`${today.status} ${due ? today.waiting : today.done}`}>
        {due ? t('WARDS_VITALS_DUE') : t('WARDS_VITALS_DONE')}
      </span>
      <span className={today.meta}>
        {vitals.takenAt
          ? t(
              hoursAgo(vitals.takenAt, now) < 48
                ? 'WARDS_VITALS_TAKEN'
                : 'WARDS_VITALS_TAKEN_DAYS',
              {
                when: clock.format(new Date(vitals.takenAt)),
                count:
                  hoursAgo(vitals.takenAt, now) < 48
                    ? hoursAgo(vitals.takenAt, now)
                    : Math.floor(hoursAgo(vitals.takenAt, now) / 24),
              },
            )
          : t('WARDS_VITALS_NONE')}
      </span>
      {parts.length > 0 && <span>{parts.join(' · ')}</span>}
    </div>
  );
};

const MedicinesCell: React.FC<{
  medicines?: CurrentMedicine[];
  loading: boolean;
}> = ({ medicines, loading }) => {
  const { t } = useTranslation();
  if (loading) return <InlineLoading description={t('WARDS_LOADING_ROW')} />;
  if (!medicines)
    return <span className={today.meta}>{t('WARDS_NOT_LOADED')}</span>;
  if (medicines.length === 0) {
    return <span className={today.meta}>{t('WARDS_NO_MEDICINES')}</span>;
  }
  return (
    <ul className={styles.medicines}>
      {medicines.map((medicine) => (
        <li key={medicine.uuid}>
          <strong>{medicine.name}</strong>
          <span className={today.meta}>
            {[medicine.dose, medicine.route, medicine.frequency]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
};

/**
 * The nurse's first screen: every occupied bed in the chosen ward, whose readings
 * are due and what each patient is on. Everything here only reads the record.
 */
export const WardsPage: React.FC = () => {
  const { t } = useTranslation();
  const canView = useHasPrivilege('app:adt');
  const canOpenChart = useHasPrivilege('app:clinical');
  const { items, loading: permissionsLoading } = useShellNavigation(
    [],
    process.env.NODE_ENV !== 'production' ? REVIEW_URLS : undefined,
  );
  const admissions = items.find((item) => item.id === 'bahmni.ipd');
  const [chosen, setChosen] = useState('');
  const [view, setView] = useState<'beds' | 'medicines'>('beds');

  const wards = useQuery({
    queryKey: ['wards'],
    queryFn: getWards,
    enabled: canView,
    ...QUERY_OPTIONS,
  });
  const wardList = wards.data ?? [];
  // Open the first ward with patients, so the page starts on real work.
  const ward =
    wardList.find(({ ward: w }) => w.uuid === chosen) ??
    wardList.find(({ occupiedBeds }) => occupiedBeds > 0) ??
    wardList[0];

  const beds = useQuery({
    queryKey: ['wards', 'beds', ward?.ward.uuid],
    queryFn: () => getOccupiedBeds(ward!.ward.uuid),
    enabled: Boolean(ward),
    ...QUERY_OPTIONS,
  });
  const occupied: WardBed[] = beds.data ?? [];
  const vitals = useQueries({
    queries: occupied.map((bed) => ({
      queryKey: ['wards', 'vitals', bed.patientUuid],
      queryFn: () => getLatestVitals(bed.patientUuid),
      ...QUERY_OPTIONS,
    })),
  });
  const medicines = useQueries({
    queries: occupied.map((bed) => ({
      queryKey: ['wards', 'medicines', bed.patientUuid],
      queryFn: () => getCurrentMedicines(bed.patientUuid),
      ...QUERY_OPTIONS,
    })),
  });

  const admitted = wardList.reduce((sum, w) => sum + w.occupiedBeds, 0);
  const free = wardList.reduce(
    (sum, w) => sum + Math.max(0, w.totalBeds - w.occupiedBeds),
    0,
  );
  const dueCount = vitals.filter(
    (query) => query.data && vitalsDue(query.data),
  ).length;
  const vitalsLoaded = vitals.every((query) => !query.isPending);

  const heading = (
    <div className={today.heading}>
      <div>
        <h1>{t('WARDS_TITLE')}</h1>
        <p className={today.lead}>
          {wards.isSuccess
            ? t('WARDS_LEAD', { count: admitted, wards: wardList.length })
            : t('WARDS_LEAD_LOADING')}
        </p>
      </div>
      {admissions && (
        <Button kind="tertiary" href={admissions.href}>
          {t('WARDS_ADMISSIONS')}
        </Button>
      )}
    </div>
  );

  // Until permissions arrive every check is false; wait rather than refuse.
  if (permissionsLoading) {
    return (
      <main className={today.page}>
        <h1 className={styles.plainTitle}>{t('WARDS_TITLE')}</h1>
        <InlineLoading description={t('WARDS_LOADING')} />
      </main>
    );
  }

  if (!canView) {
    return (
      <main className={today.page}>
        <h1 className={styles.plainTitle}>{t('WARDS_TITLE')}</h1>
        <p className={today.muted}>{t('WARDS_NO_ACCESS')}</p>
      </main>
    );
  }

  const renderBeds = () => {
    if (wards.isPending || beds.isPending) {
      return <InlineLoading description={t('WARDS_LOADING')} />;
    }
    if (wards.isError || beds.isError) {
      return (
        <p role="alert" className={today.error}>
          {t('WARDS_ERROR')}
        </p>
      );
    }
    if (occupied.length === 0) {
      return <p className={today.empty}>{t('WARDS_EMPTY')}</p>;
    }
    return (
      <div className={today.tableWrap}>
        <table className={`${today.queue} ${styles.board}`}>
          <thead>
            <tr>
              <th scope="col">{t('WARDS_COLUMN_BED')}</th>
              <th scope="col">{t('WARDS_COLUMN_PATIENT')}</th>
              <th scope="col">{t('WARDS_COLUMN_VITALS')}</th>
              <th scope="col">{t('WARDS_COLUMN_MEDICINES')}</th>
              <th scope="col">
                <span className={today.visuallyHidden}>
                  {t('WARDS_COLUMN_ACTION')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {occupied.map((bed, index) => (
              <tr key={bed.bedId}>
                <td className={styles.bed}>
                  <strong>{bed.bedNumber}</strong>
                  <span className={today.meta}>{bed.room}</span>
                </td>
                <td>
                  {canOpenChart ? (
                    <Link
                      className={today.patient}
                      to={`/home/records/${encodeURIComponent(bed.patientUuid)}`}
                    >
                      {bed.name}
                    </Link>
                  ) : (
                    <span className={today.patient}>{bed.name}</span>
                  )}
                  <span className={today.meta}>
                    {[
                      bed.age !== null && t('TODAY_AGE', { count: bed.age }),
                      bed.gender,
                      bed.identifier,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </td>
                <td>
                  <VitalsCell
                    vitals={vitals[index]?.data}
                    loading={Boolean(vitals[index]?.isPending)}
                  />
                </td>
                <td>
                  <MedicinesCell
                    medicines={medicines[index]?.data}
                    loading={Boolean(medicines[index]?.isPending)}
                  />
                </td>
                <td className={today.action}>
                  {canOpenChart && (
                    <Button
                      size="sm"
                      kind="tertiary"
                      href={`/bahmni-v2/clinical/${encodeURIComponent(bed.patientUuid)}`}
                    >
                      {t('WARDS_RECORD_VITALS')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className={today.page}>
      {heading}
      <dl className={styles.stats} aria-label={t('WARDS_SUMMARY')}>
        <div>
          <dt>{t('WARDS_COUNT_ADMITTED')}</dt>
          <dd>{admitted}</dd>
        </div>
        <div className={dueCount > 0 ? styles.statAlert : undefined}>
          <dt>{t('WARDS_COUNT_DUE', { ward: ward?.ward.name ?? '' })}</dt>
          <dd>{vitalsLoaded ? dueCount : '…'}</dd>
        </div>
        <div>
          <dt>{t('WARDS_COUNT_FREE')}</dt>
          <dd>{free}</dd>
        </div>
      </dl>
      <div className={styles.viewRow}>
        {wardList.length > 1 && (
          <div
            className={styles.wardPicker}
            role="group"
            aria-label={t('WARDS_PICK')}
          >
            {wardList.map(({ ward: w, occupiedBeds, totalBeds }) => (
              <button
                key={w.uuid}
                type="button"
                aria-pressed={w.uuid === ward?.ward.uuid}
                className={
                  w.uuid === ward?.ward.uuid ? styles.wardOn : styles.ward
                }
                onClick={() => setChosen(w.uuid)}
              >
                <strong>{w.name}</strong>
                <span>
                  {t('WARDS_BEDS_USED', {
                    used: occupiedBeds,
                    total: totalBeds,
                  })}
                </span>
              </button>
            ))}
          </div>
        )}
        <div
          className={styles.viewSwitch}
          role="group"
          aria-label={t('WARDS_VIEW')}
        >
          <button
            type="button"
            aria-pressed={view === 'beds'}
            className={view === 'beds' ? styles.viewOn : styles.viewOff}
            onClick={() => setView('beds')}
          >
            {t('WARDS_VIEW_BEDS')}
          </button>
          <button
            type="button"
            aria-pressed={view === 'medicines'}
            className={view === 'medicines' ? styles.viewOn : styles.viewOff}
            onClick={() => setView('medicines')}
          >
            {t('WARDS_VIEW_MEDICINES')}
          </button>
        </div>
      </div>
      {view === 'beds' ? (
        <section
          className={styles.boardPanel}
          aria-label={ward ? ward.ward.name : t('WARDS_TITLE')}
        >
          {renderBeds()}
        </section>
      ) : (
        <MedicineRound
          beds={occupied}
          medicines={medicines.map((query) => query.data)}
        />
      )}

      <p className={styles.note}>{t('WARDS_DUE_RULE')}</p>
    </main>
  );
};

export default WardsPage;
