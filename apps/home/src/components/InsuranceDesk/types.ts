export const CLAIM_ROUTES = ['cashless', 'reimbursement'] as const;
export type ClaimRoute = (typeof CLAIM_ROUTES)[number];

export const ADMISSION_TYPES = ['planned', 'emergency'] as const;
export type AdmissionType = (typeof ADMISSION_TYPES)[number];

export const CASE_STATUSES = [
  'admitted',
  'preauthorisation_pending',
  'preauthorisation_approved',
  'enhancement_pending',
  'discharge_pending',
  'final_approved',
  'claim_submitted',
  'settled',
  'short_paid',
  'denied',
  'documents_handed_over',
  'closed',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const AUTHORISATION_KINDS = [
  'preauthorisation',
  'enhancement',
  'final',
] as const;
export type AuthorisationKind = (typeof AUTHORISATION_KINDS)[number];

export const AUTHORISATION_DECISIONS = [
  'pending',
  'approved',
  'partly_approved',
  'denied',
] as const;
export type AuthorisationDecision = (typeof AUTHORISATION_DECISIONS)[number];

export const DEDUCTION_CATEGORIES = [
  'non_medical',
  'room_rent',
  'co_pay',
  'sub_limit',
  'not_covered',
  'other',
] as const;
export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number];

export const CASE_STAGES = [
  'admission',
  'preauthorisation',
  'discharge',
  'claim_submission',
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

export const DOCUMENT_STATES = [
  'pending',
  'received',
  'sent',
  'not_applicable',
] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];

/** Date-only calendar value in YYYY-MM-DD form. */
export type IsoDate = string;

/** Date and time in ISO 8601 form. */
export type IsoDateTime = string;

/** Money as a whole number of paise, shown in rupees on screen. */
export type Paise = number;

/** Null means the amount is not tracked or not known yet. */
export interface CaseAmounts {
  readonly billed: Paise | null;
  readonly claimed: Paise | null;
  readonly approved: Paise | null;
  readonly patientResponsibility: Paise | null;
  readonly received: Paise | null;
}

export interface Authorisation {
  readonly kind: AuthorisationKind;
  readonly requestedAmount: Paise;
  readonly requestedAt: IsoDateTime;
  readonly decision: AuthorisationDecision;
  readonly approvedAmount: Paise | null;
  readonly decidedAt: IsoDateTime | null;
}

export interface Deduction {
  readonly category: DeductionCategory;
  readonly amount: Paise;
  readonly note: string | null;
}

export interface CaseDocument {
  readonly type: string;
  readonly stage: CaseStage;
  readonly state: DocumentState;
}

export interface CaseQuery {
  readonly raisedAt: IsoDateTime;
  readonly stage: CaseStage;
  readonly question: string;
  readonly owner: string;
  readonly answeredAt: IsoDateTime | null;
}

export interface CasePayment {
  readonly receivedOn: IsoDate;
  /** Money that reached the bank. */
  readonly amount: Paise;
  /** Tax the payer deducted before paying. It counts towards the approved amount. */
  readonly taxDeductedAtSource: Paise;
  readonly bankReference: string;
}

export interface InsuranceCase {
  readonly id: string;
  readonly isSynthetic: true;
  readonly patientIdentifier: string;
  readonly patientDisplayName: string;
  readonly visitReference: string | null;
  readonly claimRoute: ClaimRoute;
  readonly admissionType: AdmissionType;
  readonly payerName: string;
  readonly tpaName: string | null;
  readonly policyNumber: string;
  readonly payerReference: string | null;
  readonly invoiceReference: string | null;
  readonly admittedAt: IsoDateTime;
  readonly dischargedAt: IsoDateTime | null;
  readonly status: CaseStatus;
  readonly statusRecordedAt: IsoDateTime;
  readonly statusRecordedBy: string;
  readonly amounts: CaseAmounts;
  readonly authorisations: readonly Authorisation[];
  readonly deductions: readonly Deduction[];
  readonly documents: readonly CaseDocument[];
  readonly queries: readonly CaseQuery[];
  readonly payments: readonly CasePayment[];
  readonly denialReason: string | null;
  readonly closureNote: string | null;
}

export type CaseListResult =
  | { ok: true; cases: InsuranceCase[] }
  | { ok: false; errors: string[] };
