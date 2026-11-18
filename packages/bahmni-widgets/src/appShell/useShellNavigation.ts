import {
  type Module,
  filterByOnlineStatus,
  filterByPrivilege,
  getVisibleModules,
  useTranslation,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useUserPrivilege } from '../userPrivileges/useUserPrivilege';
import { CORE_MODULES, ShellNavItem, toNavItems } from './navigation';

const HOME_EXTENSION_POINT = 'org.bahmni.home.dashboard';

/**
 * The side menu for this user: the deployment's configured modules plus Qorlia's
 * own pages, each shown only with its privilege.
 */
export const useShellNavigation = (
  extraModules: Module[] = [],
  reviewUrls?: Record<string, string>,
) => {
  const { t } = useTranslation();
  const { userPrivileges, isLoading, error } = useUserPrivilege();
  const privilegeNames = userPrivileges?.map((p) => p.name) ?? null;

  const configured = useQuery({
    queryKey: ['module-tiles', 'home', HOME_EXTENSION_POINT, privilegeNames],
    queryFn: () =>
      getVisibleModules(HOME_EXTENSION_POINT, privilegeNames!, 'home'),
    enabled: !isLoading && error === null && privilegeNames !== null,
    staleTime: 5 * 60_000,
  });

  const items = useMemo<ShellNavItem[]>(() => {
    if (privilegeNames === null) return [];
    const own = filterByOnlineStatus(
      filterByPrivilege([...CORE_MODULES, ...extraModules], privilegeNames),
    );
    return toNavItems(
      [...own, ...(configured.data ?? [])],
      (key, fallback) => t(key, { defaultValue: fallback }),
      reviewUrls,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured.data, privilegeNames?.join(','), extraModules, reviewUrls, t]);

  return {
    items,
    loading: isLoading || configured.isLoading,
    privilegeNames: privilegeNames ?? [],
  };
};
