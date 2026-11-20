import { render, screen } from '@testing-library/react';
import { ActionBar } from '../ActionBar';

describe('ActionBar', () => {
  it('says where the work stands next to the actions that finish it', () => {
    render(
      <ActionBar status="Draft, not saved" tone="draft" ariaLabel="Save">
        <button type="button">Save to record</button>
      </ActionBar>,
    );

    expect(screen.getByRole('region', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Draft, not saved');
    expect(
      screen.getByRole('button', { name: 'Save to record' }),
    ).toBeInTheDocument();
  });
});
