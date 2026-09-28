import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  fetchAllProviders,
  get,
  getLocationByTag,
  hasPrivilege,
  post,
  searchPatientByNameOrId,
  type Provider,
} from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import styles from './BedManagement.module.scss';

interface AttributeType {
  uuid: string;
  name: string;
  format: string;
}

interface SurgeryAttribute {
  id?: number;
  uuid?: string;
  value: string | number | null;
  surgicalAppointmentAttributeType: AttributeType;
}

interface Surgery {
  id?: number;
  uuid?: string;
  voided?: boolean;
  patient: { uuid: string; display?: string };
  status: string;
  sortWeight: number;
  notes?: string;
  actualStartDatetime?: string;
  actualEndDatetime?: string;
  surgicalAppointmentAttributes: SurgeryAttribute[];
}

interface Block {
  id?: number;
  uuid?: string;
  voided?: boolean;
  startDatetime: string;
  endDatetime: string;
  provider: { uuid: string };
  location: { uuid: string };
  surgicalAppointments: Surgery[];
}

interface OtConfig {
  config?: {
    surgeryAttributes?: string[];
    requiredSurgeryAttributes?: string[];
    primarySurgeonsForOT?: string[];
  };
}

interface SurgeryRow {
  uuid?: string;
  patientUuid: string;
  patientLabel: string;
  notes: string;
  values: Record<string, string>;
  original?: Surgery;
}

const blockUrl = '/openmrs/ws/rest/v1/surgicalBlock';
const toLocal = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const rowFromSurgery = (surgery: Surgery): SurgeryRow => ({
  uuid: surgery.uuid,
  patientUuid: surgery.patient.uuid,
  patientLabel: surgery.patient.display ?? surgery.patient.uuid,
  notes: surgery.notes ?? '',
  values: Object.fromEntries(
    (surgery.surgicalAppointmentAttributes ?? []).map((attribute) => [
      attribute.surgicalAppointmentAttributeType.name,
      String(attribute.value ?? ''),
    ]),
  ),
  original: surgery,
});

const newRow = (): SurgeryRow => ({
  patientUuid: '',
  patientLabel: '',
  notes: '',
  values: { estTimeHours: '0', estTimeMinutes: '0', cleaningTime: '15' },
});

const minutesFor = (row: SurgeryRow) =>
  Number(row.values.estTimeHours ?? 0) * 60 +
  Number(row.values.estTimeMinutes ?? 0) +
  Number(row.values.cleaningTime ?? 0);

export const validateSurgicalBlock = (
  start: string,
  end: string,
  providerUuid: string,
  locationUuid: string,
  rows: SurgeryRow[],
  required: string[],
) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (
    !start ||
    !end ||
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    endDate <= startDate
  )
    return 'Enter a valid block start and a later end time.';
  if (!providerUuid || !locationUuid)
    return 'Choose a surgeon and an operation theatre.';
  if (rows.some((row) => !row.patientUuid))
    return 'Choose a patient for every surgery.';
  if (rows.some((row) => required.some((name) => !row.values[name]?.trim())))
    return 'Complete the required surgery details.';
  if (
    rows.some((row) =>
      ['estTimeHours', 'estTimeMinutes', 'cleaningTime'].some(
        (name) =>
          !/^\d+$/.test(row.values[name] ?? '0') ||
          Number(row.values[name] ?? 0) > (name === 'estTimeHours' ? 23 : 59),
      ),
    )
  )
    return 'Enter valid surgery and cleaning durations.';
  if (
    rows.reduce((total, row) => total + minutesFor(row), 0) >
    (endDate.getTime() - startDate.getTime()) / 60000
  )
    return 'The surgeries and cleaning time exceed the block duration.';
  return '';
};

