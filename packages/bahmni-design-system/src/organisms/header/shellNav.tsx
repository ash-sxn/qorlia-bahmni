import React, { createContext, ReactNode, useState } from 'react';
import { Icon, ICON_SIZE } from '../../molecules/icon';
import styles from './styles/ShellNav.module.scss';

export type ShellNavGroup = 'work' | 'hospital' | 'business' | 'admin';
export const SHELL_NAV_GROUPS: ShellNavGroup[] = [
  'work',
  'hospital',
  'business',
  'admin',
];

export interface ShellNavLink {
  id: string;
  label: string;
  href: string;
  icon: string;
  group: ShellNavGroup;
}

/**
 * The Qorlia frame a Header draws when an app provides it: the side menu of the
 * user's work, and the top-bar controls every screen shares.
 */
export interface QorliaShellChrome {
  items: ShellNavLink[];
  currentId?: string;
  groupLabels: Record<ShellNavGroup, string>;
  labels: { menu: string; open: string; close: string };
  globalFeatures: ReactNode[];
  userMenu: ReactNode;
}

export const QorliaShellContext = createContext<QorliaShellChrome | null>(null);

const NavIcon = ({ name, id }: { name: string; id: string }) => (
  <span aria-hidden="true" className={styles.icon}>
    <Icon name={name} id={id} size={ICON_SIZE.LG} fixedWidth />
  </span>
);

interface ShellNavProps {
  chrome: QorliaShellChrome;
  id: string;
  open: boolean;
  onClose: () => void;
}

/**
 * The side menu: daily work first, then hospital modules, then money and
 * management; technical tools folded under settings and admin. Fixed beside the
 * page on wide screens, a drawer behind the menu button on narrow ones.
 */
export const ShellNav: React.FC<ShellNavProps> = ({
  chrome,
  id,
  open,
  onClose,
}) => {
  const adminCurrent = chrome.items.some(
    (item) => item.group === 'admin' && item.id === chrome.currentId,
  );
  const [adminOpen, setAdminOpen] = useState(adminCurrent);

  const renderItem = (item: ShellNavLink) => {
    const current = item.id === chrome.currentId;
    return (
      <li key={item.id}>
        <a
          href={item.href}
          className={`${styles.link} ${current ? styles.current : ''}`}
          aria-current={current ? 'page' : undefined}
          data-testid={`shell-nav-${item.id}`}
        >
          <NavIcon name={item.icon} id={`shell-icon-${item.id}`} />
          <span>{item.label}</span>
        </a>
      </li>
    );
  };

  const renderGroup = (group: ShellNavGroup) => {
    const items = chrome.items.filter((item) => item.group === group);
    if (items.length === 0) return null;
    const label = chrome.groupLabels[group];
    if (group === 'admin') {
      return (
        <div key={group} className={`${styles.group} ${styles.bottom}`}>
          <button
            type="button"
            className={styles.link}
            aria-expanded={adminOpen}
            aria-controls={`${id}-admin`}
            onClick={() => setAdminOpen(!adminOpen)}
          >
            <NavIcon name="fa-gear" id="shell-icon-admin" />
            <span className={styles.grow}>{label}</span>
            <span aria-hidden="true" className={styles.icon}>
              <Icon
                name={adminOpen ? 'fa-chevron-up' : 'fa-chevron-down'}
                id="shell-icon-admin-toggle"
                size={ICON_SIZE.SM}
              />
            </span>
          </button>
          {adminOpen && (
            <ul id={`${id}-admin`} className={styles.list}>
              {items.map(renderItem)}
            </ul>
          )}
        </div>
      );
    }
    return (
      <div key={group} className={styles.group}>
        {group !== 'work' && <h2 className={styles.groupTitle}>{label}</h2>}
        <ul className={styles.list} aria-label={label}>
          {items.map(renderItem)}
        </ul>
      </div>
    );
  };

  return (
    <>
      <nav
        id={id}
        aria-label={chrome.labels.menu}
        className={`${styles.nav} ${open ? styles.open : ''}`}
        data-testid="shell-nav"
      >
        {SHELL_NAV_GROUPS.map(renderGroup)}
      </nav>
      {open && (
        <button
          type="button"
          className={styles.scrim}
          aria-label={chrome.labels.close}
          onClick={onClose}
        />
      )}
    </>
  );
};
