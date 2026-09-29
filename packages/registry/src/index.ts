import { MainnetRegistry } from './mainnet'
import type { Chain, LocalAssetUid, Token } from './types'

export const REGISTRY = MainnetRegistry

export const tokensById = MainnetRegistry.tokens.reduce<Record<string, Token>>((acc, token) => {
  acc[token.id] = token
  return acc
}, {})

export const chainsByUid = MainnetRegistry.chains.reduce<Record<string, Chain>>((acc, chain) => {
  acc[chain.uid] = chain
  return acc
}, {})

export function getAssetUid(chainId: string, tokenId: string): LocalAssetUid | undefined {
  return REGISTRY.assetUid.get(chainId)?.get(tokenId)
}

export * from './helpers'
export * from './mainnet'
export * from './types'
export * from './utils'
