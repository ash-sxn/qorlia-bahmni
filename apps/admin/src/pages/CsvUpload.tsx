import { get, post, useTranslation } from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { ChangeEvent, useRef, useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import styles from './styles/CsvUpload.module.scss';

const base = '/openmrs/ws/rest/v1/bahmnicore/admin/upload';
const importTypes = [
  'concept',
  'conceptset',
  'program',
  'patient',
  'encounter',
  'form2encounter',
  'drug',
  'labResults',
  'referenceterms',
  'updateReferenceTerms',
  'relationship',
] as const;

type ImportType = (typeof importTypes)[number];
interface ImportOption {
  name: string;
  url: string;
}
interface ImportConfig {
  options: Record<string, ImportOption>;
  patientMatchingAlgorithm: string;
}
type UploadState = 'ready' | 'uploading' | 'success' | 'error' | 'canceled';

interface UploadItem {
  id: string;
  file: File;
  type: string;
  option: ImportOption;
  patientMatchingAlgorithm: string;
  state: UploadState;
  progress: number;
  error?: string;
}

interface ImportStatus {
  id: string;
  originalFileName: string;
  startTime?: string | number;
  status?: string;
  errorMessage?: string;
  failedRecords?: number;
  errorFileName?: string;
}

const uploadPath = (type: ImportType) =>
  `${base}/${type === 'updateReferenceTerms' ? 'referenceterms/new' : type}`;

// Use the native admin extension: the v2 tile catalogue does not carry these settings.
const loadImportConfig = async (): Promise<ImportConfig> => {
  const extensions = await get<
    Record<
      string,
      {
        id: string;
        extensionParams?: { patientMatchingAlgorithm?: string };
        urlMap?: Record<string, ImportOption>;
      }
    >
  >('/bahmni_config/openmrs/apps/admin/extension.json');
  const extension = Object.values(extensions).find(
    ({ id }) => id === 'bahmni.admin.csv',
  );
  if (!extension) throw new Error('Missing CSV import configuration');
  const algorithm = extension.extensionParams?.patientMatchingAlgorithm ?? '';
  if (typeof algorithm !== 'string')
    throw new Error('Invalid patient matching configuration');
  const configured = extension.urlMap;
  const options =
    configured && Object.keys(configured).length
      ? configured
      : Object.fromEntries(
          importTypes.map((type) => [
            type,
            { name: '', url: uploadPath(type) },
          ]),
        );
  for (const option of Object.values(options)) {
    if (
      !option ||
      typeof option.name !== 'string' ||
      typeof option.url !== 'string'
    ) {
      throw new Error('Invalid CSV import configuration');
    }
    const url = new URL(option.url, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error('CSV imports must use the configured local backend');
    }
  }
  return { options, patientMatchingAlgorithm: algorithm };
};

const errorFilePath = (name?: string) => {
  if (!name || name.startsWith('/') || name.includes('\\')) return undefined;
  const segments = name.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  )
    return undefined;
  return `/uploaded-files/mrs/${segments.map(encodeURIComponent).join('/')}`;
};

