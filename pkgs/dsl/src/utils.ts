/**
 * Validates a slug string according to the following rules:
 * - Cannot start with a number
 * - Cannot start with an underscore
 * - Cannot contain spaces
 * - Cannot contain special characters like /, :, ?, #
 * - Cannot be longer than 128 characters
 *
 * @param slug The slug string to validate
 * @throws Error if the slug is invalid
 */
export function validateSlug(slug: string): void {
  if (slug.length > 128) {
    throw new Error(`Slug cannot be longer than 128 characters`);
  }

  if (/^\d/.test(slug)) {
    throw new Error(`Slug cannot start with a number`);
  }

  if (/^_/.test(slug)) {
    throw new Error(`Slug cannot start with an underscore`);
  }

  if (/\s/.test(slug)) {
    throw new Error(`Slug cannot contain spaces`);
  }

  if (/[\/:#?]/.test(slug)) {
    throw new Error(`Slug cannot contain special characters like /, :, ?, #`);
  }
}
