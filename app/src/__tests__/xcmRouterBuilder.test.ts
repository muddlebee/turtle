import { beforeEach, describe, expect, it, vi } from 'vitest'

const { RouterBuilderMock } = vi.hoisted(() => ({
  RouterBuilderMock: vi.fn(),
}))

vi.mock('@paraspell/xcm-router', () => ({
  RouterBuilder: RouterBuilderMock,
}))

vi.mock('@/utils/address', () => ({
  getSenderAddress: vi.fn(),
}))

vi.mock('@/utils/env', () => ({
  paraspellRpcOverrides: {
    Hydration: 'ws://127.0.0.1:8002',
  },
}))

vi.mock('@/utils/paraspellTransfer', () => ({
  getParaSpellChain: vi.fn((chain: { uid: string }) =>
    chain.uid === 'polkadot-assethub' ? 'AssetHubPolkadot' : 'Hydration',
  ),
  getParaspellToken: vi.fn((token: { id: string }) => ({ symbol: token.id })),
}))

vi.mock('@/utils/transfer', () => ({
  toHuman: vi.fn((amount: bigint | string) => amount.toString()),
}))

import { XcmRouterBuilderManager } from '@/services/paraspell/xcmRouterBuilder'

function createFakeBuilder() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['from', 'to', 'exchange', 'currencyFrom', 'currencyTo', 'amount']) {
    builder[method] = vi.fn(() => builder)
  }
  return builder
}

function createParams(sourceAmount: bigint) {
  return {
    sourceChain: {
      uid: 'polkadot-assethub',
      rpcConnection: 'ws://127.0.0.1:8001',
    },
    destinationChain: {
      uid: 'hydration',
      rpcConnection: 'ws://127.0.0.1:9002',
    },
    sourceToken: { id: 'usdc' },
    destinationToken: { id: 'hdx' },
    sourceAmount,
  }
}

describe('XcmRouterBuilderManager', () => {
  beforeEach(() => {
    RouterBuilderMock.mockReset()
    RouterBuilderMock.mockImplementation(createFakeBuilder)
  })

  it('uses configured RPC overrides when creating a router builder', () => {
    const manager = new XcmRouterBuilderManager()

    manager.createBuilder(createParams(1n) as never)

    expect(RouterBuilderMock).toHaveBeenCalledWith({
      abstractDecimals: false,
      apiOverrides: {
        AssetHubPolkadot: 'ws://127.0.0.1:8001',
        Hydration: 'ws://127.0.0.1:8002',
      },
    })
  })

  it('evicts the least-recently-used builder when the cache is full', () => {
    const manager = new XcmRouterBuilderManager(2)

    manager.createBuilder(createParams(1n) as never)
    manager.createBuilder(createParams(2n) as never)
    manager.getBuilder(createParams(1n) as never, 'HydrationDex')
    manager.createBuilder(createParams(3n) as never)

    expect(manager.builderList().size).toBe(2)

    manager.getBuilder(createParams(2n) as never, 'HydrationDex')
    expect(RouterBuilderMock).toHaveBeenCalledTimes(4)
  })
})
