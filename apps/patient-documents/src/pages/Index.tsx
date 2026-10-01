import { Header } from '@bahmni/design-system';
import {
  BAHMNI_HOME_PATH,
  getEncounterTypeByName,
  getFormattedPatientById,
} from '@bahmni/services';
import {
  PatientDetails,
  UserGlobalAction,
  usePatientUUID,
} from '@bahmni/widgets';
import { useQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentsSection } from '../components/DocumentsSection';
import {
  BAHMNI_PATIENT_DOCUMENTS_NAMESPACE,
  BAHMNI_DOCUMENT_UPLOAD_SEARCH_BASE,
} from '../constants/app';
import { useDocumentUploadParams } from '../hooks/useDocumentUploadParams';
import styles from './styles/Index.module.scss';

export const IndexPage: React.FC = () => {
  const { t } = useTranslation(BAHMNI_PATIENT_DOCUMENTS_NAMESPACE);
  const patientUUID = usePatientUUID();
  const { encounterType, topLevelConcept, defaultOption } =
    useDocumentUploadParams();

  const { data: patient } = useQuery({
    queryKey: ['patient', patientUUID],
    queryFn: () => getFormattedPatientById(patientUUID!),
    enabled: !!patientUUID,
  });

  const encounter = useQuery({
    queryKey: ['encounterType', encounterType],
    queryFn: () => getEncounterTypeByName(encounterType!),
    enabled: !!encounterType,
  });
  const searchHref = useMemo(() => {
    const params = [];
    if (encounterType)
      params.push(`encounterType=${encodeURIComponent(encounterType)}`);
    if (topLevelConcept)
      params.push(`topLevelConcept=${encodeURIComponent(topLevelConcept)}`);
    if (defaultOption)
      params.push(`defaultOption=${encodeURIComponent(defaultOption)}`);
    return `${BAHMNI_DOCUMENT_UPLOAD_SEARCH_BASE}${params.length ? `?${params.join('&')}` : ''}`;
  }, [encounterType, topLevelConcept, defaultOption]);

  const breadcrumbItems = useMemo(
    () => [
      {
        id: 'home',
        label: t('PATIENT_DOCUMENTS_BREADCRUMB_HOME'),
        href: BAHMNI_HOME_PATH,
      },
      {
        id: 'search',
        label: t('PATIENT_DOCUMENTS_BREADCRUMB_SEARCH'),
        href: searchHref,
      },
      {
        id: 'current',
        label: patient?.fullName ?? t('PATIENT_DOCUMENTS_BREADCRUMB_CURRENT'),
        isCurrentPage: true,
      },
    ],
    [patient?.fullName, t, searchHref],
  );

  return (
    <>
      <Header
        breadcrumbItems={breadcrumbItems}
        userMenu={<UserGlobalAction />}
      />
      <main className={styles.page}>
        <section
          aria-label={t('PATIENT_DOCUMENTS_PATIENT_HEADER_LABEL')}
          className={styles.patientBanner}
        >
          <PatientDetails />
        </section>
        {!encounterType ? (
          <p role="alert">{t('PATIENT_DOCUMENTS_MISSING_TYPE')}</p>
        ) : encounter.isLoading ? (
          <p role="status">{t('PATIENT_DOCUMENTS_ACCESS_LOADING')}</p>
        ) : encounter.isError || !encounter.data ? (
          <p role="alert">{t('PATIENT_DOCUMENTS_TYPE_ERROR')}</p>
        ) : null}
        {patientUUID && encounter.data && (
          <DocumentsSection
            patientUuid={patientUUID}
            documentEncounterType={encounter.data}
            topLevelConcept={topLevelConcept}
            defaultOption={defaultOption}
            searchHref={searchHref}
          />
        )}
      </main>
    </>
  );
};
