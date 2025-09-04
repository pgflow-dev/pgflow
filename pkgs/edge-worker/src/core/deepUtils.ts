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

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Deep freeze an object recursively to prevent any modifications
 */
export function deepFreeze<T>(obj: T): T {
  // Get property names
  const propNames = Reflect.ownKeys(obj as object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = (obj as any)[name];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value);
    }
  }

  return Object.freeze(obj);
}