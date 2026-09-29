#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fetchConfig } from '@acala-network/chopsticks/schema/index'
import { buildChopsticksArgs, loadChopsticksSetup, validateChopsticksConfiguration } from './chopsticks-config.mjs'

const rootDir = resolve(import.meta.dirname, '..')
const command = process.argv[2] ?? 'start'
const topologyName = process.argv[3] ?? 'polkadot-basic'
const childProcesses = new Set()
let stopping = false

function allNetworks(setup) {
  return [...(setup.relaychain ? [setup.relaychain] : []), ...setup.parachains]
}

function ensureDatabaseDirectories(setup) {
  for (const network of allNetworks(setup)) {
    mkdirSync(dirname(resolve(rootDir, network.db)), { recursive: true })
  }
}

function checkPortAvailable(network) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', () => {
      reject(new Error(`Local RPC port ${network.port} is already in use by another process (${network.uid})`))
    })
    server.listen(network.port, network.host, () => {
      server.close(error => (error ? reject(error) : resolvePromise()))
    })
  })
}

function startProcess(executable, args, env = process.env) {
  const child = spawn(executable, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  childProcesses.add(child)
  child.once('exit', () => childProcesses.delete(child))
  return child
}

function waitForExit(child) {
  return new Promise((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolvePromise({ code, signal }))
  })
}

async function waitForRpc(network, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs
  const rpcUrl = network.rpcUrl.replace(/^ws/, 'http')

  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'system_chain', params: [] }),
        signal: AbortSignal.timeout(2_000),
      })
      const body = await response.json()
      if (response.ok && typeof body?.result === 'string') return body.result
    } catch {
      // The fork may take several minutes to load its initial state.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000))
  }

  if (stopping) throw new Error(`Stopped while waiting for ${network.uid}`)
  throw new Error(`Timed out waiting for ${network.uid} at ${network.rpcUrl}`)
}

function stopProcess(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return

  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

async function shutdown(exitCode) {
  if (stopping) return
  stopping = true
  for (const child of childProcesses) stopProcess(child)
  await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
  process.exitCode = exitCode
}

function printRpcOverrides(setup) {
  const value = JSON.stringify(setup.rpcOverrides)
  console.log('\nParaSpell RPC overrides:')
  console.log(`NEXT_PUBLIC_PARASPELL_RPC_OVERRIDES='${value}'`)
  console.log(`VITE_PUBLIC_PARASPELL_RPC_OVERRIDES='${value}'\n`)
  return value
}

async function run() {
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (nodeMajor < 22) throw new Error('Chopsticks requires Node.js 22 or later')

  if (command === 'validate') {
    const networks = validateChopsticksConfiguration({ rootDir })
    await Promise.all(networks.map(network => fetchConfig(network.configPath)))
    const topologyNames = readdirSync(resolve(rootDir, 'chopsticks/topologies'))
      .filter(name => name.endsWith('.yml'))
      .map(name => name.slice(0, -'.yml'.length))
    for (const name of topologyNames) loadChopsticksSetup({ rootDir, topologyName: name })
    console.log(`Validated ${networks.length} Chopsticks network configs and ${topologyNames.length} topologies.`)
    return
  }

  if (!['start', 'dev-app', 'dev-widget'].includes(command)) {
    throw new Error(`Unknown command "${command}". Expected validate, start, dev-app, or dev-widget.`)
  }

  const setup = loadChopsticksSetup({ rootDir, topologyName })
  const networks = allNetworks(setup)
  for (const network of networks) await checkPortAvailable(network)
  ensureDatabaseDirectories(setup)
  const rpcOverrides = printRpcOverrides(setup)

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const chopsticks = startProcess(pnpm, ['exec', 'chopsticks', ...buildChopsticksArgs(setup)])
  const chopsticksExit = waitForExit(chopsticks)

  if (command === 'start') {
    const result = await chopsticksExit
    if (result.code !== 0 && result.signal === null) process.exitCode = result.code ?? 1
    return
  }

  const readiness = Promise.all(
    networks.map(async network => {
      const chain = await waitForRpc(network)
      console.log(`Ready: ${network.uid} (${chain}) at ${network.rpcUrl}`)
    }),
  )
  await Promise.race([
    readiness,
    chopsticksExit.then(({ code, signal }) => {
      throw new Error(`Chopsticks exited before its RPCs were ready (code ${code}, signal ${signal})`)
    }),
  ])

  const environment = {
    ...process.env,
    NEXT_PUBLIC_PARASPELL_RPC_OVERRIDES: rpcOverrides,
    VITE_PUBLIC_PARASPELL_RPC_OVERRIDES: rpcOverrides,
  }
  const developmentScript = command === 'dev-widget' ? 'dev-widget' : 'dev-app'
  const application = startProcess(pnpm, [developmentScript], environment)
  const firstExit = await Promise.race([chopsticksExit, waitForExit(application)])
  await shutdown(firstExit.code ?? (firstExit.signal ? 1 : 0))
}

process.once('SIGINT', () => void shutdown(130))
process.once('SIGTERM', () => void shutdown(143))

run().catch(async error => {
  if (!stopping) console.error(error instanceof Error ? error.message : error)
  await shutdown(1)
})
