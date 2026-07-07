import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const apiDir = path.join(frontendRoot, "src", "app", "api");
const tempApiDir = path.join(frontendRoot, `.api-export-skip-${Date.now()}`);

let movedApi = false;

try {
  if (existsSync(apiDir)) {
    renameSync(apiDir, tempApiDir);
    movedApi = true;
  }

  const result = spawnSync("npm", ["run", "build"], {
    cwd: frontendRoot,
    env: { ...process.env, NEXT_OUTPUT: "export" },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  }
} finally {
  if (movedApi) {
    renameSync(tempApiDir, apiDir);
  }
}
