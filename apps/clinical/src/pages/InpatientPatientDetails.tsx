import { BaseLayout, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  get,
  getFormattedPatientById,
  hasPrivilege,
} from '@bahmni/services';
import { useActivePractitioner, useUserPrivilege } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BAHMNI_CLINICAL_PATH } from '../constants/app';
import { Bed, groupBedsByRoom, Ward } from './BedManagement';
import styles from './BedManagement.module.scss';
import {
  fetchActiveIpdVisit,
  InpatientAction,
  IpdAppConfig,
  performInpatientAction,
} from './inpatientActions';

export { fetchActiveIpdVisit } from './inpatientActions';

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
  const { practitioner } = useActivePractitioner();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<InpatientAction | null>(null);
  const [wardUuid, setWardUuid] = useState('');
  const [bedId, setBedId] = useState<number | null>(null);
  const [startIpdVisit, setStartIpdVisit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const canView = hasPrivilege(userPrivileges, 'app:adt');
  const canAssign = hasPrivilege(userPrivileges, 'Assign Beds');
  const appConfig = useQuery({
    queryKey: ['ipd-app-config'],
    queryFn: () =>
      get<IpdAppConfig>('/bahmni_config/openmrs/apps/ipd/app.json'),
    enabled: canView && canAssign,
  });
  const defaultVisitType = appConfig.data?.config.defaultVisitType;
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
  const wards = useQuery({
    queryKey: ['ipd-wards'],
    queryFn: () =>
      get<{ results: Ward[] }>('/openmrs/ws/rest/v1/admissionLocation/'),
    enabled: canView && canAssign && !!action && action !== 'discharge',
  });
  const wardBeds = useQuery({
    queryKey: ['ipd-ward-beds', wardUuid],
    queryFn: () =>
      get<{ bedLayouts: Bed[] }>(
        `/openmrs/ws/rest/v1/admissionLocation/${encodeURIComponent(wardUuid)}?v=full`,
      ),
    enabled: !!wardUuid && !!action && action !== 'discharge',
  });
  const selectedWard = wards.data?.results.find(
    ({ ward }) => ward.uuid === wardUuid,
  );
  const availableRooms = groupBedsByRoom(
    (wardBeds.data?.bedLayouts ?? []).filter(
      (candidate) =>
        candidate.status === 'AVAILABLE' &&
        candidate.bedId !== assignedBed?.bedId,
    ),
  );
  const selectedBed = availableRooms
    .flatMap(([, roomBeds]) => roomBeds)
    .find((candidate) => candidate.bedId === bedId);

  const chooseAction = (next: InpatientAction) => {
    setAction(next);
    setWardUuid('');
    setBedId(null);
    setStartIpdVisit(true);
    setActionError('');
    setActionSuccess('');
  };

  const saveAction = async () => {
    if (!action || !patientUuid || !practitioner?.uuid) return;
    setSaving(true);
    setActionError('');
    try {
      await performInpatientAction({
        action,
        patientUuid,
        practitionerUuid: practitioner.uuid,
        targetBedId: bedId ?? undefined,
        expectedVisitUuid: visit.data?.uuid,
        expectedBedId: assignedBed?.bedId,
        startIpdVisit:
          action === 'admit' &&
          !!visit.data &&
          visit.data.visitType.name !== defaultVisitType &&
          startIpdVisit,
      });
      setActionSuccess(
        `${action[0].toUpperCase()}${action.slice(1)} saved. Patient stay refreshed.`,
      );
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ipd-active-visit', patientUuid],
        }),
        queryClient.invalidateQueries({ queryKey: ['ipd-visit-summary'] }),
        queryClient.invalidateQueries({
          queryKey: ['ipd-assigned-bed', patientUuid],
        }),
        queryClient.invalidateQueries({ queryKey: ['ipd-wards'] }),
        queryClient.invalidateQueries({ queryKey: ['ipd-ward-beds'] }),
        queryClient.invalidateQueries({ queryKey: ['ipd-patient-list'] }),
      ]);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The action could not be saved.',
      );
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ipd-active-visit', patientUuid],
        }),
        queryClient.invalidateQueries({ queryKey: ['ipd-visit-summary'] }),
        queryClient.invalidateQueries({
          queryKey: ['ipd-assigned-bed', patientUuid],
        }),
        queryClient.invalidateQueries({ queryKey: ['ipd-wards'] }),
        queryClient.invalidateQueries({ queryKey: ['ipd-ward-beds'] }),
      ]);
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
              {canAssign && (
                <section className={styles.card} aria-label="Inpatient actions">
                  <span className={styles.eyebrow}>Care actions</span>
                  <h2>Manage this stay</h2>
                  <div className={styles.actionChoices}>
                    {!assignedBed ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => chooseAction('admit')}
                      >
                        Admit to a bed
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => chooseAction('transfer')}
                        >
                          Transfer bed
                        </button>
                        <button
                          type="button"
                          disabled={saving || !visit.data}
                          onClick={() => chooseAction('discharge')}
                        >
                          Discharge patient
                        </button>
                      </>
                    )}
                  </div>
                  {actionSuccess && <p role="status">{actionSuccess}</p>}
                  {actionError && <p role="alert">{actionError}</p>}
                  {appConfig.isError && (
                    <p role="alert">Could not load inpatient configuration.</p>
                  )}
                  {action && (
                    <div className={styles.actionForm}>
                      <h3>
                        Confirm{' '}
                        {action === 'transfer' ? 'bed transfer' : action}
                      </h3>
                      {action !== 'discharge' && (
                        <>
                          {wards.isLoading ? (
                            <p role="status">Loading wards…</p>
                          ) : wards.isError ? (
                            <p role="alert">Could not load wards.</p>
                          ) : (
                            <label>
                              Ward
                              <select
                                value={wardUuid}
                                onChange={(event) => {
                                  setWardUuid(event.target.value);
                                  setBedId(null);
                                }}
                              >
                                <option value="">Select a ward</option>
                                {wards.data?.results.map(({ ward }) => (
                                  <option key={ward.uuid} value={ward.uuid}>
                                    {ward.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {selectedWard &&
                            (wardBeds.isLoading ? (
                              <p role="status">Loading available beds…</p>
                            ) : wardBeds.isError ? (
                              <p role="alert">Could not load beds.</p>
                            ) : availableRooms.length ? (
                              <label>
                                Available bed
                                <select
                                  value={bedId ?? ''}
                                  onChange={(event) =>
                                    setBedId(Number(event.target.value) || null)
                                  }
                                >
                                  <option value="">Select a bed</option>
                                  {availableRooms.map(([room, roomBeds]) => (
                                    <optgroup key={room} label={room}>
                                      {roomBeds.map((candidate) => (
                                        <option
                                          key={candidate.bedId}
                                          value={candidate.bedId}
                                        >
                                          {candidate.bedNumber}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <p>No beds are available in this ward.</p>
                            ))}
                          {action === 'admit' &&
                            visit.data &&
                            defaultVisitType &&
                            visit.data.visitType.name !== defaultVisitType && (
                              <fieldset>
                                <legend>Visit handling</legend>
                                <label>
                                  <input
                                    type="radio"
                                    name="visit-handling"
                                    checked={startIpdVisit}
                                    onChange={() => setStartIpdVisit(true)}
                                  />
                                  Close the current {visit.data.visitType.name}{' '}
                                  visit and start a {defaultVisitType} visit
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name="visit-handling"
                                    checked={!startIpdVisit}
                                    onChange={() => setStartIpdVisit(false)}
                                  />
                                  Continue the current{' '}
                                  {visit.data.visitType.name} visit
                                </label>
                              </fieldset>
                            )}
                        </>
                      )}
                      <p>
                        {action === 'discharge'
                          ? `This will discharge ${patient.data?.fullName} from bed ${assignedBed?.bedNumber}.`
                          : `This will ${action} ${patient.data?.fullName} ${action === 'transfer' ? 'to' : 'into'} ${selectedBed?.bedNumber ?? 'the selected bed'}.`}
                      </p>
                      <div className={styles.actionChoices}>
                        <button
                          type="button"
                          disabled={
                            saving ||
                            !defaultVisitType ||
                            (action !== 'discharge' && !selectedBed) ||
                            !practitioner?.uuid
                          }
                          onClick={saveAction}
                        >
                          {saving ? 'Saving…' : `Confirm ${action}`}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setAction(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      }
    />
  );
};

export default InpatientPatientDetails;