export const saveSurgicalBlock = async (
  loaded: Block | undefined,
  start: string,
  end: string,
  providerUuid: string,
  locationUuid: string,
  rows: SurgeryRow[],
  attributeTypes: AttributeType[],
) => {
  if (loaded?.uuid) {
    const latest = await get<Block>(
      `${blockUrl}/${encodeURIComponent(loaded.uuid)}`,
      { params: { v: 'full' } },
    );
    if (JSON.stringify(latest) !== JSON.stringify(loaded) || latest.voided)
      throw new Error('This block changed. Refresh it before editing.');
  }
  const active = rows.map(
    (row, index): Surgery => ({
      ...(row.original ?? {}),
      patient: { uuid: row.patientUuid },
      status: row.original?.status ?? 'SCHEDULED',
      sortWeight: index,
      notes: row.notes,
      surgicalAppointmentAttributes: attributeTypes.map((type) => {
        const previous = row.original?.surgicalAppointmentAttributes?.find(
          (attribute) =>
            attribute.surgicalAppointmentAttributeType.uuid === type.uuid,
        );
        return {
          ...previous,
          value: row.values[type.name] ?? '',
          surgicalAppointmentAttributeType: {
            uuid: type.uuid,
            name: type.name,
            format: type.format,
          },
        };
      }),
    }),
  );
  const excluded = (loaded?.surgicalAppointments ?? []).filter(
    (surgery) =>
      (surgery.voided ?? false) ||
      ['CANCELLED', 'POSTPONED'].includes(surgery.status),
  );
  const payload: Block = {
    ...(loaded?.id ? { id: loaded.id } : {}),
    ...(loaded?.uuid ? { uuid: loaded.uuid } : {}),
    startDatetime: new Date(start).toISOString(),
    endDatetime: new Date(end).toISOString(),
    provider: { uuid: providerUuid },
    location: { uuid: locationUuid },
    surgicalAppointments: [...active, ...excluded],
  };
  return post<Block>(
    loaded?.uuid ? `${blockUrl}/${encodeURIComponent(loaded.uuid)}` : blockUrl,
    payload,
    { params: { v: 'full' } },
  );
};

