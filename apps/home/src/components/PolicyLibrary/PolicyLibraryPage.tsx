import { useTranslation } from '@bahmni/services';
import { Link } from 'react-router-dom';
import { HomePageHeader } from '../HomePageHeader';
import styles from './PolicyLibrary.module.scss';

export const PolicyLibraryPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <HomePageHeader />
      <main className={styles.page}>
        <Link to="/home/">{t('HOME_LABEL')}</Link>
        <h1>{t('POLICY_LIBRARY_TITLE')}</h1>
        <p>{t('POLICY_LIBRARY_INFO_NOTE')}</p>
      </main>
    </>
  );
};
