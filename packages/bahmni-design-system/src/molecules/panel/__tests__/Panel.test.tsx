import { render, screen } from '@testing-library/react';
import { Panel } from '../Panel';

describe('Panel', () => {
  it('is a region named by its heading', () => {
    render(
      <Panel title="History" aside={<button type="button">Filter</button>}>
        <p>Entries</p>
      </Panel>,
    );

    const region = screen.getByRole('region', { name: 'History' });
    expect(region).toHaveTextContent('Entries');
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('uses a small caption for side summaries', () => {
    render(
      <Panel title="Problems" variant="summary" headingLevel={3}>
        <p>None</p>
      </Panel>,
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'Problems' }),
    ).toBeInTheDocument();
  });
});
