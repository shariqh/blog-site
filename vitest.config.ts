import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Playwright specs live under tests/ — vitest must not pick them up.
    exclude: ['node_modules/**', 'dist/**', '.astro/**', 'tests/**'],
  },
})
