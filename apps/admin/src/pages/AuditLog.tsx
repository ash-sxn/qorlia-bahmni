import { get, useTranslation } from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import styles from './styles/AuditLog.module.scss';

interface AuditEntry {
  auditLogId: number;
  dateCreated: number;
  eventType: string;
  userId?: string;
  patientId?: string;
  message: string;
  module: string;
}

interface AuditRequest {
  mode: 'default' | 'filter' | 'next' | 'prev';
  startFrom: string;
  username: string;
  patientId: string;
  cursor?: number;
  sequence: number;
}

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

export const auditLogUrl = (request: AuditRequest) => {
  const params = new URLSearchParams();
  if (request.startFrom) params.set('startFrom', request.startFrom);
  if (request.mode === 'default') params.set('defaultView', 'true');
  if (request.username) params.set('username', request.username);
  if (request.patientId) params.set('patientId', request.patientId);
  if (request.cursor !== undefined)
    params.set('lastAuditLogId', String(request.cursor));
  if (request.mode === 'prev') params.set('prev', 'true');
  return `/openmrs/ws/rest/v1/auditlog?${params}`;
};

const readAuditLogs = async (request: AuditRequest): Promise<AuditEntry[]> => {
  const data = await get<unknown>(auditLogUrl(request));
  if (
    !Array.isArray(data) ||
    data.some(
      (row) =>
        !row ||
        typeof row !== 'object' ||
        !Number.isSafeInteger(row.auditLogId) ||
        row.auditLogId < 1 ||
        typeof row.dateCreated !== 'number' ||
        !Number.isFinite(new Date(row.dateCreated).getTime()) ||
        typeof row.eventType !== 'string' ||
        typeof row.message !== 'string' ||
        typeof row.module !== 'string' ||
        (row.userId != null && typeof row.userId !== 'string') ||
        (row.patientId != null && typeof row.patientId !== 'string'),
    )
  )
    throw new Error('Invalid audit log response');
  return data;
};

const auditMessage = (
  log: AuditEntry,
  translate: (key: string, options?: Record<string, unknown>) => string,
) => {
  const separator = log.message.indexOf('~');
  const key = separator < 0 ? log.message : log.message.slice(0, separator);
  const json = separator < 0 ? undefined : log.message.slice(separator + 1);
  try {
    return translate(key, {
      ...log,
      params: json ? JSON.parse(json) : undefined,
    });
  } catch {
    return log.message;
  }
};

