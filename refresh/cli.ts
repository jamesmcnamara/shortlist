import { Command, CommanderError, InvalidArgumentError } from "commander";
import { z } from "zod";
import { runRefresh } from "./run";

type Refresh = Parameters<typeof runRefresh>[0];

export async function executeCli(
  refresh: Refresh,
  args = process.argv.slice(2),
): Promise<number> {
  const command = new Command()
    .name("refresh")
    .description(
      "Refresh movies in one theatre, or all theatres when no ID is provided.",
    )
    .argument("[theatre-id]", "Theatre UUID", (value) => {
      if (!z.guid().safeParse(value).success) {
        throw new InvalidArgumentError("Expected a theatre UUID.");
      }
      return value;
    })
    .option("--apply", "Save updates (otherwise preview only)", false)
    .exitOverride();

  try {
    command.parse(args, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }
  const failed = await runRefresh(refresh, {
    theatreId: command.args[0],
    apply: command.opts<{ apply: boolean }>().apply,
  });
  return failed ? 1 : 0;
}

export function runCli(refresh: Refresh): void {
  executeCli(refresh)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
