import fs from 'fs';
import path from 'path';
import { text, log } from '@clack/prompts';

export async function supabasePathPrompt() {
  // Try to detect the Supabase directory automatically
  const possiblePaths = ['./supabase', '../supabase', '../../supabase'];

  let detectedPath = '';
  for (const testPath of possiblePaths) {
    if (
      fs.existsSync(testPath) &&
      fs.existsSync(path.join(testPath, 'config.toml'))
    ) {
      detectedPath = testPath;
      break;
    }
  }

  if (detectedPath) {
    log.info(`Found Supabase project at: ${detectedPath}`);
  }

  const promptMessage = 'Where is your Supabase project located?';

  const supabasePath = await text({
    message: promptMessage,
    placeholder: detectedPath || 'supabase/',
    initialValue: detectedPath,
    validate,
  });

  if (!supabasePath) {
    throw new Error('User cancelled');
  }

  return supabasePath;
}

function validate(inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    return `Directory not found: ${inputPath}`;
  }

  if (!fs.existsSync(path.join(inputPath, 'config.toml'))) {
    return `Not a valid Supabase project (missing config.toml)`;
  }

  return undefined;
}
