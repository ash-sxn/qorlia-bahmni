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
  formatDateTime,
  getCurrentUser,
  hasPrivilege,
  logAuditEvent,
  MODULE_LABELS,
  useTranslation,
} from '@bahmni/services';
import {
  ConfirmationModal,
  useUserPrivilege,
  UserGlobalAction,
} from '@bahmni/widgets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MY_REPORTS_TAB_PATH, REPORTS_TAB_PATH } from '../constants/app';
import {
  getQueuedReports,
  getReportCatalog,
  getReportSettings,
  reportFormats,
  availableReportFormats,
  deleteQueuedReport,
  reportDateRange,
  reportDateRanges,
  uploadReportTemplate,
  reportRequestUrl,
  type QueuedReport,
} from './reportService';
import styles from './styles/ReportsPage.module.scss';

const today = () =>
  formatDateTime(new Date(), undefined, false, 'yyyy-MM-dd').formattedResult;

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
  const audit = useMutation({
    mutationFn: async (reportName: string) => {
      const result = await logAuditEvent(
        undefined,
        'RUN_REPORT',
        { reportName },
        MODULE_LABELS.REPORTS,
      );
      if (result.error) throw new Error(result.error);
    },
    retry: false,
  });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [format, setFormat] = useState('text/html');
  const [datePreset, setDatePreset] = useState('Today');

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
  const formats = availableReportFormats(settings.data);
  const responseType = formats.some((option) => option.value === format)
    ? format
    : (formats[0]?.value ?? '');
  const presets = reportDateRanges.filter(
    (range) =>
      !settings.data?.config?.supportedDateRange ||
      settings.data.config.supportedDateRange.includes(range),
  );
  const requiresDates = report?.config?.dateRangeRequired !== false;
  const template = useMutation({
    mutationFn: async ({
      file,
      reportKey,
    }: {
      file: File;
      reportKey: string;
    }) => ({ reportKey, location: await uploadReportTemplate(file) }),
  });
  const macroTemplateLocation =
    template.data?.reportKey === reportName
      ? template.data.location
      : report?.config?.macroTemplatePath;
  const concatenatedCSV =
    report?.type === 'concatenated' && responseType === 'text/csv';
  const datesValid =
    report?.config?.dateRangeRequired === false ||
    (Boolean(startDate) && Boolean(endDate) && startDate <= endDate);
  const formatValid =
    Boolean(responseType) &&
    !concatenatedCSV &&
    (responseType !== 'application/vnd.ms-excel-custom' ||
      Boolean(macroTemplateLocation));
  const request = {
    name: report?.name ?? '',
    startDate: requiresDates ? startDate : '',
    endDate: requiresDates ? endDate : '',
    responseType,
    paperSize: settings.data?.config?.paperSize ?? 'A3',
    macroTemplateLocation,
  };
  const schedule = useMutation({
    mutationFn: async (values: typeof request & { userName: string }) => {
      const response = await get<unknown>(reportRequestUrl('schedule', values));
      if (typeof response === 'string' && /<html/i.test(response))
        throw new Error('Report queue requires a fresh sign-in.');
      return response;
    },
    retry: false,
    // Legacy RUN_REPORT records the request, not completion of report generation.
    onMutate: (values) => audit.mutate(values.name),
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
                  onClick={() => {
                    setSelected(id);
                    schedule.reset();
                    template.reset();
                  }}
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
                <p className={styles.help}>
                  {t(
                    requiresDates
                      ? 'REPORTS_DATE_HELP'
                      : 'REPORTS_NO_DATE_HELP',
                  )}
                </p>
                <div className={styles.fields}>
                  {requiresDates && (
                    <>
                      <label className={`${styles.field} ${styles.fullWidth}`}>
                        {t('REPORTS_DATE_RANGE')}
                        <select
                          value={
                            presets.includes(
                              datePreset as (typeof reportDateRanges)[number],
                            )
                              ? datePreset
                              : 'custom'
                          }
                          onChange={(event) => {
                            const range = event.target.value;
                            setDatePreset(range);
                            schedule.reset();
                            if (range !== 'custom') {
                              const dates = reportDateRange(
                                range as (typeof reportDateRanges)[number],
                              );
                              setStartDate(dates.startDate);
                              setEndDate(dates.endDate);
                            }
                          }}
                        >
                          {presets.map((range) => (
                            <option key={range} value={range}>
                              {t(
                                `REPORTS_RANGE_${reportDateRanges.indexOf(range)}`,
                              )}
                            </option>
                          ))}
                          <option value="custom">
                            {t('REPORTS_CUSTOM_DATES')}
                          </option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        {t('REPORTS_FROM')}
                        <input
                          type="date"
                          value={startDate}
                          onChange={(event) => {
                            setStartDate(event.target.value);
                            setDatePreset('custom');
                            schedule.reset();
                          }}
                        />
                      </label>
                      <label className={styles.field}>
                        {t('REPORTS_TO')}
                        <input
                          type="date"
                          value={endDate}
                          onChange={(event) => {
                            setEndDate(event.target.value);
                            setDatePreset('custom');
                            schedule.reset();
                          }}
                        />
                      </label>
                    </>
                  )}
                  <label className={styles.field}>
                    {t('REPORTS_FORMAT')}
                    <select
                      value={responseType}
                      onChange={(event) => {
                        setFormat(event.target.value);
                        schedule.reset();
                      }}
                    >
                      {formats.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {responseType === 'application/vnd.ms-excel-custom' && (
                    <label className={`${styles.field} ${styles.fullWidth}`}>
                      {t('REPORTS_TEMPLATE_UPLOAD')}
                      <input
                        type="file"
                        accept=".xls"
                        disabled={template.isPending}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          template.reset();
                          schedule.reset();
                          if (file)
                            template.mutate({ file, reportKey: reportName });
                          event.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
                {!datesValid && (
                  <p role="alert">{t('REPORTS_INVALID_DATES')}</p>
                )}
                {responseType === 'application/vnd.ms-excel-custom' &&
                  !macroTemplateLocation && (
                    <p role="alert">{t('REPORTS_CUSTOM_EXCEL_UNAVAILABLE')}</p>
                  )}
                {concatenatedCSV && (
                  <p role="alert">{t('REPORTS_CONCATENATED_CSV')}</p>
                )}
                {!responseType && <p role="alert">{t('REPORTS_NO_FORMATS')}</p>}
                {template.isPending && (
                  <p role="status">{t('REPORTS_TEMPLATE_UPLOADING')}</p>
                )}
                {template.isError &&
                  template.variables?.reportKey === reportName && (
                    <p role="alert">{t('REPORTS_TEMPLATE_ERROR')}</p>
                  )}
                {template.data?.reportKey === reportName && (
                  <p role="status">{t('REPORTS_TEMPLATE_READY')}</p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!datesValid || !formatValid || template.isPending}
                    onClick={() => {
                      audit.reset();
                      window.open(
                        reportRequestUrl('report', request),
                        '_blank',
                        'noopener,noreferrer',
                      );
                      audit.mutate(request.name);
                    }}
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
                        template.isPending ||
                        !currentUser.data?.username ||
                        schedule.isPending
                      }
                      onClick={() => {
                        audit.reset();
                        schedule.mutate({
                          ...request,
                          userName: currentUser.data!.username,
                        });
                      }}
                    >
                      {schedule.isPending
                        ? t('REPORTS_QUEUEING')
                        : t('REPORTS_QUEUE')}
                    </button>
                  )}
                </div>
                {schedule.isSuccess &&
                  schedule.variables?.name === request.name && (
                    <p role="status">{t('REPORTS_QUEUED')}</p>
                  )}
                {schedule.isError &&
                  schedule.variables?.name === request.name && (
                    <p role="alert">{t('REPORTS_QUEUE_ERROR')}</p>
                  )}
                {audit.isError && audit.variables === request.name && (
                  <p role="alert">{t('REPORTS_AUDIT_ERROR')}</p>
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
  const [search, setSearch] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<QueuedReport | null>(
    null,
  );
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
    mutationFn: (id: QueuedReport['id']) => {
      if (!currentUser.data?.username)
        throw new Error('Sign in before deleting a report.');
      return deleteQueuedReport(id, currentUser.data.username);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['reports', 'queue'] }),
    onSettled: () => setPendingRemoval(null),
  });
  const timestamp = (value?: string | number) =>
    value === undefined ? 0 : new Date(value).getTime() || 0;
  const dateLabel = (value?: string | number, withTime = false) =>
    value === undefined
      ? '...'
      : formatDateTime(value, t, withTime).formattedResult;
  const rows = [...(queue.data ?? [])]
    .filter((row) => row.name.toLowerCase().includes(search.toLowerCase()))
    .sort(
      (a, b) => timestamp(b.requestDatetime) - timestamp(a.requestDatetime),
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
        <label className={styles.field}>
          {t('REPORTS_QUEUE_SEARCH')}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {currentUser.isError || queue.isError ? (
          <p role="alert">{t('REPORTS_QUEUE_LOAD_ERROR')}</p>
        ) : currentUser.isPending || queue.isPending ? (
          <p role="status">{t('REPORTS_LOADING')}</p>
        ) : !rows.length ? (
          <p>{t('REPORTS_QUEUE_EMPTY')}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>{t('REPORTS_NAME')}</th>
                  <th>{t('REPORTS_REQUESTED')}</th>
                  <th>{t('REPORTS_FROM')}</th>
                  <th>{t('REPORTS_TO')}</th>
                  <th>{t('REPORTS_FORMAT')}</th>
                  <th>{t('REPORTS_STATUS')}</th>
                  <th>{t('REPORTS_ACTIONS')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <React.Fragment key={row.id}>
                    {(index === 0 ||
                      dateLabel(rows[index - 1].requestDatetime) !==
                        dateLabel(row.requestDatetime)) && (
                      <tr className={styles.dateGroup}>
                        <th colSpan={7}>{dateLabel(row.requestDatetime)}</th>
                      </tr>
                    )}
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{dateLabel(row.requestDatetime, true)}</td>
                      <td>{dateLabel(row.startDate)}</td>
                      <td>{dateLabel(row.endDate)}</td>
                      <td>
                        {reportFormats.find(
                          (format) => format.value === row.format,
                        )?.label ??
                          row.format ??
                          '...'}
                      </td>
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
                              target={
                                row.format === 'text/html'
                                  ? '_blank'
                                  : undefined
                              }
                              rel={
                                row.format === 'text/html'
                                  ? 'noopener noreferrer'
                                  : undefined
                              }
                            >
                              {t(
                                row.format === 'text/html'
                                  ? 'REPORTS_VIEW'
                                  : 'REPORTS_DOWNLOAD',
                              )}
                            </a>
                          )}
                          {row.status.toLowerCase() !== 'processing' && (
                            <button
                              type="button"
                              disabled={remove.isPending}
                              onClick={() => {
                                remove.reset();
                                setPendingRemoval(row);
                              }}
                            >
                              {t('REPORTS_DELETE')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {remove.isError && <p role="alert">{t('REPORTS_DELETE_ERROR')}</p>}
        {pendingRemoval && (
          <ConfirmationModal
            open
            heading={t('REPORTS_DELETE_TITLE')}
            body={`${t('REPORTS_DELETE_CONFIRM')} ${pendingRemoval.name}`}
            confirmLabel={t('REPORTS_DELETE')}
            cancelLabel={t('REPORTS_CANCEL')}
            danger
            isSubmitting={remove.isPending}
            onCancel={() => {
              if (!remove.isPending) setPendingRemoval(null);
            }}
            onConfirm={() => {
              if (!remove.isPending) remove.mutate(pendingRemoval.id);
            }}
          />
        )}
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
