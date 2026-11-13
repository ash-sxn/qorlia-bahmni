import {
  get,
  getUserLoginLocation,
  post,
  searchConceptByName,
} from '@bahmni/services';

interface Visit {
  uuid: string;
  startDatetime: string;
  stopDatetime: string | null;
  visitType: { name: string };
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

export type InpatientAction = 'admit' | 'transfer' | 'discharge';

interface EncounterConfig {
  encounterTypes: Record<'ADMISSION' | 'TRANSFER' | 'DISCHARGE', string>;
  visitTypes: Record<string, string>;
}

export interface IpdAppConfig {
  config: {
    defaultVisitType: string;
    dashboard?: { conceptName?: string };
  };
}

interface BedDetails {
  patients: { uuid: string }[];
}

interface AssignedBed {
  bedId: number;
}

interface EncounterResult {
  patientUuid: string;
  encounterUuid: string;
  visitUuid: string;
}

interface ActionInput {
  action: InpatientAction;
  patientUuid: string;
  practitionerUuid: string;
  targetBedId?: number;
  startIpdVisit?: boolean;
  expectedVisitUuid?: string;
  expectedBedId?: number;
  notes?: string;
}

const root = '/openmrs/ws/rest/v1';
const noteConceptView = 'custom:(uuid,name,datatype,set)';

export const fetchAdtNoteConcept = (name: string) =>
  searchConceptByName(name, noteConceptView);

export const performInpatientAction = async ({
  action,
  patientUuid,
  practitionerUuid,
  targetBedId,
  startIpdVisit = false,
  expectedVisitUuid,
  expectedBedId,
  notes,
}: ActionInput) => {
  const [config, app, visit, beds] = await Promise.all([
    get<EncounterConfig>(
      `${root}/bahmnicore/config/bahmniencounter?callerContext=REGISTRATION_CONCEPTS`,
    ),
    get<IpdAppConfig>('/bahmni_config/openmrs/apps/ipd/app.json'),
    fetchActiveIpdVisit(patientUuid),
    get<{ results: AssignedBed[] }>(`${root}/beds`, {
      params: { patientUuid, v: 'full' },
    }),
  ]);
  const assignedBed = beds.results[0];
  if (
    visit?.uuid !== expectedVisitUuid ||
    assignedBed?.bedId !== expectedBedId
  ) {
    throw new Error(
      'The patient stay changed. Refresh the page before continuing.',
    );
  }
  if (action === 'admit' && assignedBed) {
    throw new Error(
      'This patient already has an assigned bed. Refresh the page.',
    );
  }
  if (action !== 'admit' && (!assignedBed || !visit)) {
    throw new Error(
      'The patient no longer has an active inpatient stay. Refresh the page.',
    );
  }
  if (action === 'transfer' && assignedBed?.bedId === targetBedId) {
    throw new Error('Choose a different bed for transfer.');
  }
  if (action !== 'discharge') {
    if (targetBedId == null) throw new Error('Choose an available bed.');
    const target = await get<BedDetails>(`${root}/beds/${targetBedId}`);
    if (target.patients.length) {
      throw new Error('That bed is no longer available. Choose another bed.');
    }
  }

  const encounterType = {
    admit: 'ADMISSION',
    transfer: 'TRANSFER',
    discharge: 'DISCHARGE',
  } as const;
  const visitTypeUuid =
    action === 'discharge'
      ? undefined
      : config.visitTypes[
          startIpdVisit || !visit
            ? app.config.defaultVisitType
            : visit.visitType.name
        ];
  if (action !== 'discharge' && !visitTypeUuid) {
    throw new Error(
      'The visit type is not configured. Contact an administrator.',
    );
  }
  if (
    startIpdVisit &&
    (!visit || visit.visitType.name === app.config.defaultVisitType)
  ) {
    throw new Error('The visit changed. Refresh the page before continuing.');
  }
  const noteConceptName = app.config.dashboard?.conceptName;
  const noteConcept = noteConceptName
    ? await fetchAdtNoteConcept(noteConceptName)
    : null;
  if (
    noteConceptName &&
    (!noteConcept ||
      noteConcept.set ||
      noteConcept.datatype?.display !== 'Text')
  ) {
    throw new Error(
      'The configured movement notes cannot be saved here. Use the legacy inpatient screen.',
    );
  }
  const noteText = notes?.trim();
  if (noteText && !noteConcept) {
    throw new Error('Movement notes are not configured for this hospital.');
  }
  const encounter = {
    patientUuid,
    encounterTypeUuid: config.encounterTypes[encounterType[action]],
    visitTypeUuid,
    observations: noteText
      ? [{ concept: { uuid: noteConcept!.uuid }, value: noteText }]
      : [],
    locationUuid: getUserLoginLocation().uuid,
    providers: [{ uuid: practitionerUuid }],
  };
  if (!encounter.encounterTypeUuid || !encounter.locationUuid) {
    throw new Error(
      'Inpatient configuration is incomplete. Contact an administrator.',
    );
  }

  if (action === 'discharge') {
    return post<EncounterResult>(`${root}/bahmnicore/discharge`, encounter);
  }
  const saved = startIpdVisit
    ? await post<EncounterResult>(
        `${root}/bahmnicore/visit/endVisitAndCreateEncounter?visitUuid=${encodeURIComponent(visit!.uuid)}`,
        encounter,
      )
    : await post<EncounterResult>(
        `${root}/bahmnicore/bahmniencounter`,
        encounter,
      );
  try {
    await post(`${root}/beds/${targetBedId}`, {
      patientUuid: saved.patientUuid,
      encounterUuid: saved.encounterUuid,
    });
  } catch {
    throw new Error(
      'The encounter was saved, but the bed assignment failed. Refresh and check the patient before retrying.',
    );
  }
  return saved;
};
