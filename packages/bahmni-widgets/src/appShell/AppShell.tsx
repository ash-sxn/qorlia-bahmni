import { Header, Icon, ICON_SIZE } from '@bahmni/design-system';
import { type Module, useTranslation } from '@bahmni/services';
import React, { FormEvent, ReactNode, useEffect, useId, useState } from 'react';
import { LocationSelector } from '../location/LocationSelector';
import { UserGlobalAction } from '../userGlobalAction/UserGlobalAction';
import styles from './AppShell.module.scss';
import {
  activeItemId,
  NAV_GROUPS,
  NavGroup,
  PATIENTS_ID,
  ShellNavItem,
} from './navigation';
import { useShellNavigation } from './useShellNavigation';

export interface AppShellProps {
  children: ReactNode;
  /** Which side-menu item is current; worked out from the address when left out. */
  activeNavId?: string;
  /** Qorlia pages a host app adds, such as ones that only show once they have content. */
  extraModules?: Module[];
  /** Review builds point unfinished modules at the new interface. */
  reviewUrls?: Record<string, string>;
  /** Hides the side menu, for print-first or full-width work screens. */
  focused?: boolean;
  /** Opens patient search; by default the records page with the search filled in. */
  onSearch?: (query: string) => void;
}

const GROUP_LABELS: Record<NavGroup, [string, string]> = {
  work: ['SHELL_GROUP_WORK', 'Daily work'],
  hospital: ['SHELL_GROUP_HOSPITAL', 'Hospital'],
  business: ['SHELL_GROUP_BUSINESS', 'Money and management'],
  admin: ['SHELL_GROUP_ADMIN', 'Settings and admin'],
};

const RECORDS_PATH = '/bahmni-v2/home/records';

interface ShellSearchProps {
  inputId: string;
  label: (key: string, fallback: string) => string;
  onSearch: (query: string) => void;
}

/**
 * Patient search in the top bar. It keeps its own text, so typing does not redraw
 * the header (Carbon rebuilds the header's contents whenever it redraws).
 */
const ShellSearch: React.FC<ShellSearchProps> = ({
  inputId,
  label,
  onSearch,
}) => {
  const [query, setQuery] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (text) onSearch(text);
  };
  return (
    <form role="search" className={styles.search} onSubmit={submit}>
      <label htmlFor={inputId} className={styles.visuallyHidden}>
        {label('SHELL_SEARCH_LABEL', 'Find a patient')}
      </label>
      <span aria-hidden="true" className={styles.icon}>
        <Icon
          name="fa-magnifying-glass"
          id="shell-search-icon"
          size={ICON_SIZE.SM}
        />
      </span>
      <input
        id={inputId}
        type="search"
        value={query}
        placeholder={label(
          'SHELL_SEARCH_PLACEHOLDER',
          'Find a patient by name or ID',
        )}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button type="submit" className={styles.visuallyHidden}>
        {label('SHELL_SEARCH_SUBMIT', 'Search')}
      </button>
    </form>
  );
};

/**
 * The frame around every Qorlia screen: the top bar with patient search, location
 * and the user, and a side menu of the work this user does. On narrow screens the
 * menu folds away behind the menu button.
 */
