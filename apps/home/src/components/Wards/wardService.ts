import { get, OPENMRS_FHIR_R4, OPENMRS_REST_V1 } from '@bahmni/services';

// Read-only: every call in this file is a GET. Nothing here saves or changes data.

/** One ward with its bed counts, from GET admissionLocation. */
export interface Ward {
  ward: { uuid: string; name: string };
  totalBeds: number;
  occupiedBeds: number;
}

interface BedPatient {
  uuid: string;
  person?: {
    gender?: string;
    age?: number | null;
    preferredName?: { givenName?: string; familyName?: string };
  };
  identifiers?: { identifier: string }[];
}

interface BedLayout {
  bedId: number;
  bedNumber: string;
  location?: string;
  status: string;
  patients?: BedPatient[];
  patient?: BedPatient;
}

/** One occupied bed and the patient in it. */
export interface WardBed {
  bedId: number;
  bedNumber: string;
  room: string;
  patientUuid: string;
  name: string;
  identifier: string;
  age: number | null;
  gender: string;
}

export const getWards = async (): Promise<Ward[]> => {
  const { results } = await get<{ results: Ward[] }>(
    `${OPENMRS_REST_V1}/admissionLocation`,
  );
  return results;
};

/** Occupied beds in one ward, in bed order. Empty beds are left out. */
export const getOccupiedBeds = async (wardUuid: string): Promise<WardBed[]> => {
  const { bedLayouts = [] } = await get<{ bedLayouts?: BedLayout[] }>(
    `${OPENMRS_REST_V1}/admissionLocation/${encodeURIComponent(wardUuid)}?v=full`,
  );
  return bedLayouts
    .map((bed) => ({ bed, patient: bed.patient ?? bed.patients?.[0] }))
    .filter(
      (entry): entry is { bed: BedLayout; patient: BedPatient } =>
        entry.bed.status === 'OCCUPIED' && Boolean(entry.patient?.uuid),
    )
    .map(({ bed, patient }) => {
      const given = patient.person?.preferredName?.givenName ?? '';
      const family = patient.person?.preferredName?.familyName ?? '';
      return {
        bedId: bed.bedId,
        bedNumber: bed.bedNumber,
        room: bed.location ?? '',
        patientUuid: patient.uuid,
        name: `${given} ${family}`.trim(),
        identifier: patient.identifiers?.[0]?.identifier ?? '',
        age: patient.person?.age ?? null,
        gender: patient.person?.gender ?? '',
      };
    })
    .sort((a, b) =>
      a.bedNumber.localeCompare(b.bedNumber, undefined, { numeric: true }),
    );
};

/** CIEL concepts for the readings a nurse takes on rounds. */
export const VITAL_CONCEPTS = {
  pulse: '5087AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  systolic: '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  diastolic: '5086AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  temperature: '5088AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  spo2: '5092AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  respiratoryRate: '5242AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
} as const;

export type VitalKind = keyof typeof VITAL_CONCEPTS;

/** The latest value of each reading, and when the newest of them was taken. */
export interface LatestVitals {
  takenAt: string | null;
  values: Partial<Record<VitalKind, number>>;
}

interface FhirObservation {
  code?: { coding?: { code?: string }[] };
  effectiveDateTime?: string;
  valueQuantity?: { value?: number };
}

const kindOf = (observation: FhirObservation): VitalKind | undefined => {
  const codes = (observation.code?.coding ?? []).map(({ code }) => code);
  return (Object.keys(VITAL_CONCEPTS) as VitalKind[]).find((kind) =>
    codes.includes(VITAL_CONCEPTS[kind]),
  );
};

