import { get } from '../api';
import { OPENMRS_REST_V1 } from '../constants/app';
import { APP_PROPERTY_URL, AUDIT_LOG_APP_PROPERTY } from './constants';

// The API returns the raw value directly, not wrapped in an object
type AppPropertyResponse = string | boolean | number;

// Cache for app properties
const appPropertyCache = new Map<string, string | null>();

export const getAppSetting = async (
  module: string,
  property: string,
): Promise<string | null> => {
  try {
    const settings = await get<{ property: string; value: string }[]>(
      `${OPENMRS_REST_V1}/bahmni/app/setting?module=${encodeURIComponent(module)}`,
    );
    return (
      settings.find((setting) => setting.property === property)?.value ?? null
    );
  } catch (error) {
    // Older Bahmni servers expose these settings as global properties.
    if ((error as { status?: number })?.status !== 404) throw error;
    return getAppProperty(property);
  }
};

/**
 * Get app property value from OpenMRS
 * @param property - The app property name
 * @returns Promise<string | null>
 */
/**
 * Don't use `getAppProperty` directly in components,
 * use property specific accessors instead
 * eg.,isAuditLogEnabled
 */
export const getAppProperty = async (
  property: string,
): Promise<string | null> => {
  // try {
  if (appPropertyCache.has(property)) {
    return appPropertyCache.get(property) ?? null;
  }
  const response = await get<AppPropertyResponse>(APP_PROPERTY_URL(property));

  // The API returns the raw value directly, not wrapped in an object
  const value = response ? String(response) : null;
  appPropertyCache.set(property, value);
  return value;
  //  TODO: handle specific error cases when fetching app property fails
  // } catch (error) {
  //   // eslint-disable-next-line no-console
  //   console.error(
  //     i18next.t('APP_PROPERTY_FETCH_FAILED', {
  //       property,
  //     }),
  //     error,
  //   );
  //   return null;
  // }
};
/**
 * Check if audit logging is enabled
 * @returns Promise<boolean>
 */
export const isAuditLogEnabled = async (): Promise<boolean> => {
  // try {
  const value = await getAppProperty(AUDIT_LOG_APP_PROPERTY);
  return value === 'true';
};
