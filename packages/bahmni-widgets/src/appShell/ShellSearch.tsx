import { Icon, ICON_SIZE } from '@bahmni/design-system';
import React, { FormEvent, useId, useState } from 'react';
import styles from './AppShell.module.scss';

interface ShellSearchProps {
  label: (key: string, fallback: string) => string;
  onSearch: (query: string) => void;
}

/**
 * Patient search in the top bar. It keeps its own text, so typing does not redraw
 * the header (Carbon rebuilds the header's contents whenever it redraws).
 */
export const ShellSearch: React.FC<ShellSearchProps> = ({
  label,
  onSearch,
}) => {
  const inputId = `qorlia-search-${useId().replace(/:/g, '')}`;
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