/** Newest first, so the first value seen for each reading is the latest one. */
export const latestVitals = (observations: FhirObservation[]): LatestVitals => {
  const sorted = [...observations]
    .filter((observation) => observation.effectiveDateTime)
    .sort((a, b) => b.effectiveDateTime!.localeCompare(a.effectiveDateTime!));
  const values: LatestVitals['values'] = {};
  for (const observation of sorted) {
    const kind = kindOf(observation);
    const value = observation.valueQuantity?.value;
    if (kind && value !== undefined && values[kind] === undefined) {
      values[kind] = value;
    }
  }
  return { takenAt: sorted[0]?.effectiveDateTime ?? null, values };
};

export const getLatestVitals = async (
  patientUuid: string,
): Promise<LatestVitals> => {
  const params = new URLSearchParams({
    patient: patientUuid,
    code: Object.values(VITAL_CONCEPTS).join(','),
    _sort: '-date',
    _count: '24',
  });
  const bundle = await get<{ entry?: { resource: FhirObservation }[] }>(
    `${OPENMRS_FHIR_R4}/Observation?${params}`,
  );
  return latestVitals((bundle.entry ?? []).map(({ resource }) => resource));
};

/** Hours after which a nurse should take readings again (four-hourly TPR). */
export const VITALS_INTERVAL_HOURS = 4;

export const vitalsDue = (vitals: LatestVitals, now: Date = new Date()) =>
  !vitals.takenAt ||
  now.getTime() - new Date(vitals.takenAt).getTime() >
    VITALS_INTERVAL_HOURS * 3_600_000;

/** One medicine the patient is on now. */
export interface CurrentMedicine {
  uuid: string;
  name: string;
  dose: string;
  frequency: string;
  route: string;
  /** INPATIENT orders are given on the ward; OUTPATIENT ones go home with the patient. */
  careSetting: string;
  asNeeded: boolean;
  /** Days the order runs for, when its duration is in days or weeks. */
  durationDays: number | null;
}

interface BahmniDrugOrder {
  drugOrder: {
    uuid: string;
    careSetting?: string;
    duration?: number | null;
    durationUnits?: string | null;
    dateStopped: number | null;
    autoExpireDate: number | null;
    drug?: { name?: string };
    drugNonCoded?: string | null;
    concept?: { name?: string };
    dosingInstructions?: {
      dose?: number | null;
      doseUnits?: string | null;
      frequency?: string | null;
      route?: string | null;
      asNeeded?: boolean | null;
      administrationInstructions?: string | null;
    };
  };
}

const durationInDays = (
  duration?: number | null,
  units?: string | null,
): number | null => {
  if (!duration) return null;
  if (/^days?$/i.test(units ?? '')) return duration;
  if (/^weeks?$/i.test(units ?? '')) return duration * 7;
  return null;
};

/** Orders that are neither stopped nor past their end date. */
export const currentMedicines = (
  orders: BahmniDrugOrder[],
  now: Date = new Date(),
): CurrentMedicine[] =>
  orders
    .map(({ drugOrder }) => drugOrder)
    .filter(
      (order) =>
        !order.dateStopped &&
        (!order.autoExpireDate || order.autoExpireDate > now.getTime()),
    )
    .map((order) => {
      const dosing = order.dosingInstructions ?? {};
      return {
        uuid: order.uuid,
        name:
          order.drug?.name ?? order.drugNonCoded ?? order.concept?.name ?? '',
        dose:
          dosing.dose !== null && dosing.dose !== undefined
            ? `${dosing.dose} ${dosing.doseUnits ?? ''}`.trim()
            : '',
        frequency: dosing.frequency ?? '',
        route: dosing.route ?? '',
        careSetting: order.careSetting ?? '',
        asNeeded: Boolean(dosing.asNeeded),
        durationDays: durationInDays(order.duration, order.durationUnits),
      };
    });

export const getCurrentMedicines = async (
  patientUuid: string,
): Promise<CurrentMedicine[]> => {
  const orders = await get<BahmniDrugOrder[]>(
    `${OPENMRS_REST_V1}/bahmnicore/drugOrders?patientUuid=${encodeURIComponent(patientUuid)}&includeActiveVisit=true&numberOfVisits=3`,
  );
  return currentMedicines(orders);
};
