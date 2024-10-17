import { get } from 'svelte/store';
import { createSupabaseEntityStore } from '$lib/stores/supabaseEntityStore';
import { describe, it, expect } from 'vitest';

describe('createSupabaseEntityStore', () => {
	it('should create a store with initial entities', () => {
		const initialEntities = [
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' }
		];
		const store = createSupabaseEntityStore(initialEntities);
		expect(get(store.entities).get('share1')).toEqual(initialEntities);
	});

	it('should upsert an entity', () => {
		const store = createSupabaseEntityStore();
		const entity = { id: '1', share_id: 'share1' };
		store.upsertEntity(entity);
		expect(get(store.entities).get('share1')).toEqual([entity]);

		const updatedEntity = { ...entity, someField: 'value' };
		store.upsertEntity(updatedEntity);
		expect(get(store.entities).get('share1')).toEqual([updatedEntity]);
	});

	it('should remove an entity', () => {
		const initialEntities = [
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' }
		];
		const store = createSupabaseEntityStore(initialEntities);
		store.removeEntity({ id: '1', share_id: 'share1' });
		expect(get(store.entities).get('share1')).toEqual([{ id: '2', share_id: 'share1' }]);
	});

	it('should return entities for a specific share', () => {
		const initialEntities = [
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' },
			{ id: '3', share_id: 'share2' }
		];
		const store = createSupabaseEntityStore(initialEntities);
		expect(store.entitiesForShare({ share_id: 'share1' })).toEqual([
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' }
		]);
		expect(store.entitiesForShare({ share_id: 'share2' })).toEqual([
			{ id: '3', share_id: 'share2' }
		]);
	});

	it('should upsert multiple entities', () => {
		const store = createSupabaseEntityStore();
		const entities = [
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' },
			{ id: '3', share_id: 'share2' }
		];
		store.upsertEntities(entities);
		expect(get(store.entities).get('share1')).toEqual([
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' }
		]);
		expect(get(store.entities).get('share2')).toEqual([{ id: '3', share_id: 'share2' }]);

		const updatedEntities = [
			{ id: '1', share_id: 'share1', someField: 'value' },
			{ id: '4', share_id: 'share2' }
		];
		store.upsertEntities(updatedEntities);
		expect(get(store.entities).get('share1')).toEqual([
			{ id: '1', share_id: 'share1', someField: 'value' },
			{ id: '2', share_id: 'share1' }
		]);
		expect(get(store.entities).get('share2')).toEqual([
			{ id: '3', share_id: 'share2' },
			{ id: '4', share_id: 'share2' }
		]);
	});

	it('should trigger subscribe callback only once for upsertEntities', () => {
		const store = createSupabaseEntityStore();
		let callCount = 0;
		const unsubscribe = store.entities.subscribe(() => {
			callCount++;
		});
		expect(callCount).toBe(1);

		const entities = [
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' },
			{ id: '3', share_id: 'share2' }
		];
		store.upsertEntities(entities);

		expect(callCount).toBe(2);
		unsubscribe();
	});

	it('should remove multiple entities', () => {
		const initialEntities = [
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' },
			{ id: '3', share_id: 'share2' },
			{ id: '4', share_id: 'share2' }
		];
		const store = createSupabaseEntityStore(initialEntities);

		const entitiesToRemove = [
			{ id: '1', share_id: 'share1' },
			{ id: '3', share_id: 'share2' }
		];
		store.removeEntities(entitiesToRemove);

		expect(get(store.entities).get('share1')).toEqual([{ id: '2', share_id: 'share1' }]);
		expect(get(store.entities).get('share2')).toEqual([{ id: '4', share_id: 'share2' }]);
	});

	it('should trigger subscribe callback only once for removeEntities', () => {
		const initialEntities = [
			{ id: '1', share_id: 'share1' },
			{ id: '2', share_id: 'share1' },
			{ id: '3', share_id: 'share2' },
			{ id: '4', share_id: 'share2' }
		];
		const store = createSupabaseEntityStore(initialEntities);
		let callCount = 0;
		const unsubscribe = store.entities.subscribe(() => {
			callCount++;
		});
		expect(callCount).toBe(1);

		const entitiesToRemove = [
			{ id: '1', share_id: 'share1' },
			{ id: '3', share_id: 'share2' }
		];
		store.removeEntities(entitiesToRemove);

		expect(callCount).toBe(2);
		unsubscribe();
	});
});
