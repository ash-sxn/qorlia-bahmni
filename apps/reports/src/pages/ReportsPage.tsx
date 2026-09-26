import {
  BaseLayout,
  Header,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  get,
  getCurrentUser,
  hasPrivilege,
  useTranslation,
} from '@bahmni/services';
import { useUserPrivilege, UserGlobalAction } from '@bahmni/widgets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MY_REPORTS_TAB_PATH, REPORTS_TAB_PATH } from '../constants/app';
import {
  getQueuedReports,
  getReportCatalog,
  getReportSettings,
  reportFormats,
  reportRequestUrl,
  type QueuedReport,
} from './reportService';
import styles from './styles/ReportsPage.module.scss';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const ReportCatalogPanel = () => {
  const { t } = useTranslation();
  const { userPrivileges } = useUserPrivilege();
  const catalog = useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: getReportCatalog,
  });
  const settings = useQuery({
    queryKey: ['reports', 'settings'],
    queryFn: getReportSettings,
  });
  const currentUser = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
  });
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [format, setFormat] = useState('text/html');

  const reports = useMemo(
    () =>
      Object.entries(catalog.data ?? {})
        .filter(([, report]) =>
          hasPrivilege(userPrivileges, report.requiredPrivilege),
        )
        .filter(([, report]) =>
          report.name.toLowerCase().includes(search.toLowerCase()),
        ),
    [catalog.data, search, userPrivileges],
  );
  const reportName = reports.some(([id]) => id === selected)
    ? selected
    : (reports[0]?.[0] ?? '');
  const report = catalog.data?.[reportName];
  const datesValid =
    report?.config?.dateRangeRequired === false ||
    (Boolean(startDate) && Boolean(endDate) && startDate <= endDate);
  const formatValid =
    format !== 'application/vnd.ms-excel-custom' ||
    Boolean(report?.config?.macroTemplatePath);
  const request = {
    name: reportName,
    startDate,
    endDate,
    responseType: format,
    paperSize: settings.data?.config?.paperSize ?? 'A3',
    macroTemplateLocation: report?.config?.macroTemplatePath,
  };
  const schedule = useMutation({
    mutationFn: async () => {
      const response = await get<unknown>(
        reportRequestUrl('schedule', {
          ...request,
          userName: currentUser.data?.username,
        }),
      );
      if (typeof response === 'string' && /<html/i.test(response))
        throw new Error('Report queue requires a fresh sign-in.');
      return response;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['reports', 'queue'] }),
  });

  return (
    <section className={styles.section}>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>{t('REPORTS_CATALOG_EYEBROW')}</span>
        <h1>{t('REPORTS_CATALOG_TITLE')}</h1>
        <p>{t('REPORTS_CATALOG_DESCRIPTION')}</p>
      </div>
      {catalog.isPending || settings.isPending ? (
        <p role="status">{t('REPORTS_LOADING')}</p>
      ) : catalog.isError || settings.isError ? (
        <p role="alert">{t('REPORTS_CATALOG_ERROR')}</p>
      ) : (
        <div className={styles.catalogLayout}>
          <div className={styles.card}>
            <label className={styles.field}>
              {t('REPORTS_SEARCH')}
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div
              className={styles.reportList}
              aria-label={t('REPORTS_CATALOG_TITLE')}
            >
              {reports.map(([id, item]) => (
                <button
                  key={id}
                  type="button"
                  className={
                    id === reportName ? styles.selectedReport : styles.report
                  }
                  onClick={() => setSelected(id)}
                  aria-pressed={id === reportName}
                >
                  {item.name}
                </button>
              ))}
              {!reports.length && <p>{t('REPORTS_NO_MATCHES')}</p>}
            </div>
          </div>
          <div className={styles.card}>
            {report ? (
              <>
                <span className={styles.eyebrow}>{t('REPORTS_CONFIGURE')}</span>
                <h2>{report.name}</h2>
                <p className={styles.help}>{t('REPORTS_DATE_HELP')}</p>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    {t('REPORTS_FROM')}
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    {t('REPORTS_TO')}
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    {t('REPORTS_FORMAT')}
                    <select
                      value={format}
                      onChange={(event) => setFormat(event.target.value)}
                    >
                      {reportFormats.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!datesValid && (
                  <p role="alert">{t('REPORTS_INVALID_DATES')}</p>
                )}
                {!formatValid && (
                  <p role="alert">{t('REPORTS_CUSTOM_EXCEL_UNAVAILABLE')}</p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!datesValid || !formatValid}
                    onClick={() =>
                      window.open(
                        reportRequestUrl('report', request),
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                  >
                    {t('REPORTS_RUN_NOW')}
                  </button>
                  {settings.data?.config?.enableReportQueue && (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={
                        !datesValid ||
                        !formatValid ||
                        !currentUser.data?.username ||
                        schedule.isPending
                      }
                      onClick={() => schedule.mutate()}
                    >
                      {schedule.isPending
                        ? t('REPORTS_QUEUEING')
                        : t('REPORTS_QUEUE')}
                    </button>
                  )}
                </div>
                {schedule.isSuccess && (
                  <p role="status">{t('REPORTS_QUEUED')}</p>
                )}
                {schedule.isError && (
                  <p role="alert">{t('REPORTS_QUEUE_ERROR')}</p>
                )}
              </>
            ) : (
              <p>{t('REPORTS_NO_MATCHES')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

const MyReportsPanel = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentUser = useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
  });
  const queue = useQuery({
    queryKey: ['reports', 'queue', currentUser.data?.username],
    queryFn: () => getQueuedReports(currentUser.data!.username),
    enabled: Boolean(currentUser.data?.username),
  });
  const remove = useMutation({
    mutationFn: (id: QueuedReport['id']) =>
      get(`/bahmnireports/delete/${encodeURIComponent(id)}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['reports', 'queue'] }),
  });
  const rows = [...(queue.data ?? [])].sort((a, b) =>
    (b.requestDatetime ?? '').localeCompare(a.requestDatetime ?? ''),
  );

  return (
    <section className={styles.section}>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>{t('REPORTS_QUEUE_EYEBROW')}</span>
        <h1>{t('REPORTS_QUEUE_TITLE')}</h1>
        <p>{t('REPORTS_QUEUE_DESCRIPTION')}</p>
      </div>
      <div className={styles.card}>
        <div className={styles.queueHeading}>
          <h2>{t('REPORTS_QUEUE_TITLE')}</h2>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => queue.refetch()}
          >
            {t('REPORTS_REFRESH')}
          </button>
        </div>
        {currentUser.isPending || queue.isPending ? (
          <p role="status">{t('REPORTS_LOADING')}</p>
        ) : currentUser.isError || queue.isError ? (
          <p role="alert">{t('REPORTS_QUEUE_LOAD_ERROR')}</p>
        ) : !rows.length ? (
          <p>{t('REPORTS_QUEUE_EMPTY')}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>{t('REPORTS_NAME')}</th>
                  <th>{t('REPORTS_REQUESTED')}</th>
                  <th>{t('REPORTS_STATUS')}</th>
                  <th>{t('REPORTS_ACTIONS')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.requestDatetime ?? '...'}</td>
                    <td>
                      {row.status}
                      {row.errorMessage && (
                        <p role="alert">{row.errorMessage}</p>
                      )}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        {row.status.toLowerCase() === 'completed' && (
                          <a
                            href={`/bahmnireports/download/${encodeURIComponent(row.id)}`}
                          >
                            {t('REPORTS_DOWNLOAD')}
                          </a>
                        )}
                        {row.status.toLowerCase() !== 'processing' && (
                          <button
                            type="button"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm(t('REPORTS_DELETE_CONFIRM')))
                                remove.mutate(row.id);
                            }}
                          >
                            {t('REPORTS_DELETE')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {remove.isError && <p role="alert">{t('REPORTS_DELETE_ERROR')}</p>}
      </div>
    </section>
  );
};

const MY_REPORTS_TAB_INDEX = 1;
const REPORTS_TAB_INDEX = 0;

export const ReportsPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const breadcrumbItems = useMemo(
    () => [
      { id: 'home', label: t('REPORTS_HOME_LABEL'), href: BAHMNI_HOME_PATH },
      { id: 'reports', label: t('REPORTS_LABEL'), isCurrentPage: true },
    ],
    [t],
  );
  const selectedIndex =
    location.pathname === MY_REPORTS_TAB_PATH
      ? MY_REPORTS_TAB_INDEX
      : REPORTS_TAB_INDEX;
  const handleTabChange = useCallback(
    ({ selectedIndex: index }: { selectedIndex: number }) => {
      navigate(
        index === MY_REPORTS_TAB_INDEX ? MY_REPORTS_TAB_PATH : REPORTS_TAB_PATH,
      );
    },
    [navigate],
  );

  return (
    <BaseLayout
      header={
        <div
          id="reports-page-header"
          data-testid="reports-page-header-test-id"
          aria-label="Reports Page Header"
        >
          <Header
            breadcrumbItems={breadcrumbItems}
            userMenu={<UserGlobalAction />}
          />
        </div>
      }
      main={
        <div
          id="reports-page"
          data-testid="reports-page-test-id"
          aria-label="Reports Page"
          className={styles.page}
        >
          <Tabs selectedIndex={selectedIndex} onChange={handleTabChange}>
            <TabList
              id="reports-tab-list"
              data-testid="reports-tab-list-test-id"
              aria-label={t('REPORTS_TAB_LIST_ARIA_LABEL')}
            >
              <Tab
                id="reports-tab"
                data-testid="reports-tab-test-id"
                aria-label={t('REPORTS_TAB_LABEL')}
              >
                {t('REPORTS_TAB_LABEL')}
              </Tab>
              <Tab
                id="my-reports-tab"
                data-testid="my-reports-tab-test-id"
                aria-label={t('REPORTS_MY_REPORTS_TAB_LABEL')}
              >
                {t('REPORTS_MY_REPORTS_TAB_LABEL')}
              </Tab>
            </TabList>
            <TabPanels>
              <TabPanel
                id="reports-tab-panel"
                data-testid="reports-tab-panel-test-id"
                aria-label={t('REPORTS_TAB_LABEL')}
                className={styles.panel}
              >
                <ReportCatalogPanel />
              </TabPanel>
              <TabPanel
                id="my-reports-tab-panel"
                data-testid="my-reports-tab-panel-test-id"
                aria-label={t('REPORTS_MY_REPORTS_TAB_LABEL')}
                className={styles.panel}
              >
                <MyReportsPanel />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      }
    />
  );
};

export default ReportsPage;
