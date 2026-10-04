import { get } from '@bahmni/services';

export interface ReportDefinition {
  name: string;
  requiredPrivilege?: string;
  config?: { dateRangeRequired?: boolean; macroTemplatePath?: string };
}

export type ReportCatalog = Record<string, ReportDefinition>;

export interface QueuedReport {
  id: string | number;
  name: string;
  requestDatetime?: string;
  startDate?: string;
  endDate?: string;
  format?: string;
  status: string;
  errorMessage?: string;
}

export const reportFormats = [
  { label: 'HTML', value: 'text/html' },
  { label: 'CSV', value: 'text/csv' },
  { label: 'Excel', value: 'application/vnd.ms-excel' },
  { label: 'PDF', value: 'application/pdf' },
  {
    label: 'OpenDocument',
    value: 'application/vnd.oasis.opendocument.spreadsheet',
  },
  { label: 'Custom Excel', value: 'application/vnd.ms-excel-custom' },
];

export const getReportCatalog = () =>
  get<ReportCatalog>('/bahmni_config/openmrs/apps/reports/reports.json');

export const getReportSettings = () =>
  get<{ config?: { paperSize?: string; enableReportQueue?: boolean } }>(
    '/bahmni_config/openmrs/apps/reports/app.json',
  );

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
  if (values.macroTemplateLocation)
    query.set('macroTemplateLocation', values.macroTemplateLocation);
  return `/bahmnireports/${action}?${query.toString()}`;
};
