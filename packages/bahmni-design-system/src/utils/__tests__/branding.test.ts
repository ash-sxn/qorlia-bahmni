import {
  applyHospitalBranding,
  DEFAULT_BRANDING,
  getHospitalBranding,
  parseHospitalBranding,
} from '../branding';

describe('hospital branding', () => {
  afterEach(() => applyHospitalBranding(DEFAULT_BRANDING));

  it('accepts a safe hospital theme and applies it to the shared UI', () => {
    const config = parseHospitalBranding({
      name: 'City Hospital',
      logoPath: '/branding/city-hospital.png',
      primary: '#204B3A',
      primaryHover: '#163B2C',
      canvas: '#F7F8F6',
    });
    applyHospitalBranding(config);
    expect(getHospitalBranding().name).toBe('City Hospital');
    expect(
      document.documentElement.style.getPropertyValue('--qorlia-primary'),
    ).toBe('#204B3A');
    expect(document.getElementById('bahmni-theme')?.textContent).toContain(
      '--cds-background-brand: #204B3A',
    );
  });

  it.each([
    [{ ...DEFAULT_BRANDING, primary: 'red' }, 'primary'],
    [{ ...DEFAULT_BRANDING, primary: '#FFFFFF' }, 'contrast'],
    [{ ...DEFAULT_BRANDING, canvas: '#111111' }, 'contrast'],
    [{ ...DEFAULT_BRANDING, logoPath: 'https://other.site/logo.png' }, 'Logo'],
    [{ ...DEFAULT_BRANDING, logoPath: '//other.site/logo.png' }, 'Logo'],
    [{ ...DEFAULT_BRANDING, canvas: '#FFFFFF; color: red' }, 'canvas'],
  ])('rejects invalid input %#', (input, message) => {
    expect(() => parseHospitalBranding(input)).toThrow(message);
  });
});
