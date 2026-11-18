import { Button, InlineLoading, Panel } from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import {
  PATIENTS_ID,
  useActivePractitioner,
  useHasPrivilege,
  useShellNavigation,
} from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '../common/ButtonLink';
import { REVIEW_URLS } from '../HomeShell';
import styles from './Today.module.scss';
import { getTodayQueue, isWaiting, QueueEntry } from './todayService';

type Tab = 'waiting' | 'seen';

const time = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});
const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const greetingKey = (hour: number) => {
  if (hour < 12) return 'TODAY_GOOD_MORNING';
  if (hour < 17) return 'TODAY_GOOD_AFTERNOON';
  return 'TODAY_GOOD_EVENING';
};

const consultationHref = (entry: QueueEntry) =>
  `/home/dictation?patient=${encodeURIComponent(entry.patientUuid)}`;
const chartHref = (entry: QueueEntry) =>
  `/home/records/${encodeURIComponent(entry.patientUuid)}`;

const firstName = (display?: string) =>
  (display ?? '').replace(/^.*? - /, '').split(' ')[0] ?? '';

/**
 * The first screen after signing in. Doctors see today's queue with one button to
 * start each consultation; other staff see the work their menu holds.
 */
export const TodayPage: React.FC = () => {
  const { t } = useTranslation();
  const canConsult = useHasPrivilege('app:clinical');
  const { practitioner, user } = useActivePractitioner();
  const { items } = useShellNavigation(
    [],
    process.env.NODE_ENV !== 'production' ? REVIEW_URLS : undefined,
  );
  const [tab, setTab] = useState<Tab>('waiting');
  const now = new Date();
  const queue = useQuery({
    queryKey: ['today', 'queue', now.toDateString()],
    queryFn: () => getTodayQueue(now),
    enabled: canConsult,
    refetchInterval: 60_000,
    retry: false,
  });

  const name = firstName(practitioner?.person?.display ?? user?.username);
  const entries = queue.data ?? [];
  const waiting = entries.filter(isWaiting);
  const seen = entries.filter((entry) => !isWaiting(entry));
  const shown = tab === 'waiting' ? waiting : seen;
  const next = waiting[0];
  const registration = items.find(
    (item) =>
      item.id === 'bahmni.registration.new' ||
      item.id === 'bahmni.registration',
  );
  const workItems = items.filter(
    (item) => item.group === 'work' && item.id !== 'qorlia.today',
  );

  const heading = (
    <div className={styles.heading}>
      <div>
        <h1>
          {name ? t(greetingKey(now.getHours()), { name }) : t('TODAY_TITLE')}
        </h1>
        <p className={styles.lead}>
          {canConsult && queue.isSuccess
            ? t('TODAY_LEAD_WAITING', {
                date: longDate.format(now),
                count: waiting.length,
              })
            : longDate.format(now)}
        </p>
      </div>
      {registration && (
        <Button kind="tertiary" href={registration.href}>
          {t('TODAY_REGISTER')}
        </Button>
      )}
    </div>
  );

  if (!canConsult) {
    return (
      <main className={styles.page}>
        {heading}
        <Panel title={t('TODAY_YOUR_WORK')}>
          {workItems.length === 0 ? (
            <p className={styles.muted}>{t('TODAY_NO_WORK')}</p>
          ) : (
            <ul className={styles.workList}>
              {workItems.map((item) => (
                <li key={item.id}>
                  <Button kind="tertiary" href={item.href}>
                    {item.label}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
    );
  }

  const renderRows = () => {
    if (queue.isPending) {
      return <InlineLoading description={t('TODAY_LOADING')} />;
    }
    if (queue.isError) {
      return (
        <p role="alert" className={styles.error}>
          {t('TODAY_ERROR')}
        </p>
      );
    }
    if (shown.length === 0) {
      return (
        <p className={styles.empty}>
          {tab === 'waiting' ? t('TODAY_NOBODY_WAITING') : t('TODAY_NONE_SEEN')}
        </p>
      );
    }
    return (
      <div className={styles.tableWrap}>
        <table className={styles.queue}>
          <thead>
            <tr>
              <th scope="col">{t('TODAY_COLUMN_TIME')}</th>
              <th scope="col">{t('TODAY_COLUMN_PATIENT')}</th>
              <th scope="col">{t('TODAY_COLUMN_VISIT')}</th>
              <th scope="col">{t('TODAY_COLUMN_STATUS')}</th>
              <th scope="col">
                <span className={styles.visuallyHidden}>
                  {t('TODAY_COLUMN_ACTION')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.visitUuid}>
                <td className={styles.time}>
                  {time.format(new Date(entry.started))}
                </td>
                <td>
                  <Link className={styles.patient} to={chartHref(entry)}>
                    {entry.name}
                  </Link>
                  <span className={styles.meta}>
                    {[
                      entry.age !== null &&
                        t('TODAY_AGE', { count: entry.age }),
                      entry.gender,
                      entry.identifier,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </td>
                <td>{entry.visitType}</td>
                <td>
                  <span
                    className={`${styles.status} ${isWaiting(entry) ? styles.waiting : styles.done}`}
                  >
                    {isWaiting(entry)
                      ? t('TODAY_STATUS_WAITING')
                      : t(
                          entry.open
                            ? 'TODAY_STATUS_SEEN'
                            : 'TODAY_STATUS_CLOSED',
                        )}
                  </span>
                </td>
                <td className={styles.action}>
                  {isWaiting(entry) ? (
                    <ButtonLink size="md" to={consultationHref(entry)}>
                      {t('TODAY_START')}
                    </ButtonLink>
                  ) : (
                    <ButtonLink size="md" kind="tertiary" to={chartHref(entry)}>
                      {t('TODAY_OPEN_CHART')}
                    </ButtonLink>
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
    <main className={styles.page}>
      {heading}
      <div className={styles.columns}>
        <section className={styles.queuePanel} aria-label={t('TODAY_QUEUE')}>
          <div
            role="tablist"
            aria-label={t('TODAY_QUEUE')}
            className={styles.tabs}
          >
            {(['waiting', 'seen'] as Tab[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? styles.tabOn : styles.tab}
                onClick={() => setTab(id)}
              >
                {t(id === 'waiting' ? 'TODAY_TAB_WAITING' : 'TODAY_TAB_SEEN', {
                  count: (id === 'waiting' ? waiting : seen).length,
                })}
              </button>
            ))}
          </div>
          <div role="tabpanel">{renderRows()}</div>
        </section>

        <aside className={styles.rail}>
          <Panel title={t('TODAY_NEXT')} variant="summary">
            {next ? (
              <div className={styles.next}>
                <p className={styles.nextName}>{next.name}</p>
                <p className={styles.meta}>
                  {[
                    next.age !== null && t('TODAY_AGE', { count: next.age }),
                    next.gender,
                    next.visitType,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <ButtonLink to={consultationHref(next)}>
                  {t('TODAY_START_CONSULTATION')}
                </ButtonLink>
                <Link className={styles.quiet} to={chartHref(next)}>
                  {t('TODAY_OPEN_CHART_FIRST')}
                </Link>
              </div>
            ) : (
              <p className={styles.muted}>{t('TODAY_NOBODY_NEXT')}</p>
            )}
          </Panel>
          <Panel title={t('TODAY_SUMMARY')} variant="summary">
            <dl className={styles.counts}>
              <dt>{t('TODAY_COUNT_WAITING')}</dt>
              <dd>{waiting.length}</dd>
              <dt>{t('TODAY_COUNT_SEEN')}</dt>
              <dd>{seen.length}</dd>
              <dt>{t('TODAY_COUNT_TOTAL')}</dt>
              <dd>{entries.length}</dd>
            </dl>
          </Panel>
          {items.some((item) => item.id === PATIENTS_ID) && (
            <Link className={styles.quiet} to="/home/records">
              {t('TODAY_FIND_ANYONE')}
            </Link>
          )}
        </aside>
      </div>
    </main>
  );
};

export default TodayPage;
