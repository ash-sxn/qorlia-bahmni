import { del, get, post } from '../api';
import { OPENMRS_REST_V1 } from '../constants/app';
import { SavedDiagnosis } from './models';

const recordUrl = (uuid: string) => {
  if (!uuid || !/^[a-zA-Z0-9-]+$/.test(uuid)) {
    throw new Error('A saved diagnosis identifier is required');
  }
  return `${OPENMRS_REST_V1}/patientdiagnoses/${uuid}`;
};

const validCertainty = (value: unknown) =>
  value === 'CONFIRMED' || value === 'PROVISIONAL';

function validateRecord(
  record: SavedDiagnosis,
  patientUUID: string,
  uuid: string,
) {
  if (
    !patientUUID ||
    record?.uuid !== uuid ||
    record.patient?.uuid !== patientUUID ||
    !record.encounter?.uuid ||
    (record.encounter.patient &&
      record.encounter.patient.uuid !== patientUUID) ||
    !validCertainty(record.certainty) ||
    !Number.isSafeInteger(record.rank) ||
    record.rank < 1 ||
    typeof record.voided !== 'boolean' ||
    !record.auditInfo?.dateCreated ||
    !Number.isFinite(Date.parse(record.auditInfo.dateCreated)) ||
    (record.auditInfo.dateChanged != null &&
      !Number.isFinite(Date.parse(record.auditInfo.dateChanged))) ||
    (!record.diagnosis?.coded?.uuid && !record.diagnosis?.nonCoded?.trim()) ||
    (record.condition != null && !record.condition.uuid)
  ) {
    throw new Error(
      'Incomplete or mismatched saved diagnosis. Reload the chart.',
    );
  }
}

export async function getSavedDiagnosis(
  patientUUID: string,
  diagnosisUUID: string,
): Promise<SavedDiagnosis> {
  if (!patientUUID) throw new Error('The patient is required');
  const record = await get<SavedDiagnosis>(
    `${recordUrl(diagnosisUUID)}?v=full`,
    {
      headers: { 'Cache-Control': 'no-cache' },
    },
  );
  validateRecord(record, patientUUID, diagnosisUUID);
  return record;
}

// Compare native writable identity and revision, not GET-only links/display data.
const revision = (record: SavedDiagnosis) =>
  JSON.stringify([
    record.uuid,
    record.patient.uuid,
    record.encounter.uuid,
    record.diagnosis.coded?.uuid ?? null,
    record.diagnosis.nonCoded ?? null,
    record.condition?.uuid ?? null,
    record.certainty,
    record.rank,
    record.voided,
    record.encounter.voided ?? false,
    record.formFieldNamespace ?? null,
    record.formFieldPath ?? null,
    record.auditInfo.dateCreated,
    record.auditInfo.dateChanged ?? null,
  ]);

async function recheck(patientUUID: string, expected: SavedDiagnosis) {
  validateRecord(expected, patientUUID, expected?.uuid);
  if (expected.voided || expected.encounter.voided) {
    throw new Error(
      'This diagnosis or encounter has been removed. Reload the chart.',
    );
  }
  const current = await getSavedDiagnosis(patientUUID, expected.uuid);
  // ponytail: native REST has no verified conditional write; this catches changes
  // observed before submission, not a competing write after this read.
  if (revision(current) !== revision(expected)) {
    throw new Error('This diagnosis changed. Reload it before saving.');
  }
  return current;
}

export async function updateSavedDiagnosis(
  patientUUID: string,
  expected: SavedDiagnosis,
  changes: { certainty: SavedDiagnosis['certainty']; rank: 1 | 2 },
): Promise<SavedDiagnosis> {
  if (!validCertainty(changes.certainty) || ![1, 2].includes(changes.rank)) {
    throw new Error('Select a valid diagnosis certainty and order');
  }
  const current = await recheck(patientUUID, expected);
  const payload = {
    diagnosis: {
      ...(current.diagnosis.coded && { coded: current.diagnosis.coded.uuid }),
      ...(current.diagnosis.nonCoded != null && {
        nonCoded: current.diagnosis.nonCoded,
      }),
    },
    condition: current.condition?.uuid ?? null,
    encounter: current.encounter.uuid,
    certainty: changes.certainty,
    rank: changes.rank,
    voided: false,
    ...(current.formFieldNamespace != null && {
      formFieldNamespace: current.formFieldNamespace,
    }),
    ...(current.formFieldPath != null && {
      formFieldPath: current.formFieldPath,
    }),
  };
  const saved = await post<SavedDiagnosis>(
    `${recordUrl(current.uuid)}?v=full`,
    payload,
  );
  validateRecord(saved, patientUUID, current.uuid);
  if (
    saved.voided ||
    saved.certainty !== changes.certainty ||
    saved.rank !== changes.rank ||
    saved.encounter.uuid !== current.encounter.uuid ||
    saved.diagnosis.coded?.uuid !== current.diagnosis.coded?.uuid ||
    (saved.diagnosis.nonCoded ?? null) !==
      (current.diagnosis.nonCoded ?? null) ||
    (saved.condition?.uuid ?? null) !== (current.condition?.uuid ?? null) ||
    (saved.formFieldNamespace ?? null) !==
      (current.formFieldNamespace ?? null) ||
    (saved.formFieldPath ?? null) !== (current.formFieldPath ?? null)
  ) {
    throw new Error(
      'The saved diagnosis could not be confirmed. Reload before retrying.',
    );
  }
  return saved;
}

/** Native DELETE voids the diagnosis; never request purge or delete its encounter. */
export async function removeSavedDiagnosis(
  patientUUID: string,
  expected: SavedDiagnosis,
  reason: string,
): Promise<void> {
  if (!reason?.trim() || reason.trim().length > 255) {
    throw new Error('Enter a removal reason of 1 to 255 characters');
  }
  const current = await recheck(patientUUID, expected);
  await del(recordUrl(current.uuid), { params: { reason: reason.trim() } });
}