const SurgicalBlockEditor = () => {
  const { blockUuid } = useParams();
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canEdit = hasPrivilege(userPrivileges, 'app:ot:write');
  const queryClient = useQueryClient();
  const block = useQuery({
    queryKey: ['ot-block', blockUuid],
    queryFn: () =>
      get<Block>(`${blockUrl}/${encodeURIComponent(blockUuid!)}`, {
        params: { v: 'full' },
      }),
    enabled: !!blockUuid && canEdit,
  });
  const providers = useQuery({
    queryKey: ['ot-providers'],
    queryFn: fetchAllProviders,
    enabled: canEdit,
  });
  const theatres = useQuery({
    queryKey: ['ot-theatres'],
    queryFn: () => getLocationByTag('Operation Theater'),
    enabled: canEdit,
  });
  const attributes = useQuery({
    queryKey: ['ot-attribute-types'],
    queryFn: () =>
      get<{ results: AttributeType[] }>(
        '/openmrs/ws/rest/v1/surgicalAppointmentAttributeType',
        { params: { v: 'custom:(uuid,name,format)' } },
      ),
    enabled: canEdit,
  });
  const config = useQuery({
    queryKey: ['ot-config'],
    queryFn: () => get<OtConfig>('/bahmni_config/openmrs/apps/ot/app.json'),
    enabled: canEdit,
  });
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [providerUuid, setProviderUuid] = useState('');
  const [locationUuid, setLocationUuid] = useState('');
  const [rows, setRows] = useState<SurgeryRow[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [searchRow, setSearchRow] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const patients = useQuery({
    queryKey: ['ot-patient-search', patientSearch],
    queryFn: () => searchPatientByNameOrId(patientSearch),
    enabled: searchRow !== null && patientSearch.trim().length >= 2,
  });

  useEffect(() => {
    if (!block.data) return;
    setStart(toLocal(block.data.startDatetime));
    setEnd(toLocal(block.data.endDatetime));
    setProviderUuid(block.data.provider?.uuid ?? '');
    setLocationUuid(block.data.location?.uuid ?? '');
    setRows(
      (block.data.surgicalAppointments ?? [])
        .filter(
          (surgery) =>
            !surgery.voided &&
            !['CANCELLED', 'POSTPONED'].includes(surgery.status),
        )
        .sort((a, b) => a.sortWeight - b.sortWeight)
        .map(rowFromSurgery),
    );
  }, [block.data]);

  const configured = config.data?.config;
  const types = (attributes.data?.results ?? []).filter((type) =>
    (configured?.surgeryAttributes ?? []).includes(type.name),
  );
  const eligibleProviders = (providers.data ?? []).filter(
    (provider) =>
      provider.person?.display &&
      (!configured?.primarySurgeonsForOT?.length ||
        configured.primarySurgeonsForOT.includes(provider.person.display)),
  );
  const updateRow = (index: number, change: Partial<SurgeryRow>) =>
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...change } : row,
      ),
    );
  const updateValue = (index: number, name: string, value: string) =>
    setRows((current) =>
      current.map((row, position) =>
        position === index
          ? { ...row, values: { ...row.values, [name]: value } }
          : row,
      ),
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !canEdit ||
      saving ||
      !config.data ||
      !attributes.data ||
      !providers.data ||
      !theatres.data
    )
      return;
    setError('');
    setMessage('');
    const validation = validateSurgicalBlock(
      start,
      end,
      providerUuid,
      locationUuid,
      rows,
      configured?.requiredSurgeryAttributes ?? [],
    );
    if (validation) {
      setError(validation);
      return;
    }
    if (
      start.slice(0, 10) !== end.slice(0, 10) &&
      !window.confirm('This block spans multiple dates. Save it?')
    )
      return;
    setSaving(true);
    try {
      const result = await saveSurgicalBlock(
        block.data,
        start,
        end,
        providerUuid,
        locationUuid,
        rows,
        attributes.data.results,
      );
      setMessage('Surgical block saved.');
      void queryClient.invalidateQueries({ queryKey: ['ot-surgical-blocks'] });
      if (result.uuid)
        window.location.assign(
          `/bahmni-v2/clinical/operation-theatre/${encodeURIComponent(result.uuid)}`,
        );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save the surgical block.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: 'Home', href: BAHMNI_HOME_PATH },
            {
              id: 'ot',
              label: 'Operation theatre',
              href: '/bahmni-v2/clinical/operation-theatre',
            },
            {
              id: 'block',
              label: blockUuid ? 'Edit block' : 'New block',
              isCurrentPage: true,
            },
          ]}
        />
      }
      main={
        <div className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Operation theatre</span>
            <h1>{blockUuid ? 'Edit surgical block' : 'New surgical block'}</h1>
            <p>Plan theatre time and surgeries using live Bahmni records.</p>
          </div>
          {privilegesLoading ? (
            <p role="status">Checking access...</p>
          ) : !canEdit ? (
            <p role="alert">
              You do not have access to edit the operation theatre schedule.
            </p>
          ) : block.isError ||
            providers.isError ||
            theatres.isError ||
            attributes.isError ||
            config.isError ? (
            <p role="alert">
              Could not load the booking form. Refresh and try again.
            </p>
          ) : (blockUuid && !block.data) ||
            !providers.data ||
            !theatres.data ||
            !attributes.data ||
            !config.data ? (
            <p role="status">Loading booking form...</p>
          ) : (
            <form
              className={styles.card}
              onSubmit={submit}
              aria-label="Surgical block"
            >
              <div className={styles.filterForm}>
                <label>
                  Primary surgeon
                  <select
                    required
                    value={providerUuid}
                    onChange={(event) => setProviderUuid(event.target.value)}
                  >
                    <option value="">Select surgeon</option>
                    {eligibleProviders.map((provider: Provider) => (
                      <option key={provider.uuid} value={provider.uuid}>
                        {provider.person.display}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Operation theatre
                  <select
                    required
                    value={locationUuid}
                    onChange={(event) => setLocationUuid(event.target.value)}
                  >
                    <option value="">Select theatre</option>
                    {theatres.data.map((theatre) => (
                      <option key={theatre.uuid} value={theatre.uuid}>
                        {theatre.display}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Block start
                  <input
                    type="datetime-local"
                    required
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label>
                  Block end
                  <input
                    type="datetime-local"
                    required
                    min={start}
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </label>
              </div>
              <h2>Surgeries</h2>
              {rows.map((row, index) => (
                <section
                  key={row.uuid ?? `new-${index}`}
                  className={styles.card}
                  aria-label={`Surgery ${index + 1}`}
                >
                  <h3>Surgery {index + 1}</h3>
                  <p>Patient: {row.patientLabel || 'Not selected'}</p>
                  <div className={styles.searchForm}>
                    <label htmlFor={`ot-patient-${index}`}>Find patient</label>
                    <input
                      id={`ot-patient-${index}`}
                      type="search"
                      value={searchRow === index ? patientSearch : ''}
                      onFocus={() => {
                        setSearchRow(index);
                        setPatientSearch('');
                      }}
                      onChange={(event) => {
                        setSearchRow(index);
                        setPatientSearch(event.target.value);
                      }}
                      placeholder="Name or patient ID"
                    />
                  </div>
                  {searchRow === index && patients.data && (
                    <div
                      className={styles.tableScroll}
                      role="group"
                      aria-label="Patient results"
                    >
                      {patients.data.pageOfResults.map((patient) => (
                        <button
                          className={styles.inlineButton}
                          type="button"
                          key={patient.uuid}
                          onClick={() => {
                            updateRow(index, {
                              patientUuid: patient.uuid,
                              patientLabel: `${patient.identifier} - ${patient.givenName} ${patient.familyName}`,
                            });
                            setSearchRow(null);
                            setPatientSearch('');
                          }}
                        >
                          {patient.identifier} - {patient.givenName}{' '}
                          {patient.familyName}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={styles.filterForm}>
                    {types.map((type) => (
                      <label key={type.uuid}>
                        {type.name}
                        {type.name === 'otherSurgeon' ? (
                          <select
                            value={row.values[type.name] ?? ''}
                            onChange={(event) =>
                              updateValue(index, type.name, event.target.value)
                            }
                          >
                            <option value="">None</option>
                            {(providers.data ?? [])
                              .filter(
                                (provider) =>
                                  provider.id && provider.person?.display,
                              )
                              .map((provider) => (
                                <option key={provider.uuid} value={provider.id}>
                                  {provider.person.display}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            type={
                              [
                                'estTimeHours',
                                'estTimeMinutes',
                                'cleaningTime',
                              ].includes(type.name)
                                ? 'number'
                                : 'text'
                            }
                            min={0}
                            max={type.name === 'estTimeHours' ? 23 : 59}
                            required={configured?.requiredSurgeryAttributes?.includes(
                              type.name,
                            )}
                            value={row.values[type.name] ?? ''}
                            onChange={(event) =>
                              updateValue(index, type.name, event.target.value)
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <label>
                    Notes
                    <input
                      value={row.notes}
                      onChange={(event) =>
                        updateRow(index, { notes: event.target.value })
                      }
                    />
                  </label>
                  {!row.original && (
                    <button
                      type="button"
                      className={styles.inlineButton}
                      onClick={() =>
                        setRows((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      Remove surgery
                    </button>
                  )}
                </section>
              ))}
              <div className={styles.searchForm}>
                <button
                  type="button"
                  onClick={() => setRows((current) => [...current, newRow()])}
                >
                  Add surgery
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save block'}
                </button>
                <a href="/bahmni-v2/clinical/operation-theatre">
                  Back to schedule
                </a>
              </div>
              {error && <p role="alert">{error}</p>}
              {message && <p role="status">{message}</p>}
            </form>
          )}
        </div>
      }
    />
  );
};

export default SurgicalBlockEditor;
