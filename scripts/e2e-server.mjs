// Starts the built panel on a fresh, throw-away database for the Playwright tests.
// Run `npm run build` first.
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';

const port = process.argv[2] || '3100';
rmSync('.e2e', { recursive: true, force: true });
const child = spawn(process.execPath, ['scripts/start.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env, PORT: port, TURSO_DATABASE_URL: 'file:./.e2e/test.db', INTERNAL_API_SECRET: 'e2e-internal-secret-0123456789',
    ADMIN_PUBLIC: 'false', ANTHROPIC_API_KEY: '', GOOGLE_AI_API_KEY: '', SLACK_BOT_TOKEN: '', SMTP_HOST: '', APP_URL: `http://localhost:${port}`,
  },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
