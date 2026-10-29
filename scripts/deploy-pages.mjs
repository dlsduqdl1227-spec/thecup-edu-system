// Deploy the small Pages gateway independently from Vinext's generated Worker config.
import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staging = await mkdtemp(join(tmpdir(), "thecup-pages-"));
try {
  await cp(join(root, "deploy/pages"), staging, { recursive: true });
  const result = spawnSync(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), "pages", "deploy", "--project-name", "thecup-edu", "--branch", "main"], { cwd: staging, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(staging, { recursive: true, force: true });
}
