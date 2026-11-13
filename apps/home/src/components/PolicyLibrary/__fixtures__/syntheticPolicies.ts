import { PolicyEntry } from '../types';

/**
 * SYNTHETIC examples for tests and local development only.
 * Not real guidance. Never copy these into the publishable catalogue.
 */
export const SYNTHETIC_APPROVED_HOSTS: readonly string[] = ['www.example.org'];

export const syntheticPolicies: PolicyEntry[] = [
  {
    id: 'synthetic-mp-digital-health',
    title: 'Synthetic example: MP digital health record guidance',
    authority: 'Synthetic example authority',
    jurisdiction: 'madhya_pradesh',
    category: 'digital_health',
    summary: 'Synthetic test text. Not real guidance.',
    applicabilityNote: null,
    sourceUrl: 'https://www.example.org/synthetic/mp-digital-health',
    publishedOn: '2026-03-12',
    effectiveOn: null,
    sourceCheckedOn: '2026-10-01',
    reviewStatus: 'reviewed',
    reviewedOn: '2026-10-02',
    reviewDueOn: '2027-04-02',
    reviewer: 'Synthetic reviewer',
  },
  {
    id: 'synthetic-central-data-protection',
    title: 'Synthetic example: Central data protection notice',
    authority: 'Synthetic example authority',
    jurisdiction: 'central',
    category: 'data_protection',
    summary: 'Synthetic test text. Not real guidance.',
    applicabilityNote: 'Synthetic scope note.',
    sourceUrl: 'https://www.example.org/synthetic/central-data-protection',
    publishedOn: '2025-11-20',
    effectiveOn: '2026-01-01',
    sourceCheckedOn: '2025-12-01',
    reviewStatus: 'reviewed',
    reviewedOn: '2025-12-02',
    // In the past, so the page shows the "review due" warning.
    reviewDueOn: '2026-06-02',
    reviewer: 'Synthetic reviewer',
  },
  {
    id: 'synthetic-mp-scheme-draft',
    title: 'Synthetic example: MP scheme draft entry',
    authority: 'Synthetic example authority',
    jurisdiction: 'madhya_pradesh',
    category: 'government_schemes',
    summary: 'Synthetic test text. Not real guidance.',
    applicabilityNote: null,
    sourceUrl: 'https://www.example.org/synthetic/mp-scheme',
    // Missing date: shows "Not provided" and sorts last.
    publishedOn: null,
    effectiveOn: null,
    sourceCheckedOn: null,
    // Hidden by default; shown only when drafts are explicitly included.
    reviewStatus: 'draft',
    reviewedOn: null,
    reviewDueOn: null,
    reviewer: null,
  },
];
