import { formatDateTime, get, post } from '@bahmni/services';

export interface ReportDefinition {
  name: string;
  type?: string;
  requiredPrivilege?: string;
  config?: { dateRangeRequired?: boolean; macroTemplatePath?: string };
}

export type ReportCatalog = Record<string, ReportDefinition>;

export interface QueuedReport {
  id: string | number;
  name: string;
  requestDatetime?: string | number;
  startDate?: string | number;
  endDate?: string | number;
  format?: string;
  fileName?: string;
  status: string;
  errorMessage?: string;
}

export const reportFormats = [
  { key: 'HTML', label: 'HTML', value: 'text/html' },
  { key: 'CSV', label: 'CSV', value: 'text/csv' },
  { key: 'EXCEL', label: 'Excel', value: 'application/vnd.ms-excel' },
  { key: 'PDF', label: 'PDF', value: 'application/pdf' },
  {
    key: 'ODS',
    label: 'OpenDocument',
    value: 'application/vnd.oasis.opendocument.spreadsheet',
  },
  {
    key: 'CUSTOM EXCEL',
    label: 'Custom Excel',
    value: 'application/vnd.ms-excel-custom',
  },
];

export interface ReportSettings {
  config?: {
    paperSize?: string;
    enableReportQueue?: boolean;
    supportedFormats?: string[];
    supportedDateRange?: string[];
  };
}

export const availableReportFormats = (settings?: ReportSettings) => {
  const allowed = settings?.config?.supportedFormats?.map((format) =>
    format.toUpperCase(),
  );
  return reportFormats.filter(
    (format) => !allowed || allowed.includes(format.key),
  );
};

export const reportDateRanges = [
  'Today',
  'This Month',
  'Previous Month',
  'This Quarter',
  'This Year',
  'Last 7 days',
  'Last 30 days',
] as const;

export function reportDateRange(
  range: (typeof reportDateRanges)[number],
  now = new Date(),
) {
  const start = new Date(now);
  const end = new Date(now);
  if (range === 'This Month' || range === 'Previous Month') start.setDate(1);
  if (range === 'Previous Month') {
    start.setMonth(start.getMonth() - 1);
    end.setDate(0);
  }
  if (range === 'This Quarter') {
    start.setDate(1);
    start.setMonth(Math.floor(start.getMonth() / 3) * 3);
  }
  if (range === 'This Year') {
    start.setDate(1);
    start.setMonth(0);
  }
  if (range === 'Last 7 days') start.setDate(start.getDate() - 7);
  if (range === 'Last 30 days') start.setDate(start.getDate() - 30);
  return {
    startDate: formatDateTime(start, undefined, false, 'yyyy-MM-dd')
      .formattedResult,
    endDate: formatDateTime(end, undefined, false, 'yyyy-MM-dd')
      .formattedResult,
  };
}

export async function uploadReportTemplate(file: File) {
  // eslint-disable-next-line no-control-regex -- Reject control characters in filenames at the upload boundary.
  if (!/\.xls$/i.test(file.name) || /[\\/\x00-\x1f\x7f]/.test(file.name))
    throw new Error('Choose an XLS workbook template.');
  const body = new FormData();
  body.append('file', file);
  const location = await post<unknown, FormData>(
    '/bahmnireports/upload',
    body,
    {
      // Override the shared JSON default; the browser supplies the multipart boundary.
      headers: { 'Content-Type': undefined },
    },
  );
  if (
    typeof location !== 'string' ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in server-issued filenames too.
    !/^[^<>\\/\x00-\x1f\x7f]+\.xls$/i.test(location) ||
    location.includes('..')
  )
    throw new Error('The template upload was not acknowledged.');
  return location;
}

export async function deleteQueuedReport(
  id: QueuedReport['id'],
  username: string,
) {
  const current = (await getQueuedReports(username)).find(
    (row) => String(row.id) === String(id),
  );
  if (!current || current.status.toLowerCase() === 'processing')
    throw new Error('This report is no longer available for deletion.');
  const response = await get<unknown>(
    `/bahmnireports/delete/${encodeURIComponent(id)}`,
  );
  if (typeof response === 'string' && /<html/i.test(response))
    throw new Error('Report deletion requires a fresh sign-in.');
  return response;
}

export const getReportCatalog = () =>
  get<ReportCatalog>('/bahmni_config/openmrs/apps/reports/reports.json');

export const getReportSettings = () =>
  get<ReportSettings>('/bahmni_config/openmrs/apps/reports/app.json');

export const getQueuedReports = async (username: string) => {
  const response = await get<QueuedReport[] | string>(
    `/bahmnireports/getReports?user=${encodeURIComponent(username)}`,
  );
  if (!Array.isArray(response)) throw new Error('Report queue is unavailable.');
  return response;
};

export const reportRequestUrl = (
  action: 'report' | 'schedule',
  values: {
    name: string;
    startDate: string;
    endDate: string;
    responseType: string;
    paperSize: string;
    userName?: string;
    macroTemplateLocation?: string;
  },
) => {
  const query = new URLSearchParams({
    name: values.name,
    startDate: values.startDate,
    endDate: values.endDate,
    responseType: values.responseType,
    paperSize: values.paperSize,
    appName: 'reports',
  });
  if (values.userName) query.set('userName', values.userName);
  if (
    values.responseType === 'application/vnd.ms-excel-custom' &&
    values.macroTemplateLocation
  )
    query.set('macroTemplateLocation', values.macroTemplateLocation);
  return `/bahmnireports/${action}?${query.toString()}`;
};
