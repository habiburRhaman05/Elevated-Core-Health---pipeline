// Copy the Prisma query-engine binary next to the bundled serverless function
// (api/index.js). The bundled client searches its own directory (__dirname =
// api/) at runtime, so the engine must live there — includeFiles alone puts it
// somewhere the client never looks.
import { readdirSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = join("src", "generated", "prisma");
const DEST = "api";

const log = (s) => process.stdout.write(s + "\n");

if (!existsSync(SRC)) {
  log(`copy-prisma-engine: ${SRC} not found (run \`prisma generate\` first) — skipping`);
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });

const engines = readdirSync(SRC).filter(
  (f) => f.endsWith(".so.node") || f.endsWith(".dll.node")
);

if (engines.length === 0) {
  log("copy-prisma-engine: WARNING — no query-engine binary found to copy");
  process.exit(0);
}

for (const file of engines) {
  copyFileSync(join(SRC, file), join(DEST, file));
  log(`copy-prisma-engine: api/${file}`);
}
