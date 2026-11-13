import { BaseLayout, CodeSnippetSkeleton, Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  hasPrivilege,
  useTranslation,
  filterExtensionsByPrivileges,
  groupExtensionsByPoint,
  type SearchExtension,
} from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { Suspense, useMemo } from 'react';
import { useClinicalConfig } from '../../providers/clinicalConfig';
import ClinicalWorkspace from './ClinicalWorkspace';
import { EXTENSION_HANDLERS } from './constants';
import styles from './styles/index.module.scss';

const ClinicalList = () => {
  const { t } = useTranslation();
  const {
    clinicalConfig,
    isLoading: configLoading,
    error: configError,
  } = useClinicalConfig();
  const { userPrivileges, isLoading: privilegesLoading } = useUserPrivilege();

  const breadcrumbItems = useMemo(
    () => [
      { id: 'home', label: t('HOME_LABEL'), href: BAHMNI_HOME_PATH },
      { id: 'clinical', label: t('CLINICAL_LABEL'), isCurrentPage: true },
    ],
    [t],
  );

  const extensionsByPoint = useMemo(
    () => groupExtensionsByPoint(clinicalConfig?.extensions ?? []),
    [clinicalConfig],
  );

  const visibleHandlers = useMemo(
    () =>
      Array.from(extensionsByPoint.entries())
        .map(([pointId, extensions]) => ({
          pointId,
          Handler: EXTENSION_HANDLERS[pointId],
          filtered: filterExtensionsByPrivileges(
            extensions,
            userPrivileges,
          ).filter(
            (e): e is SearchExtension =>
              !!e.extensionParams && 'searchHandler' in e.extensionParams,
          ),
        }))
        .filter(({ Handler, filtered }) => !!Handler && filtered.length > 0),
    [extensionsByPoint, userPrivileges],
  );
  const showWorkspace =
    !!clinicalConfig &&
    !configLoading &&
    !configError &&
    !clinicalConfig?.extensions &&
    !privilegesLoading &&
    hasPrivilege(userPrivileges, 'app:clinical');

  return (
    <BaseLayout
      header={<Header breadcrumbItems={breadcrumbItems} />}
      main={
        <div
          id="clinical-list-page"
          data-testid="clinical-list-page-test-id"
          aria-label="Clinical List Page"
          className={showWorkspace ? styles.workspacePage : styles.page}
        >
          {visibleHandlers.length > 0 ? (
            visibleHandlers.map(({ pointId, Handler, filtered }) => (
              <div
                key={pointId}
                id={pointId}
                data-testid={`${pointId}-test-id`}
              >
                <Suspense
                  fallback={
                    <CodeSnippetSkeleton
                      type="multi"
                      className={styles.loading}
                    />
                  }
                >
                  <Handler extensions={filtered} />
                </Suspense>
              </div>
            ))
          ) : showWorkspace ? (
            <ClinicalWorkspace userPrivileges={userPrivileges} />
          ) : (
            <p
              id="no-extensions-configured"
              data-testid="no-extensions-configured-test-id"
              aria-label="No extensions configured"
              className={styles.message}
            >
              {t('NO_EXTENSIONS_CONFIGURED')}
            </p>
          )}
        </div>
      }
    />
  );
};

export default ClinicalList;
