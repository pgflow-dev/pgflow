/**
 * Sanitizes error messages by redacting sensitive values.
 *
 * Defense-in-depth measure to prevent accidental leakage of secrets
 * (like SUPABASE_DB_URL or SUPABASE_SERVICE_ROLE_KEY) in error messages
 * returned to clients or written to logs.
 */

/**
 * Replaces known secrets in error messages with [REDACTED]
 * @param message - The error message to sanitize
 * @param env - Environment variables containing potential secrets
 * @returns Sanitized message with secrets redacted
 */
export function sanitizeErrorMessage(
  message: string,
  env: Record<string, string | undefined>
): string {
  let sanitized = message;

  const secrets = [
    env.SUPABASE_DB_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ];

  for (const secret of secrets) {
    // Only redact non-trivial secrets (avoid false positives)
    if (secret && secret.length > 8) {
      sanitized = sanitized.replaceAll(secret, '[REDACTED]');
    }
  }

  return sanitized;
}

/**
 * Extracts and sanitizes an error message from an unknown error value
 * @param error - The caught error (unknown type)
 * @param env - Environment variables containing potential secrets
 * @returns Sanitized error message
 */
export function getSanitizedErrorMessage(
  error: unknown,
  env: Record<string, string | undefined>
): string {
  const rawMessage = error instanceof Error ? error.message : 'Unknown error';
  return sanitizeErrorMessage(rawMessage, env);
}
