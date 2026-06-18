import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve('src/main/core')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
})
