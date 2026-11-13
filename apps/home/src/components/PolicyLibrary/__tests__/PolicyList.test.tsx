import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { syntheticPolicies } from '../__fixtures__/syntheticPolicies';
import { PolicyList } from '../PolicyList';
import { PolicyEntry } from '../types';

const renderList = (policies: PolicyEntry[] = syntheticPolicies) =>
  render(
    <MemoryRouter>
      <PolicyList policies={policies} />
    </MemoryRouter>,
  );

describe('PolicyList', () => {
  it('shows one card per policy in the given order', () => {
    renderList();

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(
      within(cards[0]).getByRole('heading', {
        name: 'Synthetic example: MP digital health record guidance',
      }),
    ).toBeInTheDocument();
  });

  it('links each title to its detail page', () => {
    renderList();

    expect(
      screen.getByRole('link', {
        name: 'Synthetic example: Central data protection notice',
      }),
    ).toHaveAttribute(
      'href',
      '/home/policies/synthetic-central-data-protection',
    );
  });

  it('shows the labels, the review status as text and the published date', () => {
    renderList([syntheticPolicies[0]]);

    const card = screen.getByRole('listitem');
    expect(within(card).getByText('Madhya Pradesh')).toBeInTheDocument();
    expect(within(card).getByText('Digital health')).toBeInTheDocument();
    expect(within(card).getByText('Reviewed')).toBeInTheDocument();
    expect(
      within(card).getByText('Synthetic example authority'),
    ).toBeInTheDocument();
    expect(
      within(card).getByText('Published: Mar 12, 2026'),
    ).toBeInTheDocument();
  });

  it('says "Not provided" when the published date is missing', () => {
    renderList([syntheticPolicies[2]]);

    expect(screen.getByText('Published: Not provided')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('shows the summary as plain text, never as markup', () => {
    renderList([{ ...syntheticPolicies[0], summary: '<b>Not bold</b>' }]);

    expect(screen.getByText('<b>Not bold</b>')).toBeInTheDocument();
  });
});
