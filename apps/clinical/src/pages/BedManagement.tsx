import { BaseLayout, Header } from '@bahmni/design-system';
import { BAHMNI_HOME_PATH, get, hasPrivilege } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './BedManagement.module.scss';
import { fetchBedTags, saveBedTags } from './bedTags';

export interface Bed {
  bedId: number;
  bedNumber: string;
  location: string;
  status: 'AVAILABLE' | 'OCCUPIED' | string;
  bedType?: { displayName?: string };
  bedTagMaps?: {
    uuid: string;
    bedTag: { id: number; uuid: string; name: string };
  }[];
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
  const queryClient = useQueryClient();
  const [wardUuid, setWardUuid] = useState('');
  const [roomName, setRoomName] = useState('');
  const [bedId, setBedId] = useState<number | null>(null);
  const [editingBedId, setEditingBedId] = useState<number | null>(null);
  const [selectedTagUuids, setSelectedTagUuids] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [tagMessage, setTagMessage] = useState('');
  const [tagError, setTagError] = useState('');
  const canEditTags = hasPrivilege(userPrivileges, 'Edit Bed Tags');
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
  const currentTagUuids = (selectedBed?.bedTagMaps ?? []).map(
    ({ bedTag }) => bedTag.uuid,
  );
  const tagsChanged =
    selectedTagUuids.length !== currentTagUuids.length ||
    selectedTagUuids.some((uuid) => !currentTagUuids.includes(uuid));
  const tags = useQuery({
    queryKey: ['ipd-bed-tags'],
    queryFn: fetchBedTags,
    enabled: canEditTags && editingBedId !== null,
  });
  const visibleTags = [
    ...(tags.data ?? []),
    ...(selectedBed?.bedTagMaps ?? [])
      .map(({ bedTag }) => bedTag)
      .filter(
        ({ uuid }) => !(tags.data ?? []).some((tag) => tag.uuid === uuid),
      ),
  ];

  const selectWard = (uuid: string) => {
    setWardUuid(uuid);
    setRoomName('');
    setBedId(null);
    setEditingBedId(null);
    setTagMessage('');
    setTagError('');
  };

  const editTags = () => {
    if (!selectedBed || !canEditTags) return;
    setSelectedTagUuids(
      (selectedBed.bedTagMaps ?? []).map(({ bedTag }) => bedTag.uuid),
    );
    setEditingBedId(selectedBed.bedId);
    setTagMessage('');
    setTagError('');
  };

  const updateTags = async () => {
    if (editingBedId !== selectedBed?.bedId || !canEditTags) return;
    setSavingTags(true);
    setTagError('');
    try {
      await saveBedTags(
        wardUuid,
        selectedBed.bedId,
        (selectedBed.bedTagMaps ?? []).map(({ uuid }) => uuid),
        selectedTagUuids,
      );
      setTagMessage('Bed tags updated.');
    } catch (error) {
      setTagError(
        error instanceof Error ? error.message : 'Could not update bed tags.',
      );
    } finally {
      setEditingBedId(null);
      setSavingTags(false);
      await queryClient.invalidateQueries({
        queryKey: ['ipd-ward-beds', wardUuid],
      });
    }
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
                            setEditingBedId(null);
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
                            onClick={() => {
                              setBedId(bed.bedId);
                              setEditingBedId(null);
                              setTagMessage('');
                              setTagError('');
                            }}
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
                {selectedBed && canEditTags && editingBedId === null && (
                  <div className={styles.actionChoices}>
                    <button type="button" onClick={editTags}>
                      Edit bed tags
                    </button>
                  </div>
                )}
                {tagMessage && <p role="status">{tagMessage}</p>}
                {tagError && <p role="alert">{tagError}</p>}
                {selectedBed && editingBedId === selectedBed?.bedId && (
                  <div className={styles.actionForm}>
                    <h3>Edit tags for {selectedBed.bedNumber}</h3>
                    {tags.isLoading ? (
                      <p role="status">Loading bed tags…</p>
                    ) : tags.isError ? (
                      <p role="alert">Could not load bed tags.</p>
                    ) : (
                      <fieldset>
                        <legend>Available tags</legend>
                        {visibleTags.length === 0 && (
                          <p>No bed tags are configured.</p>
                        )}
                        {visibleTags.map((tag) => (
                          <label key={tag.uuid}>
                            <input
                              type="checkbox"
                              checked={selectedTagUuids.includes(tag.uuid)}
                              onChange={(event) =>
                                setSelectedTagUuids((current) =>
                                  event.target.checked
                                    ? [...current, tag.uuid]
                                    : current.filter(
                                        (uuid) => uuid !== tag.uuid,
                                      ),
                                )
                              }
                            />
                            {tag.name}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <div className={styles.actionChoices}>
                      <button
                        type="button"
                        disabled={savingTags || !tags.isSuccess || !tagsChanged}
                        onClick={updateTags}
                      >
                        {savingTags ? 'Updating…' : 'Update tags'}
                      </button>
                      <button
                        type="button"
                        disabled={savingTags}
                        onClick={() => setEditingBedId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
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
