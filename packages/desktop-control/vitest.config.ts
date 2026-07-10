import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'desktop-control',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
