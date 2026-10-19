import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  entry: ['./src/main.ts'],
  outDir: 'dist',
  format: 'esm',
  target: 'node18',
  define: { __PACKAGE_VERSION__: JSON.stringify(packageJson.version) },
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
})
