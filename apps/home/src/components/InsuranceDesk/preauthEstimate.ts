/** Cost heads a payer usually asks for on a cashless pre-authorisation request. */
export const COST_HEADS = [
  'room',
  'investigations',
  'icu',
  'theatre',
  'professional',
  'medicines',
  // Part C lists implants with medicines; payers ask for them on their own line.
  'implants',
  // An all-inclusive package rate, as PM-JAY and many TPAs use.
  'package',
  'other',
] as const;
export type CostHead = (typeof COST_HEADS)[number];

/** Papers the desk usually collects before sending a request. */
export const PREAUTH_DOCUMENTS = [
  'identity',
  'health_card',
  'admission_note',
  'reports',
  'past_papers',
] as const;
export type PreauthDocument = (typeof PREAUTH_DOCUMENTS)[number];

/**
 * Whole rupees from what someone typed: digits, with optional commas or spaces.
 * Empty text is 0. Anything else (decimals, minus signs, letters) is null, so a typing
 * mistake is shown as a mistake and never counted as an amount.
 */
export const parseRupees = (text: string): number | null => {
  const cleaned = text.replace(/[,\s]/g, '');
  if (cleaned === '') {
    return 0;
  }
  if (!/^\d{1,9}$/.test(cleaned)) {
    return null;
  }
  return Number(cleaned);
};

/** The total of all heads, or null while any head holds something that is not an amount. */
export const totalEstimate = (
  amounts: Readonly<Record<CostHead, string>>,
): number | null => {
  let total = 0;
  for (const head of COST_HEADS) {
    const rupees = parseRupees(amounts[head]);
    if (rupees === null) {
      return null;
    }
    total += rupees;
  }
  return total;
};

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Rupees with Indian digit grouping, for example ₹1,25,000. */
export const formatRupees = (amount: number): string => rupees.format(amount);
