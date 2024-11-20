import { Command } from "commander";
import install from "./cli/commands/install.ts";

let program = new Command().name("pgflow");

export default program;
