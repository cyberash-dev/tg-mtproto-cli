import chalk from "chalk";
import { Presets, SingleBar } from "cli-progress";
import type { Command } from "commander";
import type { DownloadMediaUseCase } from "../../use-cases/download-media.js";
import { exitWithError } from "../errors.js";

export function registerDownloadCommand(program: Command, downloadMediaUseCase: DownloadMediaUseCase) {
  program
    .command("download <chat> <messageId>")
    .description("Download media from a message")
    .option("--out <dir>", "Output directory", ".")
    .action(async (chat: string, messageId: string, opts) => {
      try {
        const json = program.opts().json;
        let progressBar: SingleBar | null = null;

        if (!json) {
          progressBar = new SingleBar(
            {
              format: "{bar} {percentage}% | {value}/{total} bytes",
            },
            Presets.shades_classic,
          );
        }

        const result = await downloadMediaUseCase.execute({
          alias: program.opts().account,
          chat,
          messageId: parseInt(messageId, 10),
          outputDir: opts.out,
          onProgress: json
            ? undefined
            : (downloaded, total) => {
                if (progressBar) {
                  if (total > 0 && !progressBar.isActive) {
                    progressBar.start(total, 0);
                  }
                  progressBar.update(downloaded);
                }
              },
        });

        progressBar?.stop();

        if (json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(chalk.green(`\nSaved to ${result.path}`));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        exitWithError(program, message, message.includes("No default") || message.includes("expired") ? 2 : 1);
      }
    });
}
