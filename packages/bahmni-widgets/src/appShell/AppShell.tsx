import {
  Header,
  QorliaShellContext,
  type QorliaShellChrome,
} from '@bahmni/design-system';
import { type Module, useTranslation } from '@bahmni/services';
import React, { ReactNode, useContext, useMemo } from 'react';
import { LocationContext } from '../location/LocationContext';
import { LocationProvider } from '../location/LocationProvider';
import { LocationSelector } from '../location/LocationSelector';
import { UserGlobalAction } from '../userGlobalAction/UserGlobalAction';
import styles from './AppShell.module.scss';
import { activeItemId, PATIENTS_ID } from './navigation';
import { ShellSearch } from './ShellSearch';
import { useShellNavigation } from './useShellNavigation';

const RECORDS_PATH = '/bahmni-v2/home/records';

/** The location picker, with its own provider where the app has none. */
const ShellLocation: React.FC = () => {
  const outer = useContext(LocationContext);
  return outer ? (
    <LocationSelector />
  ) : (
    <LocationProvider>
      <LocationSelector />
    </LocationProvider>
  );
};

const searchRecords = (text: string) =>
  window.location.assign(`${RECORDS_PATH}?q=${encodeURIComponent(text)}`);

export interface ShellProviderProps {
  children: ReactNode;
  /** Which side-menu item is current; worked out from the address when left out. */
  activeNavId?: string;
  /** Qorlia pages a host app adds, such as ones that only show once they have content. */
  extraModules?: Module[];
  /** Review builds point unfinished modules at the new interface. */
  reviewUrls?: Record<string, string>;
  /** Opens patient search; by default the records page with the search filled in. */
  onSearch?: (query: string) => void;
}

/**
 * Gives every Header below it the Qorlia frame: the side menu of this user's work,
 * patient search, location and the user menu. Wrap each app's routes in it.
 */
export const ShellProvider: React.FC<ShellProviderProps> = ({
  children,
  activeNavId,
  extraModules,
  reviewUrls,
  onSearch = searchRecords,
}) => {
  const { t } = useTranslation();
  const { items } = useShellNavigation(extraModules, reviewUrls);
  const chrome = useMemo<QorliaShellChrome>(() => {
    const label = (key: string, fallback: string) =>
      t(key, { defaultValue: fallback });
    const canSearch = items.some((item) => item.id === PATIENTS_ID);
    return {
      items,
      currentId:
        activeNavId ??
        activeItemId(
          items,
          typeof window === 'undefined' ? '' : window.location.pathname,
        ),
      groupLabels: {
        work: label('SHELL_GROUP_WORK', 'Daily work'),
        hospital: label('SHELL_GROUP_HOSPITAL', 'Hospital'),
        business: label('SHELL_GROUP_BUSINESS', 'Money and management'),
        admin: label('SHELL_GROUP_ADMIN', 'Settings and admin'),
      },
      labels: {
        menu: label('SHELL_MENU', 'Main menu'),
        open: label('SHELL_OPEN_MENU', 'Open the menu'),
        close: label('SHELL_CLOSE_MENU', 'Close the menu'),
      },
      globalFeatures: [
        ...(canSearch
          ? [<ShellSearch key="search" label={label} onSearch={onSearch} />]
          : []),
        <div key="location" className={styles.location}>
          <ShellLocation />
        </div>,
      ],
      userMenu: <UserGlobalAction />,
    };
  }, [items, activeNavId, onSearch, t]);

  return (
    <QorliaShellContext.Provider value={chrome}>
      {children}
    </QorliaShellContext.Provider>
  );
};

export interface AppShellProps extends ShellProviderProps {
  /** Hides the side menu, for print-first or full-width work screens. */
  focused?: boolean;
}

/**
 * The frame around a Qorlia page that has no header of its own: the shared top bar
 * and side menu, and the page beside it.
 */
export const AppShell: React.FC<AppShellProps> = ({
  children,
  focused = false,
  ...provider
}) => {
  const { t } = useTranslation();
  const page = (
    <div className={styles.shell} data-testid="app-shell">
      <a className={styles.skip} href="#qorlia-main">
        {t('SHELL_SKIP_TO_CONTENT', { defaultValue: 'Skip to the page' })}
      </a>
      <Header ariaLabel="Qorlia" />
      <div id="qorlia-main" className={styles.content} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
  return focused ? page : <ShellProvider {...provider}>{page}</ShellProvider>;
};

export default AppShell;
