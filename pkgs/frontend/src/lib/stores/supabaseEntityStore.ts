import { get, writable } from 'svelte/store';

export function createSupabaseEntityStore<T extends { id: string; share_id: string }>(
	entities: T[] = []
) {
	const store = writable<Map<string, T[]>>(new Map());

	function upsertEntity(entity: T) {
		store.update((map) => {
			const entities = map.get(entity.share_id) || [];
			const index = entities.findIndex((e) => e.id === entity.id);
			if (index !== -1) {
				entities[index] = entity;
			} else {
				entities.push(entity);
			}
			map.set(entity.share_id, entities);
			return map;
		});
	}

	function upsertEntities(entities: T[]) {
		store.update((map) => {
			entities.forEach((entity) => {
				const existingEntities = map.get(entity.share_id) || [];
				const index = existingEntities.findIndex((e) => e.id === entity.id);
				if (index !== -1) {
					existingEntities[index] = entity;
				} else {
					existingEntities.push(entity);
				}
				map.set(entity.share_id, existingEntities);
			});
			return map;
		});
	}

	function removeEntities(entities: T[]) {
		store.update((map) => {
			entities.forEach((entity) => {
				const existingEntities = map.get(entity.share_id);
				if (existingEntities) {
					const updatedEntities = existingEntities.filter((e) => e.id !== entity.id);
					map.set(entity.share_id, updatedEntities);
				}
			});
			return map;
		});
	}

	function removeEntity(entity: T) {
		removeEntities([entity]);
	}

	function entitiesForShare(share: { share_id: string }) {
		return get(store).get(share.share_id) || [];
	}

	upsertEntities(entities);

	return {
		entities: store,
		upsertEntity,
		upsertEntities,
		removeEntity,
		removeEntities,
		entitiesForShare
	};
}
