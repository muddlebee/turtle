import { AssetHub, Hydration, PolkadotTokens } from '@velocitylabs-org/turtle-registry'
import { describe, expect, it } from 'vitest'
import { parseTransferSelection, writeTransferSelection } from '@/utils/transferUrl'

describe('transfer URL selections', () => {
  const selection = {
    sourceChain: AssetHub,
    sourceToken: PolkadotTokens.USDC,
    destinationChain: Hydration,
    destinationToken: PolkadotTokens.HDX,
  }

  it('restores a valid route from stable chain and token IDs', () => {
    expect(
      parseTransferSelection(
        new URLSearchParams('fromChain=polkadot-assethub&fromToken=usdc&toChain=hydration&toToken=hdx'),
      ),
    ).toEqual(selection)
  })

  it('keeps the valid prefix and rejects invalid dependent selections', () => {
    expect(
      parseTransferSelection(
        new URLSearchParams('fromChain=polkadot-assethub&fromToken=unknown&toChain=hydration&toToken=hdx'),
      ),
    ).toEqual({ sourceChain: AssetHub, sourceToken: null, destinationChain: null, destinationToken: null })
  })

  it('writes only selections, preserving unrelated parameters', () => {
    const params = writeTransferSelection(new URLSearchParams('campaign=test&fromToken=obsolete'), selection)
    expect(params.toString()).toBe(
      'campaign=test&fromChain=polkadot-assethub&fromToken=usdc&toChain=hydration&toToken=hdx',
    )
  })

  it('removes dependent params when selections are cleared', () => {
    const params = writeTransferSelection(
      new URLSearchParams('campaign=test&fromChain=polkadot-assethub&fromToken=usdc&toChain=hydration&toToken=hdx'),
      { ...selection, sourceToken: null },
    )
    expect(params.toString()).toBe('campaign=test&fromChain=polkadot-assethub')
  })
})
