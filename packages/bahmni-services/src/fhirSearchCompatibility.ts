import type { Bundle, Resource } from 'fhir/r4';
import { get } from './api';

const UNSUPPORTED_SEARCH_MESSAGE =
  'Invalid input parameters. Please check your request and try again.';

/** Use a compatible search when an older FHIR server rejects newer filters. */
export async function getCompatiblePatientBundle<T extends Resource>(
  preferredUrl: string,
  fallbackUrl: string,
  matches: (resource: T) => boolean,
  allPreferredPages = false,
): Promise<{ bundle: Bundle<T>; usedFallback: boolean }> {
  let preferredBundle: Bundle<T> | undefined;
  try {
    preferredBundle = await get<Bundle<T>>(preferredUrl);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== UNSUPPORTED_SEARCH_MESSAGE
    ) {
      throw error;
    }
  }

  if (preferredBundle && !allPreferredPages) {
    return { bundle: preferredBundle, usedFallback: false };
  }

  const initialUrl = preferredBundle ? preferredUrl : fallbackUrl;
  const complete = await getAllFHIRSearchPages<T>(initialUrl, preferredBundle);
  const filtered =
    complete.entry?.filter(
      (entry) => entry.resource && matches(entry.resource as T),
    ) ?? [];
  return {
    bundle: { ...complete, entry: filtered, total: filtered.length },
    usedFallback: !preferredBundle,
  };
}

/** Collect a complete search through the local API, never an upstream origin. */
export async function getAllFHIRSearchPages<T extends Resource>(
  initialUrl: string,
  initialBundle?: Bundle<T>,
): Promise<Bundle<T>> {
  const expectedPath = new URL(initialUrl, 'http://localhost').pathname;
  const resourcePath = expectedPath.replace(/\/\$[^/]+$/, '');
  const searchRoot = resourcePath.slice(0, resourcePath.lastIndexOf('/'));
  const visited = new Set<string>();
  const entries: NonNullable<Bundle<T>['entry']> = [];
  let nextUrl: string | undefined = initialUrl;
  let firstBundle: Bundle<T> | undefined;

  while (nextUrl) {
    const parsed: URL = new URL(nextUrl, 'http://localhost');
    const path: string = parsed.pathname + parsed.search;
    // HAPI's next link can target the FHIR root with a server search cursor.
    const isSearchCursor =
      (parsed.pathname === searchRoot ||
        parsed.pathname === `${searchRoot}/`) &&
      !!parsed.searchParams.get('_getpages');
    if (
      (parsed.pathname !== expectedPath && !isSearchCursor) ||
      visited.has(path)
    ) {
      throw new Error('Invalid FHIR pagination link');
    }
    visited.add(path);

    const bundle: Bundle<T> =
      !firstBundle && initialBundle
        ? initialBundle
        : await get<Bundle<T>>(path);
    firstBundle ??= bundle;
    entries.push(...(bundle.entry ?? []));
    nextUrl = bundle.link?.find((link) => link.relation === 'next')?.url;
  }

  if (firstBundle?.total !== undefined && entries.length < firstBundle.total) {
    throw new Error('FHIR search returned an incomplete result');
  }

  return {
    ...(firstBundle as Bundle<T>),
    entry: entries,
    total: entries.length,
    link: undefined,
  };
}
