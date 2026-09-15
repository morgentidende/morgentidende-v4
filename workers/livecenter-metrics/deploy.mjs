import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required build secret: ${name}`);
    process.exit(1);
  }
}

const dir = await mkdtemp(join(tmpdir(), 'morgentidende-livecenter-secrets-'));
const secretsPath = join(dir, 'secrets.json');

try {
  await writeFile(
    secretsPath,
    JSON.stringify({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }),
    { mode: 0o600 },
  );

  const child = spawn(
    'npx',
    [
      'wrangler',
      'deploy',
      '--config',
      'workers/livecenter-metrics/wrangler.toml',
      '--secrets-file',
      secretsPath,
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );

  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) process.exit(code ?? 1);

  const healthUrl = 'https://morgentidende-livecenter-metrics.morgentidende.workers.dev/health';
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      const body = await response.json();
      if (!response.ok || body?.ok !== true) throw new Error(`Health failed: ${response.status}`);
      console.log(`Livecenter metrics worker health passed (${response.status})`);
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
