import {
  type Appointment,
  type PatientSearchResult,
  type UserPrivilege,
  hasPrivilege,
  searchAppointmentsByAttribute,
  searchPatientByNameOrId,
  useTranslation,
} from '@bahmni/services';
import {
  ArrowRight,
  Calendar,
  Search,
  Stethoscope,
  UserFollow,
} from '@carbon/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import styles from './styles/ClinicalWorkspace.module.scss';

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
};

const patientName = (patient: PatientSearchResult) =>
  [patient.givenName, patient.middleName, patient.familyName]
    .filter(Boolean)
    .join(' ');

const ClinicalWorkspace = ({
  userPrivileges,
}: {
  userPrivileges: UserPrivilege[] | null;
}) => {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const todayRange = getTodayRange();
  const canRegister = hasPrivilege(userPrivileges, 'app:registration');
  const canSchedule = hasPrivilege(userPrivileges, 'app:appointments');
  const canManageBeds = hasPrivilege(userPrivileges, 'app:adt');

  const appointments = useQuery({
    queryKey: ['clinical-todays-appointments', todayRange.startDate],
    queryFn: () => searchAppointmentsByAttribute(todayRange),
  });
  const patients = useQuery({
    queryKey: ['clinical-patient-search', searchTerm],
    queryFn: () => searchPatientByNameOrId(searchTerm),
    enabled: searchTerm.length >= 2,
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  const appointmentRows = appointments.data ?? [];
  const patientRows = patients.data?.pageOfResults ?? [];

  return (
    <div className={styles.workspace}>
      <nav className={styles.sidebar} aria-label={t('CLINICAL_WORKSPACE_NAV')}>
        <div className={styles.sidebarTitle}>
          {t('CLINICAL_WORKSPACE_LABEL')}
        </div>
        <Link to="/home">
          <Calendar size={19} />
          {t('HOME_LABEL')}
        </Link>
        <Link to="/clinical" aria-current="page">
          <Stethoscope size={19} />
          {t('CLINICAL_LABEL')}
        </Link>
        <Link to="/clinical/programs">
          <UserFollow size={19} />
          {t('PROGRAMS_TITLE')}
        </Link>
        {canRegister && (
          <Link to="/registration/search">
            <UserFollow size={19} />
            {t('CLINICAL_WORKSPACE_REGISTRATION')}
          </Link>
        )}
        {canSchedule && (
          <a href="/appointments/#/home/manage/summary">
            <Calendar size={19} />
            {t('CLINICAL_WORKSPACE_APPOINTMENTS')}
          </a>
        )}
        {canManageBeds && <Link to="/clinical/inpatient">Inpatient care</Link>}
      </nav>

      <div className={styles.content}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>
            {t('CLINICAL_WORKSPACE_LABEL')}
          </span>
          <h1>{t('CLINICAL_WORKSPACE_HEADING')}</h1>
          <p>{t('CLINICAL_WORKSPACE_DESCRIPTION')}</p>
        </div>

        <section
          className={styles.panel}
          aria-labelledby="appointments-heading"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.sectionKicker}>
                {t('CLINICAL_WORKSPACE_TODAY')}
              </span>
              <h2 id="appointments-heading">
                {t('CLINICAL_WORKSPACE_APPOINTMENTS')}
              </h2>
            </div>
            <span className={styles.count}>{appointmentRows.length}</span>
          </div>
          {appointments.isLoading ? (
            <p role="status">{t('CLINICAL_WORKSPACE_LOADING_APPOINTMENTS')}</p>
          ) : appointments.isError ? (
            <p role="alert">{t('CLINICAL_WORKSPACE_APPOINTMENTS_ERROR')}</p>
          ) : appointmentRows.length === 0 ? (
            <div className={styles.empty}>
              <Calendar size={24} />
              <p>{t('CLINICAL_WORKSPACE_NO_APPOINTMENTS')}</p>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>{t('CLINICAL_WORKSPACE_TIME')}</th>
                    <th>{t('CLINICAL_WORKSPACE_PATIENT')}</th>
                    <th>{t('CLINICAL_WORKSPACE_SERVICE')}</th>
                    <th>{t('CLINICAL_WORKSPACE_STATUS')}</th>
                    <th>{t('CLINICAL_WORKSPACE_ACTION')}</th>
                  </tr>
                </thead>
                <tbody>
                  {appointmentRows.map((appointment: Appointment) => (
                    <tr key={appointment.uuid}>
                      <td>
                        {new Date(appointment.startDateTime).toLocaleTimeString(
                          undefined,
                          { hour: 'numeric', minute: '2-digit' },
                        )}
                      </td>
                      <td>
                        <strong>{appointment.patient.name}</strong>
                        <small>{appointment.patient.identifier}</small>
                      </td>
                      <td>
                        {appointment.service?.name ??
                          t('CLINICAL_WORKSPACE_NOT_SPECIFIED')}
                      </td>
                      <td>{appointment.status}</td>
                      <td>
                        <Link to={`/clinical/${appointment.patient.uuid}`}>
                          {t('CLINICAL_WORKSPACE_OPEN_RECORD')}
                          <ArrowRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className={styles.panel}
          aria-labelledby="find-patient-heading"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.sectionKicker}>
                {t('CLINICAL_WORKSPACE_RECORDS')}
              </span>
              <h2 id="find-patient-heading">
                {t('CLINICAL_WORKSPACE_FIND_PATIENT')}
              </h2>
            </div>
          </div>
          <form
            className={styles.searchForm}
            onSubmit={submitSearch}
            role="search"
          >
            <label htmlFor="clinical-patient-search">
              {t('CLINICAL_WORKSPACE_SEARCH_LABEL')}
            </label>
            <div>
              <Search size={19} aria-hidden="true" />
              <input
                id="clinical-patient-search"
                type="search"
                minLength={2}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('CLINICAL_WORKSPACE_SEARCH_PLACEHOLDER')}
              />
              <button type="submit">{t('CLINICAL_WORKSPACE_SEARCH')}</button>
            </div>
          </form>
          {searchTerm &&
            (patients.isLoading ? (
              <p role="status">{t('CLINICAL_WORKSPACE_SEARCHING')}</p>
            ) : patients.isError ? (
              <p role="alert">{t('CLINICAL_WORKSPACE_SEARCH_ERROR')}</p>
            ) : patientRows.length === 0 ? (
              <p className={styles.empty}>
                {t('CLINICAL_WORKSPACE_NO_PATIENTS')}
              </p>
            ) : (
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('CLINICAL_WORKSPACE_PATIENT')}</th>
                      <th>{t('CLINICAL_WORKSPACE_ID')}</th>
                      <th>{t('CLINICAL_WORKSPACE_AGE')}</th>
                      <th>{t('CLINICAL_WORKSPACE_ACTION')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientRows.map((patient) => (
                      <tr key={patient.uuid}>
                        <td>
                          <strong>{patientName(patient)}</strong>
                        </td>
                        <td>{patient.identifier}</td>
                        <td>{patient.age}</td>
                        <td>
                          <Link to={`/clinical/${patient.uuid}`}>
                            {t('CLINICAL_WORKSPACE_OPEN_RECORD')}
                            <ArrowRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </section>
      </div>

      <aside
        className={styles.rail}
        aria-label={t('CLINICAL_WORKSPACE_SUMMARY')}
      >
        <div className={styles.railPanel}>
          <h2>{t('CLINICAL_WORKSPACE_TODAY')}</h2>
          <strong>
            {appointments.isError
              ? t('CLINICAL_WORKSPACE_UNAVAILABLE')
              : appointmentRows.length}
          </strong>
          <p>{t('CLINICAL_WORKSPACE_APPOINTMENTS')}</p>
        </div>
        <div className={styles.railPanel}>
          <h2>{t('CLINICAL_WORKSPACE_QUICK_ACTIONS')}</h2>
          <button
            type="button"
            onClick={() =>
              document.getElementById('clinical-patient-search')?.focus()
            }
          >
            <Search size={18} />
            {t('CLINICAL_WORKSPACE_FIND_PATIENT')}
          </button>
          {canRegister && (
            <Link to="/registration/search">
              <UserFollow size={18} />
              {t('CLINICAL_WORKSPACE_REGISTRATION')}
            </Link>
          )}
          {canSchedule && (
            <a href="/appointments/#/home/manage/summary">
              <Calendar size={18} />
              {t('CLINICAL_WORKSPACE_APPOINTMENTS')}
            </a>
          )}
        </div>
      </aside>
    </div>
  );
};

export default ClinicalWorkspace;
