import {
  formatDateTime,
  get,
  getFormattedPatientById,
  getUserLoginLocation,
} from '@bahmni/services';
import { useActivePractitioner, useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  findFulfillmentEncounter,
  getFulfillmentForm,
  getFulfillmentOrders,
} from '../ordersApi';
import OrdersPage, {
  fetchOrderPatients,
  fulfillmentOrderType,
} from '../OrdersPage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  get: jest.fn(),
  getFormattedPatientById: jest.fn(),
  getUserLoginLocation: jest.fn(),
}));
jest.mock('../ordersApi', () => ({
  findFulfillmentEncounter: jest.fn(),
  getFulfillmentForm: jest.fn(),
  getFulfillmentOrders: jest.fn(),
}));
jest.mock('../OrderResultEditor', () => ({
  __esModule: true,
  default: () => null,
  OrderResultValues: () => null,
}));
jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  UserGlobalAction: () => null,
  useUserPrivilege: jest.fn(),
  useActivePractitioner: jest.fn(),
}));
const tab = {
  id: 'radiology',
  label: 'Radiology Orders',
  extensionPointId: 'org.bahmni.patient.search',
  requiredPrivilege: 'app:orders',
  extensionParams: {
    searchHandler: 'emrapi.sqlSearch.activePatients',
    additionalParams: 'configured',
    forwardUrl:
      '../orders/#/patient/{{patientUuid}}/fulfillment/Radiology Order',
  },
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: ['app:orders'].map((name) => ({
      name,
      uuid: name,
    })),
    isLoading: false,
  });
  jest.mocked(useActivePractitioner).mockReturnValue({
    practitioner: { uuid: 'provider' },
    loading: false,
  } as ReturnType<typeof useActivePractitioner>);
  jest
    .mocked(getUserLoginLocation)
    .mockReturnValue({ uuid: 'location' } as ReturnType<
      typeof getUserLoginLocation
    >);
});

const renderPage = (path = '/clinical/orders') =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/clinical/orders" element={<OrdersPage />} />
          <Route
            path="/clinical/orders/:patientUuid/:orderType"
            element={<OrdersPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

it('uses the configured SQL handler, session context and extra parameters', async () => {
  jest.mocked(get).mockResolvedValueOnce([]);
  await fetchOrderPatients(tab, 'location', 'provider');
  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bahmnicore/sql', {
    params: {
      q: 'emrapi.sqlSearch.activePatients',
      v: 'full',
      location_uuid: 'location',
      provider_uuid: 'provider',
      additionalParams: 'configured',
    },
  });
});

it('shows live queue columns, filters patients and links only to the matching React fulfillment workflow', async () => {
  jest.mocked(get).mockImplementation(async (url) =>
    url.includes('extension.json')
      ? { tab }
      : url.includes('app.json')
        ? { config: {} }
        : [
            {
              uuid: 'patient',
              identifier: 'ABC200007',
              name: 'Asha Demo',
              activeVisitUuid: 'visit',
              service: 'X-ray',
            },
          ],
  );
  renderPage();
  const link = await screen.findByRole('link', { name: 'View orders' });
  expect(link).toHaveAttribute(
    'href',
    '/clinical/orders/patient/Radiology%20Order',
  );
  expect(screen.getByText('X-ray')).toBeInTheDocument();
  expect(
    screen.queryByRole('columnheader', { name: 'uuid' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filter worklist'), {
    target: { value: 'other' },
  });
  expect(
    screen.getByText('No patients match this worklist.'),
  ).toBeInTheDocument();
  expect(fulfillmentOrderType('../different/#/patient')).toBeUndefined();
});

it('does not query clinical data without the legacy Orders access privilege', () => {
  jest
    .mocked(useUserPrivilege)
    .mockReturnValue({ userPrivileges: [], isLoading: false });
  renderPage();
  expect(screen.getByRole('alert')).toHaveTextContent('do not have access');
  expect(get).not.toHaveBeenCalled();
});

it('does not substitute radiology access for the Orders privilege', () => {
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [{ name: 'app:radiologyOrders', uuid: 'radiology' }],
    isLoading: false,
  });
  renderPage();
  expect(screen.getByRole('alert')).toHaveTextContent('do not have access');
  expect(get).not.toHaveBeenCalled();
});

it.each([1791067650000, '2026-10-04T04:07:30.000Z'])(
  'formats the fulfillment timestamp %s using the shared date formatter',
  async (date) => {
    jest
      .mocked(get)
      .mockImplementation(async (url) =>
        url.includes('extension.json') ? { tab } : { config: {} },
      );
    jest
      .mocked(getFormattedPatientById)
      .mockResolvedValue({ fullName: 'QorliaQA Synthetic' } as Awaited<
        ReturnType<typeof getFormattedPatientById>
      >);
    jest
      .mocked(getFulfillmentForm)
      .mockResolvedValue({} as Awaited<ReturnType<typeof getFulfillmentForm>>);
    jest
      .mocked(findFulfillmentEncounter)
      .mockResolvedValue({ observations: [] });
    jest
      .mocked(getFulfillmentOrders)
      .mockResolvedValue([
        {
          orderUuid: 'order',
          orderNumber: 'ORD-5',
          orderDate: date,
          concept: { name: 'Chest X-ray' },
        },
      ]);
    renderPage('/clinical/orders/patient/Radiology%20Order');
    expect(
      await screen.findByText(
        `ORD-5 · ${formatDateTime(date, undefined, true).formattedResult}`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(`ORD-5 · ${date}`)).not.toBeInTheDocument();
  },
);
