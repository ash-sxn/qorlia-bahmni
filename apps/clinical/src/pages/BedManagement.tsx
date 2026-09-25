import { BaseLayout, Header } from '@bahmni/design-system';
import { BAHMNI_HOME_PATH, get, hasPrivilege } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './BedManagement.module.scss';

export interface Bed {
  bedId: number;
  bedNumber: string;
  location: string;
  status: 'AVAILABLE' | 'OCCUPIED' | string;
  bedType?: { displayName?: string };
  bedTagMaps?: { bedTag: { name: string } }[];
  patient?: { uuid: string; display?: string; person?: { display?: string } };
  patients?: Bed['patient'][];
}

export interface Ward {
  ward: { uuid: string; name: string };
  totalBeds: number;
  occupiedBeds: number;
}

export const groupBedsByRoom = (beds: Bed[]) =>
  Object.entries(
    beds.reduce<Record<string, Bed[]>>((rooms, bed) => {
      (rooms[bed.location || 'Unassigned room'] ??= []).push(bed);
      return rooms;
    }, {}),
  );

const BedManagement = () => {
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();
  const [wardUuid, setWardUuid] = useState('');
  const [roomName, setRoomName] = useState('');
  const [bedId, setBedId] = useState<number | null>(null);
  const wards = useQuery({
    queryKey: ['ipd-wards'],
    queryFn: () =>
      get<{ results: Ward[] }>('/openmrs/ws/rest/v1/admissionLocation/'),
    enabled: !privilegesLoading && hasPrivilege(userPrivileges, 'app:adt'),
  });
  const selectedWard = (wards.data?.results ?? []).find(
    ({ ward }) => ward.uuid === wardUuid,
  );
  const wardBeds = useQuery({
    queryKey: ['ipd-ward-beds', wardUuid],
    queryFn: () =>
      get<{ bedLayouts: Bed[] }>(
        `/openmrs/ws/rest/v1/admissionLocation/${encodeURIComponent(wardUuid)}?v=full`,
      ),
    enabled: !!selectedWard,
  });
  const rooms = groupBedsByRoom(wardBeds.data?.bedLayouts ?? []);
  const selectedRoom = rooms.find(([name]) => name === roomName);
  const selectedBed = selectedRoom?.[1].find((bed) => bed.bedId === bedId);
  const patient = selectedBed?.patient ?? selectedBed?.patients?.[0];

  const selectWard = (uuid: string) => {
    setWardUuid(uuid);
    setRoomName('');
    setBedId(null);
  };

  return (
    <BaseLayout
      header={
        <Header
          breadcrumbItems={[
            { id: 'home', label: 'Home', href: BAHMNI_HOME_PATH },
            { id: 'ipd', label: 'Bed management', isCurrentPage: true },
          ]}
        />
      }
      main={
        <div className={styles.page}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>Inpatient care</span>
            <h1>Bed management</h1>
            <p>Find a ward, check availability and open a patient record.</p>
          </div>
          <nav className={styles.pageNav} aria-label="Inpatient views">
            <Link to="/clinical/inpatient">Patient list</Link>
            <Link to="/clinical/beds" aria-current="page">
              Ward view
            </Link>
          </nav>
          {privilegesLoading ? (
            <p role="status">Checking access…</p>
          ) : !hasPrivilege(userPrivileges, 'app:adt') ? (
            <p role="alert">You do not have access to bed management.</p>
          ) : wards.isLoading ? (
            <p role="status">Loading wards…</p>
          ) : wards.isError ? (
            <p role="alert">Could not load wards. Please try again.</p>
          ) : (
            <div className={styles.layout}>
              <section className={styles.card} aria-label="Wards">
                <h2>Wards</h2>
                {(wards.data?.results ?? []).length === 0 ? (
                  <p>No wards are configured.</p>
                ) : (
                  <div className={styles.wardList}>
                    {(wards.data?.results ?? []).map(
                      ({ ward, totalBeds, occupiedBeds }) => (
                        <button
                          key={ward.uuid}
                          type="button"
                          aria-pressed={wardUuid === ward.uuid}
                          onClick={() => selectWard(ward.uuid)}
                        >
                          <strong>{ward.name}</strong>
                          <span>
                            {totalBeds - occupiedBeds} of {totalBeds} available
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </section>
              <section className={styles.card} aria-label="Rooms and beds">
                <div className={styles.sectionTitle}>
                  <div>
                    <span className={styles.eyebrow}>Ward view</span>
                    <h2>{selectedWard?.ward.name ?? 'Select a ward'}</h2>
                  </div>
                  {selectedWard && (
                    <strong>
                      {selectedWard.totalBeds - selectedWard.occupiedBeds}{' '}
                      available
                    </strong>
                  )}
                </div>
                {wardBeds.isLoading ? (
                  <p role="status">Loading beds…</p>
                ) : wardBeds.isError ? (
                  <p role="alert">Could not load beds. Please try again.</p>
                ) : selectedWard && rooms.length === 0 ? (
                  <p>No beds are configured for this ward.</p>
                ) : (
                  <>
                    <div className={styles.roomList}>
                      {rooms.map(([name, beds]) => (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={roomName === name}
                          onClick={() => {
                            setRoomName(name);
                            setBedId(null);
                          }}
                        >
                          <strong>{name}</strong>
                          <span>
                            {
                              beds.filter((bed) => bed.status === 'AVAILABLE')
                                .length
                            }{' '}
                            of {beds.length} available
                          </span>
                        </button>
                      ))}
                    </div>
                    {selectedRoom && (
                      <div
                        className={styles.bedGrid}
                        aria-label={`${roomName} beds`}
                      >
                        {selectedRoom[1].map((bed) => (
                          <button
                            key={bed.bedId}
                            type="button"
                            className={
                              bed.status === 'OCCUPIED'
                                ? styles.occupied
                                : styles.available
                            }
                            aria-pressed={bedId === bed.bedId}
                            onClick={() => setBedId(bed.bedId)}
                          >
                            <strong>{bed.bedNumber}</strong>
                            <span>{bed.status.toLowerCase()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
              <aside className={styles.card} aria-label="Bed details">
                <h2>Bed details</h2>
                {selectedBed ? (
                  <dl className={styles.details}>
                    <dt>Bed</dt>
                    <dd>{selectedBed.bedNumber}</dd>
                    <dt>Room</dt>
                    <dd>{roomName}</dd>
                    <dt>Status</dt>
                    <dd>{selectedBed.status.toLowerCase()}</dd>
                    <dt>Type</dt>
                    <dd>
                      {selectedBed.bedType?.displayName ?? 'Not specified'}
                    </dd>
                    <dt>Tags</dt>
                    <dd>
                      {selectedBed.bedTagMaps?.length
                        ? selectedBed.bedTagMaps
                            .map(({ bedTag }) => bedTag.name)
                            .join(', ')
                        : 'None'}
                    </dd>
                    {patient && (
                      <>
                        <dt>Patient</dt>
                        <dd>
                          {patient.person?.display ??
                            patient.display ??
                            'View record'}
                        </dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p>Select a bed to see its details.</p>
                )}
                {patient?.uuid && (
                  <Link to={`/clinical/inpatient/${patient.uuid}`}>
                    View patient stay
                  </Link>
                )}
              </aside>
            </div>
          )}
        </div>
      }
    />
  );
};

export default BedManagement;
