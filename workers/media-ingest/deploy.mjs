import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const required = [
  "MEDIA_INGEST_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required build secret: ${name}`);
    process.exit(1);
  }
}

const dir = await mkdtemp(join(tmpdir(), "morgentidende-media-secrets-"));
const secretsPath = join(dir, "secrets.json");

try {
  await writeFile(
    secretsPath,
    JSON.stringify({
      MEDIA_INGEST_TOKEN: process.env.MEDIA_INGEST_TOKEN,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
    { mode: 0o600 }
  );

  const child = spawn(
    "npx",
    [
      "wrangler",
      "deploy",
      "--config",
      "workers/media-ingest/wrangler.toml",
      "--secrets-file",
      secretsPath,
    ],
    { stdio: "inherit", shell: process.platform === "win32" }
  );

  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (code !== 0) process.exit(code ?? 1);
} finally {
  await rm(dir, { recursive: true, force: true });
}
