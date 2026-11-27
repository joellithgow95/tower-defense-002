import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

let build = 'dev';
try { build = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout yet */ }

export default defineConfig({ base: './', define: { __BUILD__: JSON.stringify(build) } });
