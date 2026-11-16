export const ENTRY_KINDS = ['doctor', 'hospital'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const PMJAY_ANSWERS = ['yes', 'no', 'unknown'] as const;
export type PmjayAnswer = (typeof PMJAY_ANSWERS)[number];

/** Date-only calendar value in YYYY-MM-DD form. */
export type IsoDate = string;

/** One specialist or hospital that patients can be referred to. Public professional details only. */
export interface ReferralEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: EntryKind;
  readonly speciality: string;
  /** The hospital or clinic a doctor works at. Null for a hospital entry. */
  readonly organisation: string | null;
  readonly city: string;
  readonly district: string;
  readonly phone: string;
  readonly timings: string | null;
  readonly acceptsPmjay: PmjayAnswer;
  readonly sourceUrl: string | null;
  /** When someone last confirmed these details, and who did. */
  readonly verifiedOn: IsoDate;
  readonly verifiedBy: string;
}

export type DirectoryResult =
  | { ok: true; entries: ReferralEntry[] }
  | { ok: false; errors: string[] };
