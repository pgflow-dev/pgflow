import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Get the version from package.json
 * Reads the version from the package.json file located one directory up from the compiled dist/ folder
 */
export function getVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || 'unknown';
  } catch (error) {
    // Log error but don't display it to the user when showing version
    console.error('Error reading package.json:', error);
    return 'unknown';
  }
}
