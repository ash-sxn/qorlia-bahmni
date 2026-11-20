import { useTranslation } from '@bahmni/services';
import styles from './styles/index.module.scss';

export type AppointmentView = 'day' | 'calendar' | 'week' | 'awaiting';

const BASE = '/bahmni-v2/appointments';

/** The same four views, in the same order, on every appointments page. */
export const AppointmentTabs = ({ current }: { current: AppointmentView }) => {
  const { t } = useTranslation();
  const views: { id: AppointmentView; href: string; label: string }[] = [
    { id: 'day', href: `${BASE}/`, label: t('APPOINTMENTS_DAY_LIST') },
    {
      id: 'calendar',
      href: `${BASE}/calendar`,
      label: t('APPOINTMENTS_CALENDAR'),
    },
    { id: 'week', href: `${BASE}/week`, label: t('APPOINTMENTS_SUMMARY') },
    {
      id: 'awaiting',
      href: `${BASE}/awaiting`,
      label: t('APPOINTMENTS_AWAITING'),
    },
  ];
  return (
    <nav className={styles.viewTabs} aria-label={t('APPOINTMENTS_VIEWS')}>
      {views.map((view) => (
        <a
          key={view.id}
          href={view.href}
          aria-current={view.id === current ? 'page' : undefined}
        >
          {view.label}
        </a>
      ))}
    </nav>
  );
};
