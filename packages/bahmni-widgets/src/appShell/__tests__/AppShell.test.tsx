import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../AppShell';
import { useShellNavigation } from '../useShellNavigation';

jest.mock('../useShellNavigation', () => ({ useShellNavigation: jest.fn() }));
jest.mock('../../location/LocationSelector', () => ({
  LocationSelector: () => <div>OPD-1</div>,
}));
jest.mock('../../userGlobalAction/UserGlobalAction', () => ({
  UserGlobalAction: () => <div>Hi, dr_neha</div>,
}));

const item = (id: string, label: string, group: string, href: string) => ({
  id,
  label,
  group,
  href,
  icon: 'fa-circle',
  order: 0,
});

describe('AppShell', () => {
  beforeEach(() => {
    (useShellNavigation as jest.Mock).mockReturnValue({
      items: [
        item('qorlia.today', 'Today', 'work', '/bahmni-v2/home'),
        item(
          'qorlia.patient-record',
          'Patients',
          'work',
          '/bahmni-v2/home/records',
        ),
        item(
          'qorlia.billing',
          'Billing',
          'business',
          '/bahmni-v2/home/billing',
        ),
        item(
          'bahmni.atomfeed.console',
          'Sync console',
          'admin',
          '/atomfeed-console',
        ),
      ],
      loading: false,
      privilegeNames: [],
    });
  });

  it('frames the page with the menu of this user’s work', () => {
    render(
      <AppShell activeNavId="qorlia.patient-record">
        <main>Page</main>
      </AppShell>,
    );

    const menu = within(screen.getByRole('navigation', { name: 'Main menu' }));
    expect(menu.getByRole('link', { name: 'Patients' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      menu.getByRole('heading', { name: 'Money and management' }),
    ).toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'Sync console' })).toBeNull();
    expect(screen.getByText('Page')).toBeInTheDocument();
  });

  it('keeps technical tools folded under settings and admin', async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <main>Page</main>
      </AppShell>,
    );

    await user.click(
      screen.getByRole('button', { name: /Settings and admin/ }),
    );
    expect(screen.getByRole('link', { name: 'Sync console' })).toHaveAttribute(
      'href',
      '/atomfeed-console',
    );
  });

  it('searches for a patient from the top bar', async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();
    render(
      <AppShell onSearch={onSearch}>
        <main>Page</main>
      </AppShell>,
    );

    await user.type(screen.getByLabelText('Find a patient'), 'Sunita{Enter}');
    expect(onSearch).toHaveBeenCalledWith('Sunita');
  });
});
