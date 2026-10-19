import { readFileSync } from "node:fs";

declare const __PACKAGE_VERSION__: string;

function packageVersion(): string {
  const metadata: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    !("version" in metadata) ||
    typeof metadata.version !== "string"
  ) {
    throw new TypeError("package.json must contain a version string");
  }
  return metadata.version;
}

export const version = typeof __PACKAGE_VERSION__ === "string" ? __PACKAGE_VERSION__ : packageVersion();
