import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '@clack/prompts';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the pgflow migrations
const sourcePath = path.resolve(__dirname, '../../../migrations');

export async function copyMigrations({
  supabasePath,
}: {
  supabasePath: string;
}) {
  log.info(`Copying migrations`);

  const migrationsPath = `${supabasePath}/migrations`;

  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath);
  }

  // Check if pgflow migrations directory exists
  if (!fs.existsSync(sourcePath)) {
    log.error(`Source migrations directory not found at ${sourcePath}`);
    log.info(
      "This might happen if you're running from source instead of the built package."
    );
    log.info('Try building the package first with: nx build cli');
    return;
  }

  const files = fs.readdirSync(sourcePath);

  for (const file of files) {
    const source = `${sourcePath}/${file}`;
    const destination = `${migrationsPath}/${file}`;

    if (fs.existsSync(destination)) {
      log.step(`Skipping ${file}`);
      continue;
    }

    fs.copyFileSync(source, destination);
    log.step(`Copied ${file}`);
  }
}
