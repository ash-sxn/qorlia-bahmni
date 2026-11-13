import { hasPrivilege } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BAHMNI_PATIENT_DOCUMENTS_NAMESPACE } from '../constants/app';

export const DocumentAccess = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation(BAHMNI_PATIENT_DOCUMENTS_NAMESPACE);
  const { userPrivileges, isLoading } = useUserPrivilege();
  if (isLoading || userPrivileges === null)
    return <p role="status">{t('PATIENT_DOCUMENTS_ACCESS_LOADING')}</p>;
  if (!hasPrivilege(userPrivileges, 'app:document-upload'))
    return <p role="alert">{t('PATIENT_DOCUMENTS_NO_ACCESS')}</p>;
  return children;
};
