import fs from 'fs';
import { text } from '@clack/prompts';

export async function supabasePathPrompt() {
  return await text({
    message: 'Enter the path to your supabase/ directory',
    placeholder: 'supabase/',
    validate,
  });
}

function validate(path: string) {
  const pathsToTest = [
    [path, 'is not a valid path'],
    [`${path}/config.toml`, 'does not contain config.toml'],
  ];

  // if any of the pathsToTest fail, return the error message
  for (const [testPath, errorMessage] of pathsToTest) {
    if (!fs.existsSync(testPath)) {
      return `${path} ${errorMessage}`;
    }
  }

  // otherwise, return undefined
  return undefined;
}
