import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PolicyLibraryPage } from '../PolicyLibraryPage';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <PolicyLibraryPage />
    </MemoryRouter>,
  );

describe('PolicyLibraryPage', () => {
  it('shows the heading and the information-only note', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Policy library' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Information only. Confirm current requirements with the original authority.',
      ),
    ).toBeInTheDocument();
  });
});
