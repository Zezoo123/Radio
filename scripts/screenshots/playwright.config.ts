import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

/** Config for the README screenshot run (`npm run screenshots`). */
export default defineConfig({
  testDir: dirname(fileURLToPath(import.meta.url)),
  testMatch: 'capture.ts',
  timeout: 240_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'off' }
})
