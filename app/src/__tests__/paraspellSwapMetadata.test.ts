import { getExchangePairs } from '@paraspell/xcm-router'
import { getTokenByLocation } from '@velocitylabs-org/turtle-registry'
import { describe, expect, it } from 'vitest'
import { HYDRATION_DEX_TOKEN_IDS } from '@/utils/paraspellSwapMetadata'

describe('ParaSpell swap metadata', () => {
  it('matches the registry tokens in the installed Hydration router', () => {
    const registryPairs = getExchangePairs('HydrationDex').flatMap(([first, second]) => {
      if (!first.location || !second.location) return []

      const firstToken = getTokenByLocation(first.location)
      const secondToken = getTokenByLocation(second.location)
      return firstToken && secondToken ? [[firstToken.id, secondToken.id]] : []
    })
    const routerTokenIds = [...new Set(registryPairs.flat())].sort()

    expect([...HYDRATION_DEX_TOKEN_IDS].sort()).toEqual(routerTokenIds)
    expect(registryPairs).toHaveLength((routerTokenIds.length * (routerTokenIds.length - 1)) / 2)
  })
})
