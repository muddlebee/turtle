import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildChopsticksArgs, loadChopsticksSetup, validateChopsticksConfiguration } from './chopsticks-config.mjs'

function createFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), 'turtle-chopsticks-'))
  const chopsticksDir = join(rootDir, 'chopsticks')
  mkdirSync(join(chopsticksDir, 'configs'), { recursive: true })
  mkdirSync(join(chopsticksDir, 'topologies'), { recursive: true })

  writeFileSync(
    join(chopsticksDir, 'networks.yml'),
    `polkadot:
  config: configs/polkadot.yml
  paraspellChain: Polkadot
polkadot-assethub:
  config: configs/polkadot-assethub.yml
  paraspellChain: AssetHubPolkadot
`,
  )
  writeFileSync(
    join(chopsticksDir, 'configs/polkadot.yml'),
    `host: 127.0.0.1
port: 8000
endpoint: wss://rpc.polkadot.io
db: .chopsticks/db/polkadot.sqlite
`,
  )
  writeFileSync(
    join(chopsticksDir, 'configs/polkadot-assethub.yml'),
    `host: 127.0.0.1
port: 8001
endpoint: wss://polkadot-asset-hub-rpc.polkadot.io
db: .chopsticks/db/polkadot-assethub.sqlite
`,
  )
  writeFileSync(
    join(chopsticksDir, 'topologies/polkadot-basic.yml'),
    `relaychain: polkadot
parachains:
  - polkadot-assethub
`,
  )

  return rootDir
}

test('loads a topology and derives ParaSpell RPC overrides', () => {
  const rootDir = createFixture()

  const setup = loadChopsticksSetup({ rootDir, topologyName: 'polkadot-basic' })

  assert.equal(setup.relaychain.uid, 'polkadot')
  assert.deepEqual(
    setup.parachains.map(network => network.uid),
    ['polkadot-assethub'],
  )
  assert.deepEqual(setup.rpcOverrides, {
    Polkadot: 'ws://127.0.0.1:8000',
    AssetHubPolkadot: 'ws://127.0.0.1:8001',
  })
})

test('builds a connected Chopsticks XCM command', () => {
  const rootDir = createFixture()
  const setup = loadChopsticksSetup({ rootDir, topologyName: 'polkadot-basic' })

  assert.deepEqual(buildChopsticksArgs(setup), [
    'xcm',
    '--relaychain',
    join(rootDir, 'chopsticks/configs/polkadot.yml'),
    '--parachain',
    join(rootDir, 'chopsticks/configs/polkadot-assethub.yml'),
  ])
})

test('allows a network without ParaSpell support and omits it from RPC overrides', () => {
  const rootDir = createFixture()
  writeFileSync(
    join(rootDir, 'chopsticks/networks.yml'),
    `polkadot:
  config: configs/polkadot.yml
  paraspellChain: Polkadot
polkadot-assethub:
  config: configs/polkadot-assethub.yml
`,
  )

  const setup = loadChopsticksSetup({ rootDir, topologyName: 'polkadot-basic' })

  assert.deepEqual(setup.rpcOverrides, { Polkadot: 'ws://127.0.0.1:8000' })
})

test('rejects topology entries that are not declared networks', () => {
  const rootDir = createFixture()
  writeFileSync(
    join(rootDir, 'chopsticks/topologies/polkadot-basic.yml'),
    `relaychain: polkadot
parachains:
  - missing-chain
`,
  )

  assert.throws(
    () => loadChopsticksSetup({ rootDir, topologyName: 'polkadot-basic' }),
    /Unknown Chopsticks network "missing-chain"/,
  )
})

test('rejects unsafe topology names', () => {
  const rootDir = createFixture()

  assert.throws(
    () => loadChopsticksSetup({ rootDir, topologyName: '../polkadot-basic' }),
    /Topology name may contain only lowercase letters, numbers, and hyphens/,
  )
})

test('rejects duplicate ports and database paths across network configs', () => {
  const rootDir = createFixture()
  writeFileSync(
    join(rootDir, 'chopsticks/configs/polkadot-assethub.yml'),
    `host: 127.0.0.1
port: 8000
endpoint: wss://polkadot-asset-hub-rpc.polkadot.io
db: .chopsticks/db/polkadot.sqlite
`,
  )

  assert.throws(
    () => validateChopsticksConfiguration({ rootDir }),
    /Duplicate Chopsticks port 8000.*Duplicate Chopsticks database path/s,
  )
})
