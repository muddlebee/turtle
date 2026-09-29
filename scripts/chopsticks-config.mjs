import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { parse } from 'yaml'

function readYaml(path, description) {
  if (!existsSync(path)) throw new Error(`${description} does not exist: ${path}`)

  try {
    return parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${description}: ${message}`)
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireNonEmptyString(value, description) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${description} must be a non-empty string`)
  }
  return value
}

function resolveConfigPath(chopsticksDir, configPath) {
  return isAbsolute(configPath) ? configPath : resolve(chopsticksDir, configPath)
}

function loadNetworks(rootDir) {
  const chopsticksDir = resolve(rootDir, 'chopsticks')
  const rawNetworks = readYaml(resolve(chopsticksDir, 'networks.yml'), 'Chopsticks network manifest')
  if (!isRecord(rawNetworks)) throw new Error('Chopsticks network manifest must be an object')

  return Object.entries(rawNetworks).map(([uid, rawNetwork]) => {
    if (!isRecord(rawNetwork)) throw new Error(`Chopsticks network "${uid}" must be an object`)

    const config = requireNonEmptyString(rawNetwork.config, `Config path for "${uid}"`)
    const paraspellChain =
      rawNetwork.paraspellChain === undefined
        ? undefined
        : requireNonEmptyString(rawNetwork.paraspellChain, `ParaSpell chain for "${uid}"`)
    const configPath = resolveConfigPath(chopsticksDir, config)
    const rawConfig = readYaml(configPath, `Chopsticks config for "${uid}"`)
    if (!isRecord(rawConfig)) throw new Error(`Chopsticks config for "${uid}" must be an object`)

    const host = requireNonEmptyString(rawConfig.host, `Host in Chopsticks config for "${uid}"`)
    const port = rawConfig.port
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error(`Port in Chopsticks config for "${uid}" must be an integer between 1 and 65535`)
    }
    const db = requireNonEmptyString(rawConfig.db, `Database path in Chopsticks config for "${uid}"`)
    const rpcHost = host.includes(':') ? `[${host}]` : host

    return {
      uid,
      paraspellChain,
      configPath,
      host,
      port,
      db,
      rpcUrl: `ws://${rpcHost}:${port}`,
    }
  })
}

export function validateChopsticksConfiguration({ rootDir }) {
  const networks = loadNetworks(rootDir)
  const errors = []
  const ports = new Map()
  const databases = new Map()
  const paraspellChains = new Map()

  for (const network of networks) {
    const address = `${network.host}:${network.port}`
    const portOwner = ports.get(address)
    if (portOwner) errors.push(`Duplicate Chopsticks port ${network.port} for "${portOwner}" and "${network.uid}"`)
    else ports.set(address, network.uid)

    const databasePath = resolve(rootDir, network.db)
    const databaseOwner = databases.get(databasePath)
    if (databaseOwner) {
      errors.push(`Duplicate Chopsticks database path for "${databaseOwner}" and "${network.uid}": ${network.db}`)
    } else databases.set(databasePath, network.uid)

    if (network.paraspellChain) {
      const chainOwner = paraspellChains.get(network.paraspellChain)
      if (chainOwner) {
        errors.push(`Duplicate ParaSpell chain "${network.paraspellChain}" for "${chainOwner}" and "${network.uid}"`)
      } else paraspellChains.set(network.paraspellChain, network.uid)
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'))
  return networks
}

function resolveNetwork(uid, networksByUid) {
  const network = networksByUid.get(uid)
  if (!network) throw new Error(`Unknown Chopsticks network "${uid}"`)
  return network
}

export function loadChopsticksSetup({ rootDir, topologyName }) {
  if (!/^[a-z0-9-]+$/.test(topologyName)) {
    throw new Error('Topology name may contain only lowercase letters, numbers, and hyphens')
  }

  const networks = validateChopsticksConfiguration({ rootDir })
  const networksByUid = new Map(networks.map(network => [network.uid, network]))
  const topologyPath = resolve(rootDir, 'chopsticks', 'topologies', `${topologyName}.yml`)
  const topology = readYaml(topologyPath, `Chopsticks topology "${topologyName}"`)
  if (!isRecord(topology)) throw new Error(`Chopsticks topology "${topologyName}" must be an object`)

  const relaychainUid = topology.relaychain
  if (relaychainUid !== undefined && typeof relaychainUid !== 'string') {
    throw new Error(`Relaychain in topology "${topologyName}" must be a network UID`)
  }
  if (!Array.isArray(topology.parachains) || topology.parachains.length === 0) {
    throw new Error(`Topology "${topologyName}" must contain at least one parachain`)
  }

  const parachainUids = topology.parachains.map(uid =>
    requireNonEmptyString(uid, `Parachain in topology "${topologyName}"`),
  )
  const topologyUids = [...(relaychainUid ? [relaychainUid] : []), ...parachainUids]
  const duplicateUid = topologyUids.find((uid, index) => topologyUids.indexOf(uid) !== index)
  if (duplicateUid) throw new Error(`Network "${duplicateUid}" is duplicated in topology "${topologyName}"`)

  const relaychain = relaychainUid ? resolveNetwork(relaychainUid, networksByUid) : undefined
  const parachains = parachainUids.map(uid => resolveNetwork(uid, networksByUid))
  const selectedNetworks = [...(relaychain ? [relaychain] : []), ...parachains]
  const rpcOverrides = Object.fromEntries(
    selectedNetworks.flatMap(network => (network.paraspellChain ? [[network.paraspellChain, network.rpcUrl]] : [])),
  )

  return { topologyName, relaychain, parachains, rpcOverrides }
}

export function buildChopsticksArgs(setup) {
  return [
    'xcm',
    ...(setup.relaychain ? ['--relaychain', setup.relaychain.configPath] : []),
    ...setup.parachains.flatMap(network => ['--parachain', network.configPath]),
  ]
}
