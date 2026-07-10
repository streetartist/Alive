import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    coordinates: 'src/coordinates.ts',
    normalize: 'src/normalize.ts',
  },
  dts: true,
  // Keep native / heavy runtime packages external for Electron main.
  deps: {
    neverBundle: [
      '@moeru/std',
      '@nut-tree-fork/nut-js',
    ],
  },
})
