import { Command } from "commander";
import install from "./cli/commands/install.ts";

let program = new Command().name("pgflow");

program.addCommand(install);

export default program;
