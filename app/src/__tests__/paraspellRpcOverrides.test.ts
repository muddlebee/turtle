import { describe, expect, it } from 'vitest'
import { parseParaspellRpcOverrides, resolveParaspellRpcOverrides } from '@/utils/paraspellRpcOverrides'

describe('parseParaspellRpcOverrides', () => {
  it('returns no overrides when configuration is omitted', () => {
    expect(parseParaspellRpcOverrides(undefined)).toEqual({})
  })

  it('parses WebSocket URLs keyed by ParaSpell chain', () => {
    expect(
      parseParaspellRpcOverrides(
        JSON.stringify({
          Polkadot: 'ws://127.0.0.1:8000',
          AssetHubPolkadot: 'ws://127.0.0.1:8001',
        }),
      ),
    ).toEqual({
      Polkadot: 'ws://127.0.0.1:8000',
      AssetHubPolkadot: 'ws://127.0.0.1:8001',
    })
  })

  it('rejects malformed JSON', () => {
    expect(() => parseParaspellRpcOverrides('{')).toThrow(/must be valid JSON/)
  })

  it('rejects unsupported ParaSpell chain names', () => {
    expect(() => parseParaspellRpcOverrides(JSON.stringify({ Unknown: 'ws://127.0.0.1:8000' }))).toThrow(
      /unsupported ParaSpell chain "Unknown"/,
    )
  })

  it('rejects non-WebSocket RPC URLs', () => {
    expect(() => parseParaspellRpcOverrides(JSON.stringify({ Polkadot: 'http://127.0.0.1:8000' }))).toThrow(
      /must use ws: or wss:/,
    )
  })
})

describe('resolveParaspellRpcOverrides', () => {
  it('uses the healthy Hydration fallback when configuration is omitted', () => {
    expect(resolveParaspellRpcOverrides(undefined)).toEqual({
      Hydration: 'wss://hydration-rpc.n.dwellir.com',
    })
  })

  it('lets explicit configuration replace the Hydration fallback', () => {
    expect(
      resolveParaspellRpcOverrides(
        JSON.stringify({
          Hydration: 'ws://127.0.0.1:8002',
          AssetHubPolkadot: 'ws://127.0.0.1:8001',
        }),
      ),
    ).toEqual({
      Hydration: 'ws://127.0.0.1:8002',
      AssetHubPolkadot: 'ws://127.0.0.1:8001',
    })
  })
})
