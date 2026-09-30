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
  getParaSpellChain: vi.fn((chain: { uid: string }) => {
    if (chain.uid === 'polkadot-assethub') return 'AssetHubPolkadot'
    if (chain.uid === 'ethereum') return 'Ethereum'
    if (chain.uid === 'ethereum-testnet') return 'EthereumTestnet'
    return 'Hydration'
  }),
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

  it('loads the router only when creating a builder', async () => {
    const manager = new XcmRouterBuilderManager()

    const builder = manager.createBuilder(createParams(1n) as never)

    expect(RouterBuilderMock).not.toHaveBeenCalled()
    await builder

    expect(RouterBuilderMock).toHaveBeenCalledWith({
      abstractDecimals: false,
      apiOverrides: {
        AssetHubPolkadot: 'ws://127.0.0.1:8001',
        Hydration: 'ws://127.0.0.1:8002',
      },
    })
  })

  it('evicts the least-recently-used builder when the cache is full', async () => {
    const manager = new XcmRouterBuilderManager(2)

    await manager.createBuilder(createParams(1n) as never)
    await manager.createBuilder(createParams(2n) as never)
    await manager.getBuilder(createParams(1n) as never, 'HydrationDex')
    await manager.createBuilder(createParams(3n) as never)

    expect(manager.builderList().size).toBe(2)

    await manager.getBuilder(createParams(2n) as never, 'HydrationDex')
    expect(RouterBuilderMock).toHaveBeenCalledTimes(4)
  })

  it('shares builder creation across concurrent requests', async () => {
    const manager = new XcmRouterBuilderManager()

    await Promise.all([
      manager.createBuilder(createParams(1n) as never),
      manager.createBuilder(createParams(1n) as never),
    ])

    expect(RouterBuilderMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['ethereum', 'Ethereum'],
    ['ethereum-testnet', 'EthereumTestnet'],
  ])('allows %s as the destination of a ParaSpell swap', async (uid, paraSpellChain) => {
    const manager = new XcmRouterBuilderManager()
    const builder = createFakeBuilder()
    RouterBuilderMock.mockReturnValue(builder)

    await manager.createBuilder({
      ...createParams(1n),
      destinationChain: { uid },
    } as never)

    expect(builder.to).toHaveBeenCalledWith(paraSpellChain)
  })
})
