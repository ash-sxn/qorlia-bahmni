import { openPdfForPrint } from '../cashierPrint';

const pdf = { filename: 'receipt.pdf', blob: new Blob(['%PDF-1.4']) };

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:receipt');
  URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

it('opens the PDF in the tab it opened during the click', async () => {
  const tab = { location: { href: '' }, close: jest.fn() };
  jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

  await openPdfForPrint(async () => pdf);

  expect(window.open).toHaveBeenCalledWith('', '_blank');
  expect(tab.location.href).toBe('blob:receipt');
  expect(document.querySelector('iframe')).toBeNull();
});

it('prints from a hidden frame when the browser blocks new tabs', async () => {
  jest.spyOn(window, 'open').mockReturnValue(null);

  await openPdfForPrint(async () => pdf);

  const frame = document.querySelector('iframe');
  expect(frame).not.toBeNull();
  expect(frame).toHaveAttribute('src', 'blob:receipt');
  expect(frame).toHaveAttribute('aria-hidden', 'true');
});

it('closes the empty tab when the PDF cannot be loaded', async () => {
  const tab = { location: { href: '' }, close: jest.fn() };
  jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

  await expect(
    openPdfForPrint(async () => {
      throw new Error('Billing did not answer.');
    }),
  ).rejects.toThrow('Billing did not answer.');
  expect(tab.close).toHaveBeenCalled();
});
