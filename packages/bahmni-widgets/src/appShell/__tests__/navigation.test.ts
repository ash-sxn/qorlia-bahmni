import {
  activeItemId,
  landingFor,
  resolveModuleUrl,
  toNavItems,
} from '../navigation';

const module = (id: string, url: string, order = 1) => ({
  id,
  extensionPointId: 'x',
  type: 'link',
  label: id,
  url,
  order,
  icon: 'fa-circle',
});

describe('shell navigation', () => {
  it('places known modules by the job they serve and names them plainly', () => {
    const items = toNavItems(
      [
        module('bahmni.atomfeed.console', '/atomfeed-console', 12),
        module('bahmni.appointment.scheduling', '/appointments/', 13),
        module('custom.thing', 'custom/path', 20),
        module('bahmni.appointment.scheduling', '/duplicate', 30),
      ],
      (_key, fallback) => fallback,
    );

    expect(items.map(({ id, group, label }) => [id, group, label])).toEqual([
      ['bahmni.atomfeed.console', 'admin', 'Sync console'],
      ['bahmni.appointment.scheduling', 'work', 'Appointments'],
      ['custom.thing', 'hospital', 'custom.thing'],
    ]);
    expect(items[2].href).toBe('/bahmni-v2/custom/path');
  });

  it('uses review addresses where a build supplies them', () => {
    const [item] = toNavItems(
      [module('bahmni.ipd', '/bahmni/bedmanagement/')],
      (_key, fallback) => fallback,
      { 'bahmni.ipd': '/bahmni-v2/clinical/inpatient' },
    );
    expect(item.href).toBe('/bahmni-v2/clinical/inpatient');
  });

  it('keeps absolute addresses as they are', () => {
    expect(resolveModuleUrl('/bahmni/home')).toBe('/bahmni/home');
    expect(resolveModuleUrl('https://example.test/x')).toBe(
      'https://example.test/x',
    );
    expect(resolveModuleUrl('')).toBe('');
  });

  it('marks the most specific matching item as current', () => {
    const items = toNavItems(
      [
        module('qorlia.today', '/bahmni-v2/home'),
        module('qorlia.patient-record', '/bahmni-v2/home/records'),
      ],
      (_key, fallback) => fallback,
    );
    expect(activeItemId(items, '/bahmni-v2/home/records/abc')).toBe(
      'qorlia.patient-record',
    );
    expect(activeItemId(items, '/bahmni-v2/home')).toBe('qorlia.today');
    expect(activeItemId(items, '/elsewhere')).toBeUndefined();
  });

  it('lands each person on the page for their job', () => {
    expect(
      landingFor(['app:clinical', 'app:clinical:consultationTab', 'app:adt']),
    ).toBe('today');
    expect(landingFor(['app:clinical', 'app:adt'])).toBe('wards');
    expect(landingFor(['app:registration'])).toBe('frontdesk');
    expect(landingFor(['app:appointments', 'app:reports'])).toBe('frontdesk');
    expect(landingFor(['app:reports'])).toBe('overview');
    expect(landingFor([])).toBe('today');
  });
});
