import { Command } from "commander";

export const program = new Command();

program
  .command("install")
  .description("Installs pgflow migration and worker edge function")
  .argument("<supabase-path>", "Path to supabase project")
  .action(async (supabasePath: string) => {
    console.log(`Installing pgflow into ${supabasePath}`);
  });

export default program;
