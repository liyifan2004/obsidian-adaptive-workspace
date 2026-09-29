// Copy build artifacts into a test vault: .obsidian/plugins/adaptive-workspace/
// Usage: VAULT_PATH=/path/to/vault npm run sync
// Never copies data.json (user settings / private).
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import process from "process";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vault = process.env.VAULT_PATH;

if (!vault) {
  console.error("Set VAULT_PATH to your test vault, e.g.:");
  console.error('  VAULT_PATH="D:/MyNotes/学-习" npm run sync');
  process.exit(1);
}

const target = join(vault, ".obsidian", "plugins", "adaptive-workspace");
mkdirSync(target, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const from = join(root, file);
  if (!existsSync(from)) {
    console.error(`Missing ${file} — run "npm run build" first.`);
    process.exit(1);
  }
  copyFileSync(from, join(target, file));
  console.log(`synced ${file} -> ${target}`);
}
