import { del, get, post } from '@bahmni/services';
import type { Bed } from './BedManagement';

export interface BedTag {
  id: number;
  uuid: string;
  name: string;
}

const root = '/openmrs/ws/rest/v1';

export const fetchBedTags = async () => {
  const response = await get<{ results: BedTag[] }>(`${root}/bedTag`);
  if (!Array.isArray(response.results))
    throw new Error('Could not load bed tags.');
  return response.results;
};

export const saveBedTags = async (
  wardUuid: string,
  bedId: number,
  expectedMapUuids: string[],
  selectedTagUuids: string[],
) => {
  const { bedLayouts } = await get<{ bedLayouts: Bed[] }>(
    `${root}/admissionLocation/${encodeURIComponent(wardUuid)}?v=full`,
  );
  const bed = bedLayouts.find((item) => item.bedId === bedId);
  if (!bed) throw new Error('The bed changed. Refresh before editing tags.');

  const currentMaps = bed.bedTagMaps ?? [];
  if (currentMaps.some((map) => !map.uuid || !map.bedTag?.uuid)) {
    throw new Error('The bed tags are incomplete. Use the legacy bed screen.');
  }
  // ponytail: this check is not atomic; use a backend version precondition if concurrent tag edits become common.
  const currentMapUuids = currentMaps.map(({ uuid }) => uuid).sort();
  if (
    JSON.stringify(currentMapUuids) !==
    JSON.stringify([...expectedMapUuids].sort())
  ) {
    throw new Error('The bed tags changed. Refresh before editing them.');
  }

  const tags = await fetchBedTags();
  const selected = tags.filter(({ uuid }) => selectedTagUuids.includes(uuid));
  if (
    selectedTagUuids.some(
      (uuid) =>
        !currentMaps.some(({ bedTag }) => bedTag.uuid === uuid) &&
        !selected.some((tag) => tag.uuid === uuid && tag.id != null),
    )
  ) {
    throw new Error(
      'A selected bed tag is no longer available. Refresh before editing.',
    );
  }

  const existing = new Set(currentMaps.map(({ bedTag }) => bedTag.uuid));
  const wanted = new Set(selectedTagUuids);
  try {
    for (const tag of selected.filter(({ uuid }) => !existing.has(uuid))) {
      await post(`${root}/bedTagMap/`, {
        bedTag: { id: tag.id },
        bed: { id: bedId },
      });
    }
    for (const map of currentMaps.filter(
      ({ bedTag }) => !wanted.has(bedTag.uuid),
    )) {
      await del(`${root}/bedTagMap/${encodeURIComponent(map.uuid)}`);
    }
  } catch {
    throw new Error(
      'Some bed tags may have changed. Refresh and check the bed before retrying.',
    );
  }
};
