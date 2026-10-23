export type Jurisdiction = 'central' | 'madhya_pradesh';

export type PolicyCategory =
  | 'digital_health'
  | 'data_protection'
  | 'government_schemes'
  | 'facility_registration';

export type ReviewStatus = 'draft' | 'reviewed' | 'needs_review';

/** Date-only calendar value in YYYY-MM-DD form. */
export type IsoDate = string;

export interface PolicyEntry {
  readonly id: string;
  readonly title: string;
  readonly authority: string;
  readonly jurisdiction: Jurisdiction;
  readonly category: PolicyCategory;
  readonly summary: string;
  readonly applicabilityNote: string | null;
  readonly sourceUrl: string;
  readonly publishedOn: IsoDate | null;
  readonly effectiveOn: IsoDate | null;
  readonly sourceCheckedOn: IsoDate | null;
  readonly reviewStatus: ReviewStatus;
  readonly reviewedOn: IsoDate | null;
  readonly reviewDueOn: IsoDate | null;
  readonly reviewer: string | null;
}

export type CatalogueResult =
  | { ok: true; entries: PolicyEntry[] }
  | { ok: false; errors: string[] };
