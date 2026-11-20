import React, { ReactNode } from 'react';
import styles from './ActionBar.module.scss';

export interface ActionBarProps {
  /** Says what is saved and what is not, in words. */
  status?: ReactNode;
  tone?: 'draft' | 'saved' | 'neutral';
  /** Buttons, least important first; the main action last, on the right. */
  children: ReactNode;
  ariaLabel?: string;
}

/**
 * The bar at the bottom of a work screen: where the work stands, and the actions
 * that finish it, always in the same place.
 */
export const ActionBar: React.FC<ActionBarProps> = ({
  status,
  tone = 'neutral',
  children,
  ariaLabel,
}) => (
  <div
    className={styles.bar}
    role="region"
    aria-label={ariaLabel}
    data-testid="action-bar"
  >
    {status && (
      <p className={`${styles.status} ${styles[tone]}`} role="status">
        {tone !== 'neutral' && (
          <span className={styles.dot} aria-hidden="true" />
        )}
        {status}
      </p>
    )}
    <div className={styles.actions}>{children}</div>
  </div>
);

export default ActionBar;
