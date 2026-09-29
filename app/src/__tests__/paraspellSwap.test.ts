import { AssetHub } from '@velocitylabs-org/turtle-registry'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getExchangePairsMock = vi.hoisted(() => vi.fn(() => []))

vi.mock('@paraspell/xcm-router', () => ({
  getExchangePairs: getExchangePairsMock,
}))

// Avoid loading the routes module, which eagerly builds source-chain options and
// would prime the pair cache before this unit test exercises it.
vi.mock('@/utils/routes', () => ({
  deduplicate: vi.fn(),
  isSameChain: vi.fn(),
}))

import { getSwapsSourceTokens } from '@/utils/paraspellSwap'

describe('ParaSpell swap selectors', () => {
  beforeEach(() => {
    getExchangePairsMock.mockClear()
  })

  it('resolves exchange pairs once across repeated selector queries', () => {
    getSwapsSourceTokens(AssetHub)
    getSwapsSourceTokens(AssetHub)

    expect(getExchangePairsMock).toHaveBeenCalledTimes(1)
  })
})
