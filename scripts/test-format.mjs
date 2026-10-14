import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { build } from "esbuild";
import { promises as fs } from "fs";
import { spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

async function runTests() {
  const testFile = join(projectRoot, "tests/format.test.ts");
  const tempDir = join(projectRoot, ".temp-test");
  const tempFile = join(tempDir, "format.test.mjs");

  try {
    await fs.mkdir(tempDir, { recursive: true });

    await build({
      entryPoints: [testFile],
      outfile: tempFile,
      bundle: false,
      platform: "node",
      format: "esm",
      tsconfig: join(projectRoot, "tsconfig.json"),
    });

    const result = spawnSync("node", [tempFile], { stdio: "inherit" });
    process.exit(result.status || 0);
  } catch (err) {
    console.error("Test build failed:", err);
    process.exit(1);
  }
}

runTests();
