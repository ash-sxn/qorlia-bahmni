import { CatalogueResult, PolicyEntry } from './types';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isApprovedSourceUrl = (
  value: unknown,
  approvedHosts: readonly string[],
): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    approvedHosts.includes(url.hostname)
  );
};

export const validateCatalogue = (
  input: unknown,
  approvedHosts: readonly string[],
): CatalogueResult => {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['The catalogue must be a list of entries.'] };
  }

  const errors: string[] = [];
  const seenIds = new Set<string>();

  input.forEach((entry, index) => {
    const label = `Entry ${index + 1}`;

    if (!isRecord(entry)) {
      errors.push(`${label}: must be an object.`);
      return;
    }

    const { id } = entry;
    if (typeof id !== 'string' || !SLUG_PATTERN.test(id)) {
      errors.push(`${label}: id must be a lowercase slug (a-z, 0-9, -).`);
    } else if (seenIds.has(id)) {
      errors.push(`${label}: duplicate id "${id}".`);
    } else {
      seenIds.add(id);
    }

    if (!isApprovedSourceUrl(entry.sourceUrl, approvedHosts)) {
      errors.push(
        `${label}: sourceUrl must be an https link to an approved source host.`,
      );
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, entries: input as PolicyEntry[] };
};
