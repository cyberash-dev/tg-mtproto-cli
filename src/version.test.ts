import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsdown";
import { version } from "./version.js";

test("bundled version works in a nested output directory without package.json", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "tg-cli-version-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const outDir = join(directory, "chunks");
  await build({
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    entry: ["src/version.ts"],
    outDir,
    logLevel: "silent",
  });
  const bundleUrl = pathToFileURL(join(outDir, "version.mjs")).href;

  const execution = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `import { version } from ${JSON.stringify(bundleUrl)}; console.log(version);`],
    { encoding: "utf8" },
  );

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), version);
});
