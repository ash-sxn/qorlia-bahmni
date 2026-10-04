import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  getAvailableLocations,
  getCurrentProvider,
  getCurrentUser,
  getUserLoginLocation,
  setCookie,
  updateSessionLocation,
} from '@bahmni/services';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../LoginPage';

jest.mock('@bahmni/design-system', () => ({
  getHospitalBranding: () => ({ name: 'Qorlia' }),
}));

jest.mock('@bahmni/services', () => ({
  BAHMNI_USER_COOKIE_NAME: 'bahmni.user',
  BAHMNI_USER_LOCATION_COOKIE: 'bahmni.user.location',
  getAvailableLocations: jest.fn(),
  getCurrentProvider: jest.fn(),
  getCurrentUser: jest.fn(),
  getUserLoginLocation: jest.fn(),
  setCookie: jest.fn(),
  updateSessionLocation: jest.fn(),
}));

const mockedFetch = jest.fn();

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home/" element={<h1>React home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockedFetch;
  });

  it('shows the Qorlia form and does not store a username after rejected credentials', async () => {
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false }),
      })
      .mockResolvedValueOnce({ status: 401, ok: false });

    renderLogin();
    fireEvent.change(await screen.findByLabelText('Username'), {
      target: { value: 'demo' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'incorrect' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The sign-in details were not accepted.',
    );
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('sets the server location before opening the React home', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: true, user: { username: 'demo' } }),
    });
    (getCurrentUser as jest.Mock).mockResolvedValue({ uuid: 'user-1' });
    (getCurrentProvider as jest.Mock).mockResolvedValue({ attributes: [] });
    (getAvailableLocations as jest.Mock).mockResolvedValue([
      { name: 'OPD-1', uuid: 'location-1' },
    ]);
    (getUserLoginLocation as jest.Mock).mockImplementation(() => {
      throw new Error('First login');
    });
    (updateSessionLocation as jest.Mock).mockResolvedValue(undefined);

    renderLogin();
    expect(
      await screen.findByRole('combobox', { name: 'Login location' }),
    ).toHaveValue('location-1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue to workspace' }),
    );

    await waitFor(() => {
      expect(updateSessionLocation).toHaveBeenCalledWith('location-1');
      expect(
        screen.getByRole('heading', { name: 'React home' }),
      ).toBeInTheDocument();
    });
    expect(setCookie).toHaveBeenCalledWith(
      'bahmni.user.location',
      encodeURIComponent(JSON.stringify({ name: 'OPD-1', uuid: 'location-1' })),
    );
  });
});
