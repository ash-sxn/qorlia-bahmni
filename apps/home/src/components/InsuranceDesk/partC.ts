/**
 * The worksheet follows the IRDAI standard request for cashless hospitalisation
 * (Part C, circular IRDA/HLT/REG/CIR/86/05/2019), so the desk can copy it into the
 * payer's own form or portal field by field.
 */

export type FieldKind = 'text' | 'long' | 'date' | 'time' | 'number';

export interface WorksheetField {
  key: string;
  kind: FieldKind;
}

export interface WorksheetSection {
  key: string;
  fields: WorksheetField[];
  /** Shown only when the request is for an injury, or for a delivery. */
  when?: 'injury' | 'maternity';
}

const text = (key: string): WorksheetField => ({ key, kind: 'text' });

export const SECTIONS: WorksheetSection[] = [
  {
    key: 'payer',
    fields: [
      text('payer'),
      text('rohini_id'),
      text('insured_card_id'),
      text('policy_number'),
      text('insured_name'),
      text('employee_id'),
      text('patient_phone'),
      text('relative_phone'),
    ],
  },
  {
    key: 'clinical',
    fields: [
      { key: 'complaints', kind: 'long' },
      { key: 'diagnosis', kind: 'long' },
      text('icd10_code'),
      { key: 'treatment', kind: 'long' },
      text('procedure_code'),
    ],
  },
  {
    key: 'admission',
    fields: [
      { key: 'admission_date', kind: 'date' },
      { key: 'admission_time', kind: 'time' },
      { key: 'expected_days', kind: 'number' },
      { key: 'icu_days', kind: 'number' },
      text('room_type'),
    ],
  },
  {
    key: 'injury',
    when: 'injury',
    fields: [
      { key: 'injury_how', kind: 'long' },
      { key: 'injury_date', kind: 'date' },
      text('fir_number'),
      text('substance_use'),
    ],
  },
  {
    key: 'maternity',
    when: 'maternity',
    fields: [{ key: 'expected_delivery', kind: 'date' }],
  },
  {
    key: 'doctor',
    fields: [
      text('treating_doctor'),
      text('doctor_qualification'),
      text('doctor_registration'),
    ],
  },
];

export const FIELD_KEYS = SECTIONS.flatMap(({ fields }) =>
  fields.map(({ key }) => key),
);

export const LINES_OF_TREATMENT = [
  'medical',
  'surgical',
  'intensive_care',
  'investigation',
  'non_allopathic',
] as const;
export type LineOfTreatment = (typeof LINES_OF_TREATMENT)[number];

/** Part C marks this history as mandatory: each condition, and since when. */
export const CHRONIC_CONDITIONS = [
  'diabetes',
  'heart_disease',
  'hypertension',
  'hyperlipidaemia',
  'osteoarthritis',
  'asthma_copd',
  'cancer',
  'alcohol_drug',
  'hiv_std',
  'other',
] as const;
export type ChronicCondition = (typeof CHRONIC_CONDITIONS)[number];

export type AdmissionType = '' | 'emergency' | 'planned';
