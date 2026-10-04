import type { Bundle, Resource } from 'fhir/r4';
import { get } from './api';

const UNSUPPORTED_SEARCH_MESSAGE =
  'Invalid input parameters. Please check your request and try again.';

/** Use patient-only search when an older FHIR server rejects newer filters. */
export async function getCompatiblePatientBundle<T extends Resource>(
  preferredUrl: string,
  patientOnlyUrl: string,
  matches: (resource: T) => boolean,
): Promise<{ bundle: Bundle<T>; usedFallback: boolean }> {
  try {
    return { bundle: await get<Bundle<T>>(preferredUrl), usedFallback: false };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== UNSUPPORTED_SEARCH_MESSAGE
    ) {
      throw error;
    }
  }

  const expectedPath = new URL(patientOnlyUrl, 'http://localhost').pathname;
  const visited = new Set<string>();
  const entries: NonNullable<Bundle<T>['entry']> = [];
  let nextUrl: string | undefined = patientOnlyUrl;
  let firstBundle: Bundle<T> | undefined;

  while (nextUrl) {
    const parsed: URL = new URL(nextUrl, 'http://localhost');
    const path: string = parsed.pathname + parsed.search;
    if (parsed.pathname !== expectedPath || visited.has(path)) {
      throw new Error('Invalid FHIR pagination link');
    }
    visited.add(path);

    const bundle: Bundle<T> = await get<Bundle<T>>(path);
    firstBundle ??= bundle;
    entries.push(...(bundle.entry ?? []));
    nextUrl = bundle.link?.find((link) => link.relation === 'next')?.url;
  }

  if (firstBundle?.total !== undefined && entries.length < firstBundle.total) {
    throw new Error('FHIR search returned an incomplete result');
  }

  const filtered = entries.filter(
    (entry) => entry.resource && matches(entry.resource as T),
  );
  return {
    bundle: {
      ...(firstBundle as Bundle<T>),
      entry: filtered,
      total: filtered.length,
      link: undefined,
    },
    usedFallback: true,
  };
}
