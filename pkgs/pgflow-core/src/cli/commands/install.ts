import { Command } from "commander";

let install = new Command()
  .command("install")
  .description("Installs pgflow migration and worker edge function")
  .argument("<supabase-path>", "Path to supabase project")
  .action(async (supabasePath: string) => {
    console.log(`Installing pgflow into ${supabasePath}`);
  });

if (process.env.NODE_ENV === "test") {
  install = install.exitOverride();
}

export default install;
