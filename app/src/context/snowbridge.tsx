import { Context, contextConfigFor, environment } from '@snowbridge/api'
import type { Network } from '@velocitylabs-org/turtle-registry'

/**
 * Given a network, return the adequate Snowbridge Api Environment scheme.
 *
 *
 * @param network - The network in which the app is operating on
 * @returns The adequate SnowbridgeEnvironment for the given input
 */
export function getSbEnvironment(network: Network = 'Polkadot'): environment.SnowbridgeEnvironment {
  const sbNetwork = toSnowbridgeNetwork(network)
  if (sbNetwork === undefined) throw Error(`Snowbridge doesn't support the given Network`)

  return environment.SNOWBRIDGE_ENV[sbNetwork]
}

export async function getSnowBridgeContext(network: Network = 'Polkadot'): Promise<Context> {
  const snowbridgeNetwork = toSnowbridgeNetwork(network)
  if (!snowbridgeNetwork) throw new Error(`Snowbridge context not supported on ${network}`)

  const config = contextConfigFor(snowbridgeNetwork)
  return new Context(config)
}

/**
 * Convert a Network value to the corresponding network string value
 * that the Snowbridge/api SDK understands.
 * @param network - The network in which the app is operating
 * @returns the corresponding network value that Snowbridge/api understands
 */
function toSnowbridgeNetwork(network: Network): 'polkadot_mainnet' | undefined {
  switch (network) {
    case 'Polkadot':
    case 'Ethereum':
      return 'polkadot_mainnet'
    default:
      return undefined
  }
}
