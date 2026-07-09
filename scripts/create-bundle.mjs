import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = "/tmp/assetpaste-submit";
const bundlePath = join(root, "bundle.zip");

rmSync(stagingDir, { force: true, recursive: true });
rmSync(bundlePath, { force: true });
mkdirSync(stagingDir, { recursive: true });

cpSync(join(root, "webflow.json"), join(stagingDir, "webflow.json"));
cpSync(join(root, "dist"), stagingDir, { recursive: true });

removeDsStore(stagingDir);

execFileSync("zip", ["-r", bundlePath, "."], {
  cwd: stagingDir,
  stdio: "inherit",
});

console.log(`Created ${bundlePath}`);

function removeDsStore(directory) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory)) {
    const entryPath = join(directory, entry);

    if (entry === ".DS_Store") {
      rmSync(entryPath, { force: true });
      continue;
    }

    if (statSync(entryPath).isDirectory()) {
      removeDsStore(entryPath);
    }
  }
}
