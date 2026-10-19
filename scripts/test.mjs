import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
const testFiles = readdirSync(sourceDirectory, { recursive: true })
  .filter((path) => path.endsWith(".test.ts"))
  .sort()
  .map((path) => join(sourceDirectory, path));

if (testFiles.length === 0) throw new Error("No *.test.ts files found under src");

const execution = spawnSync(process.execPath, ["--import", "tsx", "--test", ...process.argv.slice(2), ...testFiles], {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, TZ: "UTC" },
  stdio: "inherit",
});
if (execution.error) throw execution.error;
process.exit(execution.status ?? 1);