export const CsvUpload = () => {
  const { t } = useTranslation();
  const [type, setType] = useState('encounter');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [fileError, setFileError] = useState('');
  const controllers = useRef(new Map<string, AbortController>());

  const config = useQuery({
    queryKey: ['admin', 'csv-import-config'],
    queryFn: loadImportConfig,
    refetchOnMount: 'always',
  });
  const options = config.data?.options ?? {};
  const selectedType = Object.prototype.hasOwnProperty.call(options, type)
    ? type
    : Object.keys(options)[0];
  const ready = !!config.data && !config.isFetching && !config.isError;
  const label = (type: string, option: ImportOption) =>
    option.name || t(`ADMIN_CSV_TYPE_${type}`);

  const imports = useQuery({
    queryKey: ['admin', 'csv-import-status'],
    queryFn: () => get<ImportStatus[]>(`${base}/status`),
    refetchOnMount: 'always',
  });

  const update = (id: string, change: Partial<UploadItem>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );

  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    if (!ready || !selectedType) return;
    const files = Array.from(event.target.files ?? []);
    const invalid = files.some(
      (file) => !file.name.toLowerCase().endsWith('.csv') || !file.size,
    );
    setFileError(invalid ? t('ADMIN_CSV_UPLOAD_INVALID') : '');
    setItems((current) => [
      ...current,
      ...files
        .filter((file) => file.name.toLowerCase().endsWith('.csv') && file.size)
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          type: selectedType,
          option: options[selectedType],
          patientMatchingAlgorithm: config.data!.patientMatchingAlgorithm,
          state: 'ready' as const,
          progress: 0,
        })),
    ]);
    event.target.value = '';
  };

  const upload = async (item: UploadItem) => {
    if (!ready || controllers.current.has(item.id)) return;
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    update(item.id, { state: 'uploading', progress: 0, error: undefined });
    const body = new FormData();
    body.append('file', item.file);
    body.append('patientMatchingAlgorithm', item.patientMatchingAlgorithm);
    try {
      const accepted = await post<boolean, FormData>(item.option.url, body, {
        headers: { 'Content-Type': undefined },
        signal: controller.signal,
        onUploadProgress: (event) =>
          update(item.id, {
            progress: event.total
              ? Math.round((100 * event.loaded) / event.total)
              : 0,
          }),
      });
      if (accepted !== true) throw new Error(t('ADMIN_CSV_UPLOAD_REJECTED'));
      update(item.id, { state: 'success', progress: 100 });
      await imports.refetch();
    } catch (error) {
      update(
        item.id,
        controller.signal.aborted
          ? { state: 'canceled' }
          : {
              state: 'error',
              error:
                error instanceof Error
                  ? error.message
                  : t('ADMIN_CSV_UPLOAD_FAILED'),
            },
      );
    } finally {
      controllers.current.delete(item.id);
    }
  };

  return (
    <AdminLayout>
      <section className={styles.page} aria-label={t('ADMIN_CSV_UPLOAD_TITLE')}>
        <p className={styles.eyebrow}>{t('BREADCRUMB_ADMIN')}</p>
        <h1>{t('ADMIN_CSV_UPLOAD_TITLE')}</h1>
        <p className={styles.description}>
          {t('ADMIN_CSV_UPLOAD_DESCRIPTION')}
        </p>
        <p className={styles.warning}>{t('ADMIN_CSV_UPLOAD_PROVIDER_NOTE')}</p>

        <div className={styles.card}>
          <h2>{t('ADMIN_CSV_UPLOAD_SELECT')}</h2>
          {config.isFetching && (
            <p role="status">{t('ADMIN_LOADING_MODULES')}</p>
          )}
          {config.isError && (
            <div role="alert">
              <p>{t('ADMIN_ERROR_FETCH_CONFIG')}</p>
              <button
                type="button"
                onClick={() => config.refetch()}
                disabled={config.isFetching}
              >
                {t('ADMIN_ORDER_TRY_AGAIN')}
              </button>
            </div>
          )}
          <div className={styles.selector}>
            <label>
              {t('ADMIN_CSV_UPLOAD_TYPE')}
              <select
                disabled={!ready}
                value={selectedType ?? ''}
                onChange={(event) => setType(event.target.value)}
              >
                {Object.entries(options).map(([value, option]) => (
                  <option key={value} value={value}>
                    {label(value, option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ADMIN_CSV_UPLOAD_FILES')}
              <input
                disabled={!ready}
                type="file"
                accept=".csv,text/csv"
                multiple
                onChange={chooseFiles}
              />
            </label>
          </div>
          {fileError && <p role="alert">{fileError}</p>}
        </div>

        {items.length > 0 && (
          <div className={styles.card}>
            <h2>{t('ADMIN_CSV_UPLOAD_QUEUE')}</h2>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_NAME')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_TYPE')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_SIZE')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_PROGRESS')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_STATUS')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_ACTIONS')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.file.name}</td>
                      <td>{label(item.type, item.option)}</td>
                      <td>{(item.file.size / 1024).toFixed(2)} KB</td>
                      <td>
                        <progress
                          value={item.progress}
                          max="100"
                          aria-label={`${item.file.name} ${t('ADMIN_CSV_UPLOAD_PROGRESS')}`}
                        />
                      </td>
                      <td>
                        {t(`ADMIN_CSV_UPLOAD_${item.state.toUpperCase()}`)}
                        {item.error && <p role="alert">{item.error}</p>}
                      </td>
                      <td className={styles.actions}>
                        {(item.state === 'ready' ||
                          item.state === 'error' ||
                          item.state === 'canceled') && (
                          <button
                            type="button"
                            disabled={!ready}
                            onClick={() => upload(item)}
                          >
                            {t('ADMIN_CSV_UPLOAD_SEND')}
                          </button>
                        )}
                        {item.state === 'uploading' && (
                          <button
                            type="button"
                            onClick={() =>
                              controllers.current.get(item.id)?.abort()
                            }
                          >
                            {t('ADMIN_CSV_UPLOAD_CANCEL')}
                          </button>
                        )}
                        {item.state !== 'uploading' && (
                          <button
                            type="button"
                            onClick={() =>
                              setItems((current) =>
                                current.filter((entry) => entry.id !== item.id),
                              )
                            }
                          >
                            {t('ADMIN_CSV_UPLOAD_REMOVE')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.heading}>
            <h2>{t('ADMIN_CSV_UPLOAD_HISTORY')}</h2>
            <button
              type="button"
              onClick={() => imports.refetch()}
              disabled={imports.isFetching}
            >
              {t('ADMIN_CSV_UPLOAD_REFRESH')}
            </button>
          </div>
          {imports.isLoading && (
            <p role="status">{t('ADMIN_CSV_UPLOAD_LOADING')}</p>
          )}
          {imports.isError && (
            <p role="alert">{t('ADMIN_CSV_UPLOAD_HISTORY_ERROR')}</p>
          )}
          {imports.data?.length === 0 && <p>{t('ADMIN_CSV_UPLOAD_EMPTY')}</p>}
          {!!imports.data?.length && (
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_NAME')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_DATE')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_STATUS')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_ERROR')}</th>
                    <th scope="col">{t('ADMIN_CSV_UPLOAD_DOWNLOAD')}</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.data.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.originalFileName}</td>
                      <td>
                        {entry.startTime
                          ? new Date(entry.startTime).toLocaleString()
                          : ''}
                      </td>
                      <td>{entry.status}</td>
                      <td>{entry.errorMessage}</td>
                      <td>
                        {entry.failedRecords &&
                        errorFilePath(entry.errorFileName) ? (
                          <a href={errorFilePath(entry.errorFileName)}>
                            {t('ADMIN_CSV_UPLOAD_ERROR_FILE')}
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
};
