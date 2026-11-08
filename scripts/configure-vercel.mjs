// Values travel through stdin, never command-line arguments or logs.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
const npx = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'VOICE_MODE']) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  const result = spawnSync(process.execPath, [npx, 'vercel', 'env', 'add', name, '--environment', 'production', '--yes', '--force', name === 'SUPABASE_SECRET_KEY' ? '--sensitive' : '--no-sensitive'], { input: value, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Unable to configure ${name}; inspect Vercel project settings.`);
  console.log(`Configured ${name}`);
}
