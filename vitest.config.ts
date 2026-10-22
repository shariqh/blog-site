import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Playwright specs live under tests/ — vitest must not pick them up.
    // public/ holds files synced from elsewhere, such as the Agent Inbox landing;
    // nothing there may run as a test.
    exclude: ['node_modules/**', 'dist/**', '.astro/**', 'tests/**', 'public/**'],
  },
})
