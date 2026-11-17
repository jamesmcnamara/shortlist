import { readFileSync } from "node:fs";

const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

// Walks the whole file so nested `dependencies` in older lockfile formats count too.
const resolvedUrls = (value) =>
  value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) =>
        key === "resolved" && typeof child === "string"
          ? [child]
          : resolvedUrls(child),
      )
    : [];

const lockfile = JSON.parse(
  readFileSync(process.argv[2] ?? "package-lock.json", "utf8"),
);
const outside = resolvedUrls(lockfile).filter(
  (url) => !url.startsWith(PUBLIC_REGISTRY),
);

if (outside.length) {
  console.error(
    `package-lock.json resolves ${outside.length} package(s) outside ${PUBLIC_REGISTRY}, which Vercel can't download:`,
  );
  outside.forEach((url) => console.error(`  ${url}`));
  console.error(
    `Private feed URLs usually come from installing through gh cfs. Replace everything before /npm/registry/ with ${PUBLIC_REGISTRY} (integrity hashes stay the same), then stage the lockfile again.`,
  );
  process.exit(1);
}
