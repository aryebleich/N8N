#!/usr/bin/env node
// Starts the panel bound to 127.0.0.1 (this computer only) unless ADMIN_PUBLIC=true.
//   npm run dev     → development server
//   npm start       → production server (after npm run build)
// BIND_HOST overrides the address (the Docker image uses 0.0.0.0 inside the container;
// docker-compose.yml still publishes the port on 127.0.0.1 only).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function loadDotEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
loadDotEnv();

const mode = process.argv[2] === 'dev' ? 'dev' : 'start';
const pub = process.env.ADMIN_PUBLIC === 'true';
const host = process.env.BIND_HOST || (pub ? '0.0.0.0' : '127.0.0.1');
const port = process.env.PORT || '3000';

console.log(pub
  ? `\n  ⚠  ADMIN_PUBLIC=true: the admin panel (no login!) is reachable from other computers on ${host}:${port}.\n`
  : `\n  Admin panel: http://localhost:${port}  (this computer only; see ADMIN_PUBLIC in the README)\n`);

const child = spawn(process.execPath, [new URL('../node_modules/next/dist/bin/next', import.meta.url).pathname, mode, '-H', host, '-p', port], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
