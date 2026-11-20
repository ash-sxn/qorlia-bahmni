import React, { ReactNode, useId } from 'react';
import styles from './Panel.module.scss';

export interface PanelProps {
  title: ReactNode;
  /** A small uppercase caption for side summaries; a larger heading otherwise. */
  variant?: 'summary' | 'section';
  headingLevel?: 2 | 3;
  /** Controls shown on the right of the heading, such as a filter. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

/** A white card with a heading: the one container shape on every screen. */
export const Panel: React.FC<PanelProps> = ({
  title,
  variant = 'section',
  headingLevel = 2,
  aside,
  children,
  className,
  id,
}) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const generated = useId();
  const headingId = `${id ?? generated.replace(/:/g, '')}-heading`;
  return (
    <section
      className={[styles.panel, styles[variant], className]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={headingId}
      id={id}
    >
      <div className={styles.head}>
        <Heading id={headingId} className={styles.title}>
          {title}
        </Heading>
        {aside && <div className={styles.aside}>{aside}</div>}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
};

export default Panel;
