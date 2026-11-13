import { InlineLoading, Loading, Tile } from '@bahmni/design-system';
import { hasPrivilege, useTranslation } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { ReactNode, useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import styles from './HospitalOverview.module.scss';
import {
  countByStatus,
  countOutpatientVisits,
  wardBedCounts,
} from './overviewFigures';
import {
  countEncountersForDay,
  getAppointmentsForDay,
  getVisitsForDay,
  getWardBeds,
} from './overviewService';

/** The privilege each section needs. A section the user lacks it for is not loaded. */
export const OVERVIEW_PRIVILEGES = {
  visits: 'Get Visits',
  encounters: 'Get Encounters',
  appointments: 'View Appointments',
  beds: 'Get Admission Locations',
};

/** Read-only figures: no automatic retry and no reload when the window regains focus. */
const QUERY_OPTIONS = { retry: false, refetchOnWindowFocus: false } as const;

/** Shows the no-permission, loading or error state, or the figure once it has arrived. */
const QueryState = <T,>({
  allowed,
  query,
  children,
}: {
  allowed: boolean;
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) => {
  const { t } = useTranslation();

  if (!allowed) {
    return (
      <p className={styles.muted}>{t('HOSPITAL_OVERVIEW_NO_PERMISSION')}</p>
    );
  }
  if (query.isPending) {
    return <InlineLoading description={t('HOSPITAL_OVERVIEW_LOADING')} />;
  }
  if (query.isError) {
    return (
      <p role="alert" className={styles.error}>
        {t('HOSPITAL_OVERVIEW_LOAD_ERROR')}
      </p>
    );
  }
  return <>{children(query.data)}</>;
};

/** A labelled section: its heading names the region for screen readers and tests. */
const FigureSection = ({
  title,
  note,
  level = 3,
  className,
  children,
}: {
  title: string;
  note: string;
  level?: 2 | 3;
  className?: string;
  children: ReactNode;
}) => {
  const headingId = useId();
  const Heading = level === 2 ? 'h2' : 'h3';

  return (
    <section aria-labelledby={headingId} className={className}>
      <Heading id={headingId}>{title}</Heading>
      {children}
      <p className={styles.note}>{note}</p>
    </section>
  );
};

export const HospitalOverviewPage = () => {
  const { t } = useTranslation();
  const { userPrivileges, error: privilegeError } = useUserPrivilege();
  // One fixed "today" for the whole page, so every figure counts the same day.
  const today = useMemo(() => new Date(), []);
  const dayKey = today.toDateString();

  const ready = userPrivileges !== null && !privilegeError;
  const can = (privilege: string) =>
    ready && hasPrivilege(userPrivileges, privilege);
  const canVisits = can(OVERVIEW_PRIVILEGES.visits);
  const canEncounters = can(OVERVIEW_PRIVILEGES.encounters);
  const canAppointments = can(OVERVIEW_PRIVILEGES.appointments);
  const canBeds = can(OVERVIEW_PRIVILEGES.beds);

  const visits = useQuery({
    queryKey: ['hospital-overview', 'visits', dayKey],
    queryFn: () => getVisitsForDay(today),
    select: countOutpatientVisits,
    enabled: canVisits,
    ...QUERY_OPTIONS,
  });
  const admissions = useQuery({
    queryKey: ['hospital-overview', 'encounters', 'ADMISSION', dayKey],
    queryFn: () => countEncountersForDay('ADMISSION', today),
    enabled: canEncounters,
    ...QUERY_OPTIONS,
  });
  const discharges = useQuery({
    queryKey: ['hospital-overview', 'encounters', 'DISCHARGE', dayKey],
    queryFn: () => countEncountersForDay('DISCHARGE', today),
    enabled: canEncounters,
    ...QUERY_OPTIONS,
  });
  const appointments = useQuery({
    queryKey: ['hospital-overview', 'appointments', dayKey],
    queryFn: () => getAppointmentsForDay(today),
    select: countByStatus,
    enabled: canAppointments,
    ...QUERY_OPTIONS,
  });
  const beds = useQuery({
    queryKey: ['hospital-overview', 'beds'],
    queryFn: getWardBeds,
    select: wardBedCounts,
    enabled: canBeds,
    ...QUERY_OPTIONS,
  });

  if (privilegeError) {
    return (
      <main className={styles.page}>
        <p role="alert" className={styles.error}>
          {t('HOSPITAL_OVERVIEW_SIGN_IN_ERROR')}
        </p>
        <Link to="/login">{t('HOSPITAL_OVERVIEW_SIGN_IN_AGAIN')}</Link>
      </main>
    );
  }
  if (!ready) {
    return <Loading />;
  }

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to="/home/">{t('HOME_LABEL')}</Link>
        <h1>{t('HOSPITAL_OVERVIEW_TITLE')}</h1>
        <p>
          {t('HOSPITAL_OVERVIEW_INTRO', {
            date: new Intl.DateTimeFormat(undefined, {
              dateStyle: 'full',
            }).format(today),
          })}
        </p>

        <h2>{t('HOSPITAL_OVERVIEW_TODAY')}</h2>
        <div className={styles.tiles}>
          <Tile className={styles.tile}>
            <FigureSection
              title={t('HOSPITAL_OVERVIEW_OUTPATIENT')}
              note={t('HOSPITAL_OVERVIEW_OUTPATIENT_NOTE')}
            >
              <QueryState allowed={canVisits} query={visits}>
                {({ total, byType }) => (
                  <>
                    <p className={styles.figure}>{total}</p>
                    <ul className={styles.breakdown}>
                      {Object.entries(byType).map(([type, count]) => (
                        <li key={type}>{`${type}: ${count}`}</li>
                      ))}
                    </ul>
                  </>
                )}
              </QueryState>
            </FigureSection>
          </Tile>

          <Tile className={styles.tile}>
            <FigureSection
              title={t('HOSPITAL_OVERVIEW_ADMISSIONS')}
              note={t('HOSPITAL_OVERVIEW_ADMISSIONS_NOTE')}
            >
              <QueryState allowed={canEncounters} query={admissions}>
                {(count) => <p className={styles.figure}>{count}</p>}
              </QueryState>
            </FigureSection>
          </Tile>

          <Tile className={styles.tile}>
            <FigureSection
              title={t('HOSPITAL_OVERVIEW_DISCHARGES')}
              note={t('HOSPITAL_OVERVIEW_DISCHARGES_NOTE')}
            >
              <QueryState allowed={canEncounters} query={discharges}>
                {(count) => <p className={styles.figure}>{count}</p>}
              </QueryState>
            </FigureSection>
          </Tile>

          <Tile className={styles.tile}>
            <FigureSection
              title={t('HOSPITAL_OVERVIEW_REGISTRATIONS')}
              note={t('HOSPITAL_OVERVIEW_REGISTRATIONS_NOTE')}
            >
              <p className={styles.muted}>
                {t('HOSPITAL_OVERVIEW_REGISTRATIONS_UNAVAILABLE')}
              </p>
            </FigureSection>
          </Tile>
        </div>

        <FigureSection
          level={2}
          className={styles.block}
          title={t('HOSPITAL_OVERVIEW_APPOINTMENTS')}
          note={t('HOSPITAL_OVERVIEW_APPOINTMENTS_NOTE')}
        >
          <QueryState allowed={canAppointments} query={appointments}>
            {(rows) =>
              rows.length === 0 ? (
                <p className={styles.muted}>
                  {t('HOSPITAL_OVERVIEW_APPOINTMENTS_EMPTY')}
                </p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">
                        {t('HOSPITAL_OVERVIEW_COLUMN_STATUS')}
                      </th>
                      <th scope="col">
                        {t('HOSPITAL_OVERVIEW_COLUMN_APPOINTMENTS')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ status, count }) => (
                      <tr key={status}>
                        <th scope="row">{status}</th>
                        <td>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </QueryState>
        </FigureSection>

        <FigureSection
          level={2}
          className={styles.block}
          title={t('HOSPITAL_OVERVIEW_BEDS')}
          note={t('HOSPITAL_OVERVIEW_BEDS_NOTE')}
        >
          <QueryState allowed={canBeds} query={beds}>
            {(rows) =>
              rows.length === 0 ? (
                <p className={styles.muted}>
                  {t('HOSPITAL_OVERVIEW_BEDS_EMPTY')}
                </p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t('HOSPITAL_OVERVIEW_COLUMN_WARD')}</th>
                      <th scope="col">{t('HOSPITAL_OVERVIEW_COLUMN_TOTAL')}</th>
                      <th scope="col">
                        {t('HOSPITAL_OVERVIEW_COLUMN_OCCUPIED')}
                      </th>
                      <th scope="col">{t('HOSPITAL_OVERVIEW_COLUMN_FREE')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ ward, total, occupied, free }) => (
                      <tr key={ward}>
                        <th scope="row">{ward}</th>
                        <td>{total}</td>
                        <td>{occupied}</td>
                        <td>{free}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </QueryState>
        </FigureSection>
      </main>
    </>
  );
};
