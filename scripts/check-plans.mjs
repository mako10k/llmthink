import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plansRoot = join(repositoryRoot, "plans");
const perttoolEntry = join(
  dirname(fileURLToPath(import.meta.resolve("perttool"))),
  "cli.js",
);

async function findPlanFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return findPlanFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".pert") ? [path] : [];
    }),
  );
  return nested.flat();
}

const planFiles = (await findPlanFiles(plansRoot)).sort();
if (planFiles.length === 0) {
  throw new Error("No .pert plans found under plans/");
}

for (const planFile of planFiles) {
  const displayedPath = relative(repositoryRoot, planFile);
  const checks = [
    { args: ["document", "check", displayedPath], showSuccess: true },
    {
      args: ["dag", "analyze", displayedPath, "--schedule", "both"],
      showSuccess: false,
    },
    {
      args: ["dag", "next", displayedPath, "--format", "json"],
      showSuccess: false,
    },
  ];

  for (const { args, showSuccess } of checks) {
    const result = spawnSync(process.execPath, [perttoolEntry, ...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }
    if (showSuccess) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
  }
}
