import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@velocitylabs-org\/turtle-registry$/,
        replacement: fileURLToPath(new URL('../packages/registry/src/index.ts', import.meta.url)),
      },
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
    ],
  },
  test: { environment: 'node' },
})
