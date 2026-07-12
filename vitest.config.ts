import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // ops/canary の node:test スイート(*.test.mjs)を拾わないよう、アプリ本体のテストに限定する
    include: ['src/**/*.test.ts?(x)'],
  },
})
