import { useShellNavigation } from '@bahmni/widgets';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '../HomePage';

jest.mock('../../Today', () => ({
  TodayPage: () => <div data-testid="today-page" />,
}));

jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useShellNavigation: jest.fn(),
}));

const renderAt = (privilegeNames: string[], loading = false) => {
  (useShellNavigation as jest.Mock).mockReturnValue({
    items: [],
    loading,
    privilegeNames,
  });
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/wards" element={<p>Wards page</p>} />
        <Route path="/overview" element={<p>Overview page</p>} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('HomePage', () => {
  it('opens on the Today page for doctors and the front desk', () => {
    renderAt(['app:clinical', 'app:clinical:consultationTab']);
    expect(screen.getByTestId('today-page')).toBeInTheDocument();
  });

  it('sends ward staff to the wards', () => {
    renderAt(['app:adt']);
    expect(screen.getByText('Wards page')).toBeInTheDocument();
  });

  it('sends someone who only reads reports to the overview', () => {
    renderAt(['app:reports']);
    expect(screen.getByText('Overview page')).toBeInTheDocument();
  });

  it('shows nothing until the permissions have loaded', () => {
    renderAt([], true);
    expect(screen.queryByTestId('today-page')).not.toBeInTheDocument();
  });
});
