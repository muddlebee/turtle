import type { Chain, Token } from '@velocitylabs-org/turtle-registry'
import {
  getAllowedDestinationChains,
  getAllowedDestinationTokens,
  getAllowedSourceTokens,
  sourceChainOptions,
} from '@/utils/routes'

export interface TransferSelection {
  sourceChain: Chain | null
  sourceToken: Token | null
  destinationChain: Chain | null
  destinationToken: Token | null
}

const selectionKeys = ['fromChain', 'fromToken', 'toChain', 'toToken'] as const

export const parseTransferSelection = (params: URLSearchParams): TransferSelection => {
  const sourceChain = sourceChainOptions.find(chain => chain.uid === params.get('fromChain')) ?? null
  const sourceToken =
    getAllowedSourceTokens(sourceChain, null).find(token => token.id === params.get('fromToken')) ?? null
  const destinationChain =
    getAllowedDestinationChains(sourceChain, sourceToken).find(chain => chain.uid === params.get('toChain')) ?? null
  const destinationToken =
    getAllowedDestinationTokens(sourceChain, sourceToken, destinationChain).find(
      token => token.id === params.get('toToken'),
    ) ?? null

  return { sourceChain, sourceToken, destinationChain, destinationToken }
}

export const writeTransferSelection = (params: URLSearchParams, selection: TransferSelection): URLSearchParams => {
  const updated = new URLSearchParams(params)
  for (const key of selectionKeys) updated.delete(key)

  if (!selection.sourceChain) return updated
  updated.set('fromChain', selection.sourceChain.uid)
  if (!selection.sourceToken) return updated
  updated.set('fromToken', selection.sourceToken.id)
  if (!selection.destinationChain) return updated
  updated.set('toChain', selection.destinationChain.uid)
  if (selection.destinationToken) updated.set('toToken', selection.destinationToken.id)

  return updated
}
