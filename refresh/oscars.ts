import { Command } from "commander";
import { refreshOscars } from "./oscar-data";

const command = new Command()
  .name("refresh:oscars")
  .description(
    "Import every movie in the Oscar blob and link its Shortlist ID.",
  )
  .option(
    "--apply",
    "Save movies and update the blob (otherwise preview only)",
    false,
  )
  .parse();

refreshOscars(command.opts<{ apply: boolean }>())
  .then((failed) => {
    process.exitCode = failed ? 1 : 0;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
