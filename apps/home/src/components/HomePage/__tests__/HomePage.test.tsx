import { render, screen } from '@testing-library/react';
import { HomePage } from '../HomePage';

jest.mock('../../Today', () => ({
  TodayPage: () => <div data-testid="today-page" />,
}));

describe('HomePage', () => {
  it('opens on the Today page', () => {
    render(<HomePage />);
    expect(screen.getByTestId('today-page')).toBeInTheDocument();
  });
});
