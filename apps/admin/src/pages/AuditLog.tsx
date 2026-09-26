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
  const params = new URLSearchParams({ startFrom: request.startFrom });
  if (request.mode === 'default') params.set('defaultView', 'true');
  if (request.username) params.set('username', request.username);
  if (request.patientId) params.set('patientId', request.patientId);
  if (request.cursor !== undefined)
    params.set('lastAuditLogId', String(request.cursor));
  if (request.mode === 'prev') params.set('prev', 'true');
  return `/openmrs/ws/rest/v1/auditlog?${params}`;
};

const auditMessage = (
  log: AuditEntry,
  translate: (key: string, options?: Record<string, unknown>) => string,
) => {
  const [key, json] = log.message.split('~', 2);
  try {
    return translate(key, { ...log, params: json ? JSON.parse(json) : undefined });
  } catch {
    return key;
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
    queryFn: () => get<AuditEntry[]>(auditLogUrl(request)),
  });

  useEffect(() => {
    if (!logs.data) return;
    if (logs.data.length) {
      setRows(request.mode === 'default' ? [...logs.data].reverse() : logs.data);
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
    if (date > today()) return;
    setRows([]);
    setNotice('');
    setRequest((current) => ({
      mode: 'filter',
      startFrom: new Date(`${date}T${time}:00`).toISOString(),
      username: username.trim(),
      patientId: patientId.trim(),
      sequence: current.sequence + 1,
    }));
  };

  const page = (mode: 'next' | 'prev') => {
    if (!rows.length) return;
    setNotice('');
    setRequest((current) => ({
      ...current,
      mode,
      cursor: mode === 'next' ? rows[rows.length - 1].auditLogId : rows[0].auditLogId,
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
          <label>{t('ADMIN_AUDIT_DATE')}
            <input type="date" required max={today()} value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>{t('ADMIN_AUDIT_TIME')}
            <input type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label>{t('ADMIN_AUDIT_USERNAME')}
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>{t('ADMIN_AUDIT_PATIENT_ID')}
            <input value={patientId} onChange={(event) => setPatientId(event.target.value)} />
          </label>
          <button type="submit" disabled={logs.isFetching}>{t('ADMIN_AUDIT_FILTER')}</button>
        </form>

        <div className={styles.card}>
          <div className={styles.cardHeading}>
            <h2>{t('ADMIN_AUDIT_EVENTS')}</h2>
            <span>{rows.length ? t('ADMIN_AUDIT_COUNT', { count: rows.length }) : ''}</span>
          </div>
          <div className={styles.tableScroll}>
            <table>
              <thead><tr>
                <th scope="col">{t('ADMIN_AUDIT_EVENT_ID')}</th>
                <th scope="col">{t('ADMIN_AUDIT_CREATED')}</th>
                <th scope="col">{t('ADMIN_AUDIT_EVENT_TYPE')}</th>
                <th scope="col">{t('ADMIN_AUDIT_USERNAME')}</th>
                <th scope="col">{t('ADMIN_AUDIT_PATIENT_ID')}</th>
                <th scope="col">{t('ADMIN_AUDIT_MESSAGE')}</th>
                <th scope="col">{t('ADMIN_AUDIT_MODULE')}</th>
              </tr></thead>
              <tbody>{rows.map((log) => <tr key={log.auditLogId}>
                <td>{log.auditLogId}</td>
                <td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(log.dateCreated))}</td>
                <td>{log.eventType}</td>
                <td>{log.userId}</td>
                <td>{log.patientId}</td>
                <td>{auditMessage(log, t)}</td>
                <td>{t(log.module)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {logs.isFetching && <p role="status">{t('ADMIN_AUDIT_LOADING')}</p>}
          {logs.isError && <p role="alert">{t('ADMIN_AUDIT_ERROR')}</p>}
          {notice && <p role="status">{t(notice)}</p>}
          <div className={styles.pagination}>
            <button type="button" disabled={!rows.length || logs.isFetching} onClick={() => page('prev')}>{t('ADMIN_AUDIT_PREVIOUS')}</button>
            <button type="button" disabled={!rows.length || logs.isFetching} onClick={() => page('next')}>{t('ADMIN_AUDIT_NEXT')}</button>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
};
