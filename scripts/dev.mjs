/* `npm run dev:all` — Vite + the API server in one terminal. */
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['--env-file-if-exists=.env', '--env-file-if-exists=.env.local', '--disable-warning=ExperimentalWarning', '--watch', 'server/index.js'], { stdio: 'inherit', shell: true }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: true }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
