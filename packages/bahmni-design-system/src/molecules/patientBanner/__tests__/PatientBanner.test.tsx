import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { PatientBanner } from '../PatientBanner';

expect.extend(toHaveNoViolations);

describe('PatientBanner', () => {
  it('shows who the patient is, their allergies and the open visit', async () => {
    const { container } = render(
      <PatientBanner
        name="Sunita Verma"
        details={['52 years, F', 'ABC200049', null]}
        allergies={{ label: 'Allergies', items: ['Penicillin', 'Sulfa'] }}
        visit="OPD visit open"
        actions={<button type="button">Start consultation</button>}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sunita Verma' }),
    ).toBeInTheDocument();
    expect(screen.getByText('52 years, F · ABC200049')).toBeInTheDocument();
    expect(
      screen.getByText('Allergies: Penicillin, Sulfa'),
    ).toBeInTheDocument();
    expect(screen.getByText('OPD visit open')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start consultation' }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('always says something about allergies', () => {
    const { rerender } = render(
      <PatientBanner
        name="A"
        details={[]}
        allergies={{ label: 'No allergies recorded', items: [] }}
      />,
    );
    expect(screen.getByText('No allergies recorded')).toBeInTheDocument();

    rerender(
      <PatientBanner
        name="A"
        details={[]}
        allergies={{ message: 'Allergies could not be loaded.' }}
      />,
    );
    expect(
      screen.getByText('Allergies could not be loaded.'),
    ).toBeInTheDocument();
  });

  it('links the name back to the chart in its compact form', () => {
    render(
      <PatientBanner
        compact
        headingLevel={2}
        name="Sunita Verma"
        nameHref="/chart"
        details={[]}
        allergies={{ label: 'No allergies recorded', items: [] }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Sunita Verma' })).toHaveAttribute(
      'href',
      '/chart',
    );
  });
});
