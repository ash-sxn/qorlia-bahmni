import { get, post } from '@bahmni/services';
import {
  availableReportFormats,
  deleteQueuedReport,
  reportDateRange,
  reportRequestUrl,
  uploadReportTemplate,
} from '../reportService';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  post: jest.fn(),
}));

const mockGet = get as jest.Mock;
const mockPost = post as jest.Mock;
beforeEach(() => jest.resetAllMocks());

it('uses configured case-insensitive format keys without inventing formats', () => {
  expect(
    availableReportFormats({
      config: { supportedFormats: ['pdf', 'CUSTOM EXCEL', 'unknown'] },
    }).map((format) => format.key),
  ).toEqual(['PDF', 'CUSTOM EXCEL']);
  expect(availableReportFormats({ config: { supportedFormats: [] } })).toEqual(
    [],
  );
  expect(availableReportFormats()).toHaveLength(6);
});

it.each([
  ['Today', '2024-03-31', '2024-03-31'],
  ['This Month', '2024-03-01', '2024-03-31'],
  ['Previous Month', '2024-02-01', '2024-02-29'],
  ['This Quarter', '2024-01-01', '2024-03-31'],
  ['This Year', '2024-01-01', '2024-03-31'],
  ['Last 7 days', '2024-03-24', '2024-03-31'],
  ['Last 30 days', '2024-03-01', '2024-03-31'],
] as const)(
  'computes local %s dates using the legacy range boundaries',
  (range, startDate, endDate) => {
    expect(reportDateRange(range, new Date(2024, 2, 31, 23, 30))).toEqual({
      startDate,
      endDate,
    });
  },
);

it('rolls previous month across a year boundary', () => {
  expect(reportDateRange('Previous Month', new Date(2026, 0, 1))).toEqual({
    startDate: '2025-12-01',
    endDate: '2025-12-31',
  });
});

it('sends the macro template only with custom Excel and encodes report names', () => {
  const values = {
    name: 'OPD/IPD & visits',
    startDate: '',
    endDate: '',
    responseType: 'text/csv',
    paperSize: 'A3',
    macroTemplateLocation: 'template.xls',
  };
  const regular = new URL(
    reportRequestUrl('report', values),
    'http://localhost',
  );
  expect(regular.searchParams.get('name')).toBe(values.name);
  expect(regular.searchParams.has('macroTemplateLocation')).toBe(false);
  const custom = new URL(
    reportRequestUrl('schedule', {
      ...values,
      responseType: 'application/vnd.ms-excel-custom',
      userName: 'user+one',
    }),
    'http://localhost',
  );
  expect(custom.searchParams.get('macroTemplateLocation')).toBe('template.xls');
  expect(custom.searchParams.get('userName')).toBe('user+one');
});

it('uploads a workbook as multipart file and accepts only an acknowledged filename', async () => {
  const file = new File(['synthetic'], 'QA template.xls');
  mockPost.mockResolvedValue('uuid-QA template.xls');
  await expect(uploadReportTemplate(file)).resolves.toBe(
    'uuid-QA template.xls',
  );
  const [url, body, options] = mockPost.mock.calls[0];
  expect(url).toBe('/bahmnireports/upload');
  expect(body.get('file')).toBe(file);
  expect(options.headers).toEqual({ 'Content-Type': undefined });
});

it.each(['template.xlsx', '../template.xls', 'bad\n.xls'])(
  'rejects invalid workbook filename %s before uploading',
  async (name) => {
    await expect(
      uploadReportTemplate(new File(['QA'], name)),
    ).rejects.toThrow();
    expect(mockPost).not.toHaveBeenCalled();
  },
);

it.each(['<html>login</html>', '../template.xls', '/tmp/template.xls', null])(
  'rejects an invalid upload acknowledgement',
  async (response) => {
    mockPost.mockResolvedValue(response);
    await expect(
      uploadReportTemplate(new File(['QA'], 'QA.xls')),
    ).rejects.toThrow('not acknowledged');
  },
);

it.each([{ queue: [] }, { queue: [{ id: 'qa', status: 'Processing' }] }])(
  'rechecks the queue and prevents stale or processing deletion',
  async ({ queue }) => {
    mockGet.mockResolvedValue(queue);
    await expect(deleteQueuedReport('qa', 'user+one')).rejects.toThrow(
      'no longer available',
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      '/bahmnireports/getReports?user=user%2Bone',
    );
  },
);

it('deletes the selected current queue entry and rejects a login-page acknowledgement', async () => {
  mockGet
    .mockResolvedValueOnce([{ id: 'qa/id', status: 'Completed' }])
    .mockResolvedValueOnce('<html>login</html>');
  await expect(deleteQueuedReport('qa/id', 'qa')).rejects.toThrow(
    'fresh sign-in',
  );
  expect(mockGet).toHaveBeenLastCalledWith('/bahmnireports/delete/qa%2Fid');
});