export const AppShell: React.FC<AppShellProps> = ({
  children,
  activeNavId,
  extraModules,
  reviewUrls,
  focused = false,
  onSearch = (text: string) =>
    window.location.assign(`${RECORDS_PATH}?q=${encodeURIComponent(text)}`),
}) => {
  const { t } = useTranslation();
  const label = (key: string, fallback: string) =>
    t(key, { defaultValue: fallback });
  const navId = useId().replace(/:/g, '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const { items } = useShellNavigation(extraModules, reviewUrls);
  const canSearch = items.some((item) => item.id === PATIENTS_ID);
  const current =
    activeNavId ??
    activeItemId(
      items,
      typeof window === 'undefined' ? '' : window.location.pathname,
    );

  useEffect(() => {
    if (items.some((item) => item.group === 'admin' && item.id === current)) {
      setAdminOpen(true);
    }
  }, [items, current]);

  const renderItem = (item: ShellNavItem) => (
    <li key={item.id}>
      <a
        href={item.href}
        className={`${styles.navLink} ${item.id === current ? styles.current : ''}`}
        aria-current={item.id === current ? 'page' : undefined}
        data-testid={`shell-nav-${item.id}`}
      >
        <span aria-hidden="true" className={styles.icon}>
          <Icon
            name={item.icon}
            id={`shell-icon-${item.id}`}
            size={ICON_SIZE.LG}
            fixedWidth
          />
        </span>
        <span>{item.label}</span>
      </a>
    </li>
  );

  const renderGroup = (group: NavGroup) => {
    const groupItems = items.filter((item) => item.group === group);
    if (groupItems.length === 0) return null;
    const [key, fallback] = GROUP_LABELS[group];
    if (group === 'admin') {
      return (
        <div key={group} className={styles.group}>
          <button
            type="button"
            className={styles.groupToggle}
            aria-expanded={adminOpen}
            aria-controls={`${navId}-admin`}
            onClick={() => setAdminOpen(!adminOpen)}
          >
            <Icon
              name="fa-gear"
              id="shell-icon-admin"
              size={ICON_SIZE.LG}
              fixedWidth
            />
            <span className={styles.groupLabel}>{label(key, fallback)}</span>
            <span aria-hidden="true" className={styles.icon}>
              <Icon
                name={adminOpen ? 'fa-chevron-up' : 'fa-chevron-down'}
                id="shell-icon-admin-toggle"
                size={ICON_SIZE.SM}
              />
            </span>
          </button>
          {adminOpen && (
            <ul id={`${navId}-admin`} className={styles.list}>
              {groupItems.map(renderItem)}
            </ul>
          )}
        </div>
      );
    }
    return (
      <div key={group} className={styles.group}>
        {group !== 'work' && (
          <h2 className={styles.groupTitle}>{label(key, fallback)}</h2>
        )}
        <ul className={styles.list} aria-label={label(key, fallback)}>
          {groupItems.map(renderItem)}
        </ul>
      </div>
    );
  };

  return (
    <div className={styles.shell} data-testid="app-shell">
      <a className={styles.skip} href="#qorlia-main">
        {label('SHELL_SKIP_TO_CONTENT', 'Skip to the page')}
      </a>
      <Header
        ariaLabel="Qorlia"
        menuToggle={
          focused
            ? undefined
            : {
                expanded: menuOpen,
                onToggle: () => setMenuOpen(!menuOpen),
                controls: navId,
                openLabel: label('SHELL_OPEN_MENU', 'Open the menu'),
                closeLabel: label('SHELL_CLOSE_MENU', 'Close the menu'),
              }
        }
        globalFeatures={[
          canSearch ? (
            <ShellSearch
              key="search"
              inputId={`${navId}-search`}
              label={label}
              onSearch={onSearch}
            />
          ) : null,
          <div key="location" className={styles.location}>
            <LocationSelector />
          </div>,
        ].filter(Boolean)}
        userMenu={<UserGlobalAction />}
      />
      <div className={styles.body}>
        {!focused && (
          <nav
            id={navId}
            aria-label={label('SHELL_MENU', 'Main menu')}
            className={`${styles.nav} ${menuOpen ? styles.open : ''}`}
          >
            {NAV_GROUPS.map(renderGroup)}
          </nav>
        )}
        {menuOpen && !focused && (
          <button
            type="button"
            className={styles.scrim}
            aria-label={label('SHELL_CLOSE_MENU', 'Close the menu')}
            onClick={() => setMenuOpen(false)}
          />
        )}
        <div id="qorlia-main" className={styles.content} tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AppShell;
