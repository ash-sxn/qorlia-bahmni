import { del, get, post } from '@bahmni/services';
import { saveBedTags } from '../bedTags';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  del: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
}));

const bed = {
  bedId: 7,
  bedTagMaps: [
    { uuid: 'map-1', bedTag: { id: 1, uuid: 'tag-1', name: 'Oxygen' } },
  ],
};
const tags = [
  { id: 1, uuid: 'tag-1', name: 'Oxygen' },
  { id: 2, uuid: 'tag-2', name: 'Isolation' },
];

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(get).mockResolvedValueOnce({ bedLayouts: [bed] });
  jest.mocked(get).mockResolvedValueOnce({ results: tags });
});

it('adds and removes only the changed bed tag mappings', async () => {
  await saveBedTags('ward-1', 7, ['map-1'], ['tag-2']);

  expect(get).toHaveBeenNthCalledWith(
    1,
    '/openmrs/ws/rest/v1/admissionLocation/ward-1?v=full',
  );
  expect(post).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bedTagMap/', {
    bedTag: { id: 2 },
    bed: { id: 7 },
  });
  expect(del).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bedTagMap/map-1');
});

it('refuses to write when the bed tags changed after the editor opened', async () => {
  await expect(saveBedTags('ward-1', 7, [], ['tag-2'])).rejects.toThrow(
    'bed tags changed',
  );

  expect(post).not.toHaveBeenCalled();
  expect(del).not.toHaveBeenCalled();
});

it('refuses tags missing from the live catalog', async () => {
  await expect(
    saveBedTags('ward-1', 7, ['map-1'], ['tag-unknown']),
  ).rejects.toThrow('no longer available');

  expect(post).not.toHaveBeenCalled();
  expect(del).not.toHaveBeenCalled();
});

it('can remove an assigned tag that is absent from the current catalog', async () => {
  jest
    .mocked(get)
    .mockReset()
    .mockResolvedValueOnce({ bedLayouts: [bed] })
    .mockResolvedValueOnce({ results: [] });

  await saveBedTags('ward-1', 7, ['map-1'], []);

  expect(del).toHaveBeenCalledWith('/openmrs/ws/rest/v1/bedTagMap/map-1');
});

it('does not remove an old tag when adding its replacement fails', async () => {
  jest.mocked(post).mockRejectedValueOnce(new Error('server error'));

  await expect(saveBedTags('ward-1', 7, ['map-1'], ['tag-2'])).rejects.toThrow(
    'Some bed tags may have changed',
  );

  expect(del).not.toHaveBeenCalled();
});
