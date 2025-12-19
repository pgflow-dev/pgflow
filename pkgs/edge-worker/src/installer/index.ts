import { createInstallerHandler } from './server.ts';

export const Installer = {
  run: (token: string) => {
    const handler = createInstallerHandler(token);
    Deno.serve({}, handler);
  },
};