export const AuditLog = () => {
  const { t } = useTranslation();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('00:00');
  const [username, setUsername] = useState('');
  const [patientId, setPatientId] = useState('');
  const [request, setRequest] = useState<AuditRequest>(() => ({
    mode: 'default',
    startFrom: new Date(`${today()}T00:00:00`).toISOString(),
    username: '',
    patientId: '',
    sequence: 0,
  }));
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [notice, setNotice] = useState('');

  const logs = useQuery({
    queryKey: ['admin', 'audit-log', request],
    queryFn: () => readAuditLogs(request),
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!logs.data) return;
    if (logs.data.length) {
      setRows(
        request.mode === 'default' ? [...logs.data].reverse() : logs.data,
      );
      setNotice('');
    } else if (request.mode === 'next' || request.mode === 'prev') {
      setNotice('ADMIN_AUDIT_NO_MORE');
    } else {
      setRows([]);
      setNotice('ADMIN_AUDIT_EMPTY');
    }
  }, [logs.data, request.mode]);

  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedTime = time || '00:00';
    const start = date ? new Date(`${date}T${selectedTime}:00`) : undefined;
    if (
      start &&
      (!Number.isFinite(start.getTime()) ||
        date > today() ||
        start.getFullYear() !== Number(date.slice(0, 4)) ||
        start.getMonth() + 1 !== Number(date.slice(5, 7)) ||
        start.getDate() !== Number(date.slice(8, 10)) ||
        start.getHours() !== Number(selectedTime.slice(0, 2)) ||
        start.getMinutes() !== Number(selectedTime.slice(3, 5)))
    ) {
      setNotice('ADMIN_AUDIT_INVALID_DATE');
      return;
    }
    setRows([]);
    setNotice('');
    setRequest((current) => ({
      mode: 'filter',
      startFrom: start?.toISOString() ?? '',
      username: username.trim(),
      patientId: patientId.trim(),
      sequence: current.sequence + 1,
    }));
  };

  const page = (mode: 'next' | 'prev') => {
    if (logs.isFetching || logs.isError) return;
    if (!rows.length) {
      if (mode !== 'prev') return;
      // Native Previous reloads the default view when both cursors are empty.
      // Clear the visible identity filters too, so the table never mislabels it.
      setUsername('');
      setPatientId('');
      setNotice('');
      setRequest((current) => ({
        mode: 'default',
        startFrom: current.startFrom,
        username: '',
        patientId: '',
        sequence: current.sequence + 1,
      }));
      return;
    }
    setNotice('');
    setRequest((current) => ({
      ...current,
      mode,
      cursor:
        mode === 'next' ? rows[rows.length - 1].auditLogId : rows[0].auditLogId,
      sequence: current.sequence + 1,
    }));
  };

  return (
    <AdminLayout>
      <section className={styles.page} aria-label={t('ADMIN_AUDIT_TITLE')}>
        <p className={styles.eyebrow}>{t('BREADCRUMB_ADMIN')}</p>
        <h1>{t('ADMIN_AUDIT_TITLE')}</h1>
        <p className={styles.description}>{t('ADMIN_AUDIT_DESCRIPTION')}</p>

        <form className={styles.filters} onSubmit={filter}>
          <label>
            {t('ADMIN_AUDIT_DATE')}
            <input
              type="date"
              max={today()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            {t('ADMIN_AUDIT_TIME')}
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
          <label>
            {t('ADMIN_AUDIT_USERNAME')}
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            {t('ADMIN_AUDIT_PATIENT_ID')}
            <input
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
            />
          </label>
          <button type="submit" disabled={logs.isFetching}>
            {t('ADMIN_AUDIT_FILTER')}
          </button>
        </form>

        <div className={styles.card}>
          <div className={styles.cardHeading}>
            <h2>{t('ADMIN_AUDIT_EVENTS')}</h2>
            <span>
              {rows.length
                ? t('ADMIN_AUDIT_COUNT', { count: rows.length })
                : ''}
            </span>
          </div>
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('ADMIN_AUDIT_EVENT_ID')}</th>
                  <th scope="col">{t('ADMIN_AUDIT_CREATED')}</th>
                  <th scope="col">{t('ADMIN_AUDIT_EVENT_TYPE')}</th>
                  <th scope="col">{t('ADMIN_AUDIT_USERNAME')}</th>
                  <th scope="col">{t('ADMIN_AUDIT_PATIENT_ID')}</th>
                  <th scope="col">{t('ADMIN_AUDIT_MESSAGE')}</th>
                  <th scope="col">{t('ADMIN_AUDIT_MODULE')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <tr key={log.auditLogId}>
                    <td>{log.auditLogId}</td>
                    <td>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      }).format(new Date(log.dateCreated))}
                    </td>
                    <td>{t(log.eventType)}</td>
                    <td>{log.userId}</td>
                    <td>{log.patientId}</td>
                    <td>{auditMessage(log, t)}</td>
                    <td>{t(log.module)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs.isFetching && <p role="status">{t('ADMIN_AUDIT_LOADING')}</p>}
          {logs.isError && (
            <div role="alert">
              <p>{t('ADMIN_AUDIT_ERROR')}</p>
              <button
                type="button"
                className={styles.retry}
                disabled={logs.isFetching}
                onClick={() => logs.refetch()}
              >
                {t('ADMIN_ORDER_TRY_AGAIN')}
              </button>
            </div>
          )}
          {notice && <p role="status">{t(notice)}</p>}
          <div className={styles.pagination}>
            <button
              type="button"
              disabled={logs.isFetching || logs.isError}
              onClick={() => page('prev')}
            >
              {t('ADMIN_AUDIT_PREVIOUS')}
            </button>
            <button
              type="button"
              disabled={!rows.length || logs.isFetching || logs.isError}
              onClick={() => page('next')}
            >
              {t('ADMIN_AUDIT_NEXT')}
            </button>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
};
