import { type Chain, Hydration, isSameToken, REGISTRY, type Token } from '@velocitylabs-org/turtle-registry'
import { HYDRATION_DEX_TOKEN_IDS } from '@/lib/paraspell/swapMetadata'
import { isSameChain } from '@/utils/routes'

// We only support Hydration for now.
/** contains all supported paraspell dexes mapped to the chain they run on */
const DEX_TO_CHAIN_MAP = {
  HydrationDex: Hydration,
} as const

export type Dex = keyof typeof DEX_TO_CHAIN_MAP

const hydrationDexTokens = HYDRATION_DEX_TOKEN_IDS.map(tokenId =>
  REGISTRY.tokens.find(token => token.id === tokenId),
).filter((token): token is Token => token !== undefined)

const hydrationDexTokenIds = new Set<string>(HYDRATION_DEX_TOKEN_IDS)

/** returns all supported dex chains */
const getSupportedDexChains = () => Object.values(DEX_TO_CHAIN_MAP)

/** returns the paraspell dex for a given chain */
const getDex = (chain: Chain): Dex | undefined => {
  const entry = Object.entries(DEX_TO_CHAIN_MAP).find(([, c]) => c.uid === chain.uid)
  return entry?.[0] as Dex | undefined
}

/** returns all tokens supported by a dex that are also supported by our registry and have at least one trading pair */
const getDexTokens = (dex: Dex): Token[] => {
  return dex === 'HydrationDex' ? hydrationDexTokens : []
}

/** returns all tokens that can be traded with the given source token on the specified dex */
const getTradeableTokens = (dex: Dex, sourceToken: Token): Token[] => {
  const dexTokens = getDexTokens(dex)
  if (!dexTokens.some(token => isSameToken(token, sourceToken))) return []
  return dexTokens.filter(token => !isSameToken(token, sourceToken))
}

/** returns all allowed source chains for a swap. */
export const getSwapsSourceChains = (): Chain[] => {
  const routesToHydration = new Map(
    REGISTRY.routes.filter(route => route.to === Hydration.uid).map(route => [route.from, route]),
  )

  // Use Set for deduplication track seen chain UIDs
  const seenChainUids = new Set<string>()
  const result: Chain[] = []

  for (const dexChain of getSupportedDexChains()) {
    if (!seenChainUids.has(dexChain.uid)) {
      seenChainUids.add(dexChain.uid)
      result.push(dexChain)
    }
  }

  // Single filter pass combining all conditions for one-click chains
  for (const chain of REGISTRY.chains) {
    if (!chain?.supportExecuteExtrinsic || seenChainUids.has(chain.uid)) continue

    const route = routesToHydration.get(chain.uid)
    if (!route) continue

    if (route.tokens.some(tokenId => hydrationDexTokenIds.has(tokenId))) {
      seenChainUids.add(chain.uid)
      result.push(chain)
    }
  }

  return result
}

/** returns all allowed source tokens for a swap. */
export const getSwapsSourceTokens = (sourceChain: Chain | null): Token[] => {
  if (!sourceChain) return []

  const dex = getDex(sourceChain)
  if (dex) return getDexTokens(dex)

  if (!sourceChain.supportExecuteExtrinsic) return []

  const routeToDex = REGISTRY.routes.find(route => route.from === sourceChain.uid && route.to === Hydration.uid)
  if (!routeToDex) return []

  const tokenIdsWithTradingPair = routeToDex.tokens.filter(tokenId => hydrationDexTokenIds.has(tokenId))

  const tokensWithTradingPair = tokenIdsWithTradingPair
    .map(tokenId => REGISTRY.tokens.find(token => token.id === tokenId))
    .filter((token): token is Token => token !== undefined)

  return tokensWithTradingPair
}

/** returns all allowed destination chains for a swap. */
export const getSwapsDestinationChains = (sourceChain: Chain | null, sourceToken: Token | null): Chain[] => {
  if (!sourceChain || !sourceToken) return []
  const chains: Chain[] = []

  const dex = getDex(sourceChain)
  if (!dex && !sourceChain.supportExecuteExtrinsic) return []

  const tradeableTokens = getTradeableTokens('HydrationDex', sourceToken)
  if (tradeableTokens.length === 0) return []
  chains.push(sourceChain)

  // get transfer routes we can reach from the dex
  const routes = REGISTRY.routes.filter(route => route.from === Hydration.uid)

  // Filter routes by dex trading pairs. A route needs to support at least one tradable token of the dex
  routes.forEach(route => {
    if (route.tokens.some(routeTokenId => tradeableTokens.some(tradeableToken => tradeableToken.id === routeTokenId))) {
      // lookup destination chain and add it to the list
      const destinationChain = REGISTRY.chains.find(chain => chain.uid === route.to)
      if (destinationChain) chains.push(destinationChain)
    }
  })

  return chains
}

/** returns all allowed destination tokens for a swap. */
export const getSwapsDestinationTokens = (
  sourceChain: Chain | null,
  sourceToken: Token | null,
  destinationChain: Chain | null,
): Token[] => {
  if (!sourceChain || !sourceToken || !destinationChain) return []

  const dex = getDex(sourceChain)
  if (!dex && !sourceChain.supportExecuteExtrinsic) return []

  // Check for tradeable tokens
  const tradeableTokens = getTradeableTokens('HydrationDex', sourceToken)
  if (tradeableTokens.length === 0) return []
  if (isSameChain(Hydration, destinationChain)) return tradeableTokens

  // Check if we can reach the destination chain
  const route = REGISTRY.routes.find(route => route.from === Hydration.uid && route.to === destinationChain.uid)
  if (!route) return []

  const tradeableAndTransferableTokens = tradeableTokens.filter(tradeableToken =>
    route.tokens.includes(tradeableToken.id),
  )

  return tradeableAndTransferableTokens
}
