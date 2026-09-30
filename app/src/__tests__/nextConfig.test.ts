import { describe, expect, it } from 'vitest'
import { configureWebpack } from '../../next.config.mjs'

describe('Next.js WebAssembly output', () => {
  it('emits server WebAssembly next to the server runtime lookup path', () => {
    const webpackConfig = {
      externals: [],
      experiments: {},
      module: { rules: [] },
      output: {},
    }

    const configured = configureWebpack(webpackConfig, { isServer: true })

    expect(configured.output.webassemblyModuleFilename).toBe('../static/wasm/[modulehash].wasm')
  })
})
