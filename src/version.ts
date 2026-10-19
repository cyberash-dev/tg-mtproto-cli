import { readFileSync } from "node:fs";

const metadata: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (
  metadata === null ||
  typeof metadata !== "object" ||
  !("version" in metadata) ||
  typeof metadata.version !== "string"
) {
  throw new TypeError("package.json must contain a version string");
}

export const version = metadata.version;
