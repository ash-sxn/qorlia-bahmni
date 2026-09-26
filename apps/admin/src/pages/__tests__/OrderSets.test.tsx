import { get } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderSets, savePayload } from '../OrderSets';

jest.mock('@bahmni/services', () => ({
  get: jest.fn(),
  post: jest.fn(),
  del: jest.fn(),
  getOrderTypes: jest.fn(),
  fetchMedicationOrdersMetadata: jest.fn(),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

it('loads the legacy order set list through the React route', async () => {
  (get as jest.Mock).mockResolvedValue({
    results: [{ uuid: 'one', name: 'Admission' }],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/order-sets']}>
        <Routes>
          <Route path="/order-sets" element={<OrderSets />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole('button', { name: 'Admission' }),
  ).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bahmniorderset?v=full');
});

it('preserves member order and serializes dosing templates for the Bahmni API', () => {
  const payload = savePayload({
    name: '  Admission ',
    description: '  standard  ',
    operator: 'ALL',
    orderSetMembers: [
      {
        key: 'ui-1',
        uuid: 'existing',
        orderType: { uuid: 'drug-type' },
        concept: { uuid: 'concept-1', display: 'Drug' },
        orderTemplate: {
          drug: { uuid: 'drug-1' },
          dosingInstructions: { dose: 1, doseUnits: 'Tablet' },
        },
      },
      {
        key: 'ui-2',
        orderType: { uuid: 'lab-type' },
        concept: { uuid: 'concept-2', display: 'Test' },
        orderTemplate: {},
        retired: false,
      },
    ],
  });
  expect(payload.name).toBe('Admission');
  expect(payload.description).toBe('standard');
  expect(payload.orderSetMembers[0]).toEqual(
    expect.objectContaining({
      uuid: 'existing',
      orderTemplate:
        '{"drug":{"uuid":"drug-1"},"dosingInstructions":{"dose":1,"doseUnits":"Tablet"}}',
    }),
  );
  expect(payload.orderSetMembers[1].concept.uuid).toBe('concept-2');
  expect(payload.orderSetMembers[0]).not.toHaveProperty('key');
});
