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

const workerBase = "https://morgentidende-media-ingest.morgentidende.workers.dev";
const smokeSource = "https://media.morgentidende.dk/ChatGPT%20Image%20Sep%207,%202026,%2001_11_34%20PM.png";

const runSmokeTest = async () => {
  const health = await fetch(`${workerBase}/health`, { redirect: "follow" });
  if (!health.ok) {
    throw new Error(`Health check failed: ${health.status} ${await health.text()}`);
  }

  const ingest = await fetch(`${workerBase}/ingest`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.MEDIA_INGEST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      source_url: smokeSource,
      source_provider: "Morgentidende deployment smoke test",
      license_name: "Morgentidende-owned test asset",
      rights_notes: "Automated deployment smoke test using an existing Morgentidende-owned R2 asset",
      commercial_use_allowed: true,
      local_storage_allowed: true,
      modifications_allowed: true,
      attribution_required: false,
      alt_text: "Automatisk test af Morgentidendes interne billedarkiv",
      metadata: { smoke_test: true },
    }),
  });

  const text = await ingest.text();
  if (!ingest.ok) {
    throw new Error(`Ingest smoke test failed: ${ingest.status} ${text.slice(0, 500)}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Ingest smoke test returned invalid JSON: ${text.slice(0, 500)}`);
  }

  if (body?.ok !== true || !body?.asset?.id || !body?.asset?.delivery_url) {
    throw new Error(`Ingest smoke test returned an unexpected response: ${text.slice(0, 500)}`);
  }

  console.log(`Media ingest smoke test passed (${ingest.status}, asset ${body.asset.id}, deduplicated=${Boolean(body.deduplicated)})`);
};

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

  // Cloudflare may need a few seconds before the new version is served globally.
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await runSmokeTest();
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  if (lastError) throw lastError;
} finally {
  await rm(dir, { recursive: true, force: true });
}
