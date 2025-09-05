/**
 * Deep clone an object recursively
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  const source = obj as Record<PropertyKey, unknown>;
  const target = Array.isArray(obj) ? [] as unknown[] : {} as Record<PropertyKey, unknown>;
  
  for (const key of Reflect.ownKeys(source)) {
    (target as Record<PropertyKey, unknown>)[key] = deepClone(source[key]);
  }
  
  return target as T;
}

/**
 * Deep freeze an object recursively to prevent any modifications
 */
export function deepFreeze<T>(obj: T): T {
  // Get property names
  const propNames = Reflect.ownKeys(obj as object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = (obj as Record<PropertyKey, unknown>)[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}