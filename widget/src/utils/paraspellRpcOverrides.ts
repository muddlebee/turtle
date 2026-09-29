import { CHAINS, type TChain } from '@paraspell/sdk'

function isTChain(value: string): value is TChain {
  return CHAINS.some(chain => chain === value)
}

function parseWebSocketUrl(value: unknown, chain: string): string {
  if (typeof value !== 'string') throw new Error(`RPC override for "${chain}" must be a string`)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`RPC override for "${chain}" must be a valid URL`)
  }

  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`RPC override for "${chain}" must use ws: or wss:`)
  }
  return value
}

export function parseParaspellRpcOverrides(value: string | undefined): Partial<Record<TChain, string>> {
  if (!value) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('ParaSpell RPC overrides must be valid JSON')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('ParaSpell RPC overrides must be a JSON object')
  }

  const overrides: Partial<Record<TChain, string>> = {}
  for (const [chain, rpcUrl] of Object.entries(parsed)) {
    if (!isTChain(chain)) throw new Error(`RPC override contains unsupported ParaSpell chain "${chain}"`)
    overrides[chain] = parseWebSocketUrl(rpcUrl, chain)
  }
  return overrides
}
