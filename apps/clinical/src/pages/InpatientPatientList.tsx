import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  get,
  getUserLoginLocation,
  hasPrivilege,
  searchPatientByNameOrId,
} from '@bahmni/services';
import { useActivePractitioner, useUserPrivilege } from '@bahmni/widgets';
import { useQueries, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './BedManagement.module.scss';

interface PatientRow {
  uuid: string;
  name: string;
  identifier: string;
  activeVisitUuid?: string;
  hasBeenAdmitted?: boolean | string;
}

interface SearchTab {
  id: string;
  label: string;
  extensionPointId: string;
  requiredPrivilege?: string;
  extensionParams: { searchHandler?: string };
}

export const fetchIpdPatients = (
  handler: string,
  locationUuid: string,
  providerUuid: string,
) =>
  get<PatientRow[]>('/openmrs/ws/rest/v1/bahmnicore/sql', {
    params: {
      location_uuid: locationUuid,
      provider_uuid: providerUuid,
      q: handler,
      v: 'full',
    },
  });

const InpatientPatientList = () => {
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const { practitioner, loading: practitionerLoading } =
    useActivePractitioner();
  const [tabId, setTabId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const canView = hasPrivilege(userPrivileges, 'app:adt');
  let locationUuid = '';
  try {
    locationUuid = getUserLoginLocation().uuid;
  } catch {
    // The location provider may still be initializing.
  }

  const config = useQuery({
    queryKey: ['ipd-search-config'],
    queryFn: () =>
      get<Record<string, SearchTab>>(
        '/bahmni_config/openmrs/apps/ipd/extension.json',
      ),
    enabled: !privilegesLoading && canView,
  });
  const tabs = Object.values(config.data ?? {}).filter(
    ({ extensionPointId, requiredPrivilege }) =>
      extensionPointId === 'org.bahmni.patient.search' &&
      (!requiredPrivilege || hasPrivilege(userPrivileges, requiredPrivilege)),
  );
  const activeTab = tabs.find(({ id }) => id === tabId) ?? tabs[0];
  const handlers = tabs.filter(({ extensionParams }) =>
    Boolean(extensionParams.searchHandler),
  );
  const listQueries = useQueries({
    queries: handlers.map(({ id, extensionParams }) => ({
      queryKey: ['ipd-patient-list', id, locationUuid, practitioner?.uuid],
      queryFn: () =>
        fetchIpdPatients(
          extensionParams.searchHandler!,
          locationUuid,
          practitioner!.uuid,
        ),
      enabled: canView && !!locationUuid && !!practitioner?.uuid,
    })),
  });
  const activeList =
    listQueries[handlers.findIndex(({ id }) => id === activeTab?.id)];
  const allSearch = useQuery({
    queryKey: ['ipd-all-patient-search', searchTerm],
    queryFn: () => searchPatientByNameOrId(searchTerm),
    enabled:
      canView &&
      !activeTab?.extensionParams.searchHandler &&
      searchTerm.length >= 2,
  });
  const listed = activeTab?.extensionParams.searchHandler
    ? (activeList?.data ?? [])
    : (allSearch.data?.pageOfResults.map((patient) => ({
        uuid: patient.uuid,
        name: [patient.givenName, patient.middleName, patient.familyName]
          .filter(Boolean)
          .join(' '),
        identifier: patient.identifier,
        activeVisitUuid: patient.activeVisitUuid,
        hasBeenAdmitted: patient.hasBeenAdmitted,
      })) ?? []);
  const rows = activeTab?.extensionParams.searchHandler
    ? listed.filter((patient) =>
        `${patient.name} ${patient.identifier}`
          .toLowerCase()
          .includes(searchInput.trim().toLowerCase()),
      )
    : listed;
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: 'Home', href: BAHMNI_HOME_PATH },
            { id: 'ipd', label: 'Inpatient list', isCurrentPage: true },
          ]}
        />
      }
      main={
        <div className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Inpatient care</span>
            <h1>Patient list</h1>
            <p>Find patients by admission status or search by name and ID.</p>
          </div>
          <nav className={styles.pageNav} aria-label="Inpatient views">
            <Link to="/clinical/inpatient" aria-current="page">
              Patient list
            </Link>
            <Link to="/clinical/beds">Ward view</Link>
          </nav>
          {privilegesLoading || practitionerLoading ? (
            <p role="status">Loading inpatient access…</p>
          ) : !canView ? (
            <p role="alert">You do not have access to inpatient care.</p>
          ) : !locationUuid || !practitioner ? (
            <p role="alert">
              Select a login location and provider to view patients.
            </p>
          ) : config.isLoading ? (
            <p role="status">Loading patient lists…</p>
          ) : config.isError ? (
            <p role="alert">Could not load inpatient search settings.</p>
          ) : (
            <section className={styles.card} aria-label="Inpatient patients">
              <div className={styles.tabs} aria-label="Admission status">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={activeTab?.id === tab.id}
                    onClick={() => {
                      setTabId(tab.id);
                      setSearchInput('');
                      setSearchTerm('');
                    }}
                  >
                    {tab.label}
                    {tab.extensionParams.searchHandler && (
                      <span>
                        {listQueries[
                          handlers.findIndex(({ id }) => id === tab.id)
                        ]?.data?.length ?? '…'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {activeTab && (
                <div>
                  <form className={styles.searchForm} onSubmit={submitSearch}>
                    <label htmlFor="ipd-patient-search">
                      {activeTab.extensionParams.searchHandler
                        ? 'Filter this list'
                        : 'Search all patients'}
                    </label>
                    <input
                      id="ipd-patient-search"
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Patient name or ID"
                    />
                    {!activeTab.extensionParams.searchHandler && (
                      <button type="submit">Search</button>
                    )}
                  </form>
                  {activeList?.isLoading &&
                  activeTab.extensionParams.searchHandler ? (
                    <p role="status">Loading patients…</p>
                  ) : activeList?.isError &&
                    activeTab.extensionParams.searchHandler ? (
                    <p role="alert">Could not load this patient list.</p>
                  ) : allSearch.isLoading ? (
                    <p role="status">Searching patients…</p>
                  ) : allSearch.isError ? (
                    <p role="alert">Patient search failed. Please try again.</p>
                  ) : !activeTab.extensionParams.searchHandler &&
                    searchTerm.length < 2 ? (
                    <p>Enter at least two characters to search.</p>
                  ) : rows.length === 0 ? (
                    <p>No patients match this search.</p>
                  ) : (
                    <div className={styles.tableScroll}>
                      <table>
                        <thead>
                          <tr>
                            <th>Patient</th>
                            <th>ID</th>
                            <th>Status</th>
                            <th>Record</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((patient) => (
                            <tr key={patient.uuid}>
                              <td>{patient.name}</td>
                              <td>{patient.identifier}</td>
                              <td>
                                {patient.hasBeenAdmitted === true ||
                                patient.hasBeenAdmitted === 'true'
                                  ? 'Admitted'
                                  : activeTab.label}
                              </td>
                              <td>
                                <Link
                                  to={`/clinical/inpatient/${patient.uuid}`}
                                >
                                  View stay
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      }
    />
  );
};

export default InpatientPatientList;
