import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  get,
  getFormattedPatientById,
  hasPrivilege,
} from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { BAHMNI_CLINICAL_PATH } from '../constants/app';
import styles from './BedManagement.module.scss';

interface Visit {
  uuid: string;
  startDatetime: string;
  stopDatetime: string | null;
  visitType: { name: string };
}

interface VisitSummary {
  startDateTime: number;
  stopDateTime: number | null;
  visitType: string;
  admissionDetails: { date: number; provider?: string; notes?: string } | null;
  dischargeDetails: { date: number; provider?: string; notes?: string } | null;
}

interface AssignedBed {
  bedId: number;
  bedNumber: string;
  physicalLocation: {
    name: string;
    parentLocation: { display: string };
  };
}

export const fetchActiveIpdVisit = async (patientUuid: string) => {
  const response = await get<{ results: Visit[] }>(
    '/openmrs/ws/rest/v1/visit',
    {
      params: {
        includeInactive: false,
        patient: patientUuid,
        v: 'custom:(uuid,startDatetime,stopDatetime,visitType,patient)',
      },
    },
  );
  return response.results.at(-1) ?? null;
};

export const inpatientStatus = (summary: VisitSummary | undefined) => {
  if (!summary) return 'No active visit';
  if (summary.dischargeDetails) return 'Discharged';
  if (summary.admissionDetails) return 'Admitted';
  return 'Not admitted';
};

const date = (timestamp: number | undefined) =>
  timestamp ? new Date(timestamp).toLocaleString() : 'Not recorded';

const InpatientPatientDetails = () => {
  const { patientUuid } = useParams<{ patientUuid: string }>();
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const canView = hasPrivilege(userPrivileges, 'app:adt');
  const patient = useQuery({
    queryKey: ['ipd-patient', patientUuid],
    queryFn: () => getFormattedPatientById(patientUuid!),
    enabled: canView && !!patientUuid,
  });
  const visit = useQuery({
    queryKey: ['ipd-active-visit', patientUuid],
    queryFn: () => fetchActiveIpdVisit(patientUuid!),
    enabled: canView && !!patientUuid,
  });
  const summary = useQuery({
    queryKey: ['ipd-visit-summary', visit.data?.uuid],
    queryFn: () =>
      get<VisitSummary>('/openmrs/ws/rest/v1/bahmnicore/visit/summary', {
        params: { visitUuid: visit.data!.uuid },
      }),
    enabled: canView && !!visit.data?.uuid,
  });
  const bed = useQuery({
    queryKey: ['ipd-assigned-bed', patientUuid],
    queryFn: () =>
      get<{ results: AssignedBed[] }>('/openmrs/ws/rest/v1/beds', {
        params: { patientUuid, v: 'full' },
      }),
    enabled: canView && !!patientUuid,
  });
  const assignedBed = bed.data?.results[0];

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: 'Home', href: BAHMNI_HOME_PATH },
            {
              id: 'ipd',
              label: 'Inpatient list',
              href: `${BAHMNI_CLINICAL_PATH}/inpatient`,
            },
            { id: 'patient', label: 'Patient stay', isCurrentPage: true },
          ]}
        />
      }
      main={
        <div className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Inpatient care</span>
            <h1>Patient stay</h1>
            <p>Review the current visit and bed before changing care status.</p>
          </div>
          <nav className={styles.pageNav} aria-label="Inpatient views">
            <Link to="/clinical/inpatient">Patient list</Link>
            <Link to="/clinical/beds">Ward view</Link>
          </nav>
          {privilegesLoading ? (
            <p role="status">Checking access…</p>
          ) : !canView ? (
            <p role="alert">You do not have access to inpatient care.</p>
          ) : patient.isLoading || visit.isLoading || bed.isLoading ? (
            <p role="status">Loading patient stay…</p>
          ) : patient.isError || visit.isError || bed.isError ? (
            <p role="alert">Could not load inpatient details.</p>
          ) : (
            <div className={styles.patientLayout}>
              <section className={styles.card} aria-label="Patient details">
                <span className={styles.eyebrow}>Patient</span>
                <h2>{patient.data?.fullName ?? 'Name unavailable'}</h2>
                <dl className={styles.details}>
                  <dt>ID</dt>
                  <dd>{patient.data?.identifier ?? 'Not recorded'}</dd>
                  <dt>Gender</dt>
                  <dd>{patient.data?.gender ?? 'Not recorded'}</dd>
                  <dt>Birth date</dt>
                  <dd>{patient.data?.birthDate ?? 'Not recorded'}</dd>
                </dl>
                <Link to={`/clinical/${patientUuid}`}>
                  Open clinical record
                </Link>
              </section>
              <section className={styles.card} aria-label="Current visit">
                <span className={styles.eyebrow}>Current visit</span>
                {visit.data ? (
                  summary.isLoading ? (
                    <p role="status">Loading visit status…</p>
                  ) : summary.isError ? (
                    <p role="alert">Could not load the visit status.</p>
                  ) : (
                    <>
                      <h2>{inpatientStatus(summary.data)}</h2>
                      <dl className={styles.details}>
                        <dt>Visit type</dt>
                        <dd>
                          {summary.data?.visitType ?? visit.data.visitType.name}
                        </dd>
                        <dt>Started</dt>
                        <dd>{date(summary.data?.startDateTime)}</dd>
                        <dt>Admitted</dt>
                        <dd>{date(summary.data?.admissionDetails?.date)}</dd>
                        {summary.data?.admissionDetails?.provider && (
                          <>
                            <dt>Admitting clinician</dt>
                            <dd>{summary.data.admissionDetails.provider}</dd>
                          </>
                        )}
                        {summary.data?.admissionDetails?.notes && (
                          <>
                            <dt>Admission notes</dt>
                            <dd>{summary.data.admissionDetails.notes}</dd>
                          </>
                        )}
                        {summary.data?.dischargeDetails && (
                          <>
                            <dt>Discharged</dt>
                            <dd>{date(summary.data.dischargeDetails.date)}</dd>
                          </>
                        )}
                      </dl>
                    </>
                  )
                ) : (
                  <p>No active visit is recorded for this patient.</p>
                )}
              </section>
              <section className={styles.card} aria-label="Assigned bed">
                <span className={styles.eyebrow}>Bed assignment</span>
                {assignedBed ? (
                  <>
                    <h2>{assignedBed.bedNumber}</h2>
                    <dl className={styles.details}>
                      <dt>Ward</dt>
                      <dd>
                        {assignedBed.physicalLocation.parentLocation.display}
                      </dd>
                      <dt>Room</dt>
                      <dd>{assignedBed.physicalLocation.name}</dd>
                    </dl>
                  </>
                ) : (
                  <p>No bed is currently assigned.</p>
                )}
              </section>
            </div>
          )}
        </div>
      }
    />
  );
};

export default InpatientPatientDetails;
