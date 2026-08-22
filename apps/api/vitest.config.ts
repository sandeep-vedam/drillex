import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { existsSync } from 'fs';
// Local convenience: load apps/api/.env (CI provides env directly).
try { if (existsSync('.env')) (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env'); } catch {}
export default defineConfig({
  test: { include: ['test/**/*.e2e.ts', 'src/**/*.spec.ts'], globals: true, testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
