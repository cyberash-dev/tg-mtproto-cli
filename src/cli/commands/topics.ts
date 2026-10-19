import type { Command } from "commander";
import type { TopicsListUseCase } from "../../use-cases/topics-list.js";
import { exitWithError } from "../errors.js";
import { formatTopicsJson, formatTopicsTable } from "../formatters/topic-formatter.js";

export function registerTopicsCommand(program: Command, topicsListUseCase: TopicsListUseCase) {
  program
    .command("topics <chat>")
    .description("List forum topics in a supergroup")
    .option("--limit <n>", "Number of topics to show", "100")
    .action(async (chat: string, opts) => {
      try {
        const topics = await topicsListUseCase.execute({
          alias: program.opts().account,
          chat,
          limit: parseInt(opts.limit, 10),
        });

        const json = program.opts().json;
        console.log(json ? formatTopicsJson(topics) : formatTopicsTable(topics));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        exitWithError(program, message, message.includes("No default") ? 2 : 1);
      }
    });
}
