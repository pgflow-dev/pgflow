import { Command } from "commander";

let program = new Command()
  .command("install")
  .description("Installs pgflow migration and worker edge function")
  .argument("<supabase-path>", "Path to supabase project")
  .action(async (supabasePath: string) => {
    console.log(`Installing pgflow into ${supabasePath}`);
  });

if (process.env.NODE_ENV === "test") {
  program = program.exitOverride();
}

export default program;
