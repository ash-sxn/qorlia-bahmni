import {
  ArrowRight,
  ClickableTile,
  Icon,
  ICON_SIZE,
} from '@bahmni/design-system';
import { useTranslation } from '@bahmni/services';
import React from 'react';
import styles from './styles/AppTile.module.scss';

interface AppTileProps {
  id: string;
  label: string;
  icon: string;
  url: string;
}

export const AppTile: React.FC<AppTileProps> = ({ id, label, icon, url }) => {
  const { t } = useTranslation();
  const translatedLabel = t(label);

  if (!url) {
    return (
      <div
        className={`${styles.tile} ${styles.unavailable}`}
        data-testid={`app-tile-${id}`}
      >
        <h2 className={styles.label}>{translatedLabel}</h2>
        <span className={styles.pending}>In progress</span>
      </div>
    );
  }

  return (
    <ClickableTile
      href={url}
      className={styles.tile}
      aria-label={translatedLabel}
      testId={`app-tile-${id}`}
    >
      <h2 className={styles.label} aria-hidden="true">
        {translatedLabel}
      </h2>
      <div className={styles.bottom}>
        <Icon name={icon} id={id} size={ICON_SIZE.X2} aria-hidden="true" />
        <ArrowRight size={20} aria-hidden="true" />
      </div>
    </ClickableTile>
  );
};
