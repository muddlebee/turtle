# Local Chopsticks networks

This directory contains reproducible local Substrate forks for Turtle development. Each file in `configs/` describes one network. Files in `topologies/` select which of those networks Chopsticks should connect for an XCM scenario.

The checked-in network configs are based on the upstream [Chopsticks configs](https://github.com/AcalaNetwork/chopsticks/tree/master/configs). Each file records its exact upstream source commit. Turtle-specific settings assign a stable local port and a unique SQLite database.

## Requirements

- Node.js 22 or later for Chopsticks
- Network access while a fork loads its initial state

## Commands

Validate every checked-in network config:

```bash
pnpm chopsticks:validate
```

Start a connected topology without starting Turtle:

```bash
pnpm chopsticks:start polkadot-hydration
```

Start a topology and the Turtle app together:

```bash
pnpm dev:chopsticks polkadot-hydration
```

Start a topology and the Turtle widget together:

```bash
pnpm dev-widget:chopsticks polkadot-hydration
```

When no topology is supplied, the commands use `polkadot-basic`.

The launcher waits for every local RPC, then passes the generated RPC map through `NEXT_PUBLIC_PARASPELL_RPC_OVERRIDES` and `VITE_PUBLIC_PARASPELL_RPC_OVERRIDES`. It also stops the application and all forks together when interrupted.

These variables are included in browser bundles. Use them only for local or otherwise public endpoints; never place RPC credentials in them.

## Configs and topologies

A network config is a native Chopsticks config. Its `endpoint` is the remote chain being forked; Turtle connects to the local `ws://127.0.0.1:<port>` server instead.

A topology is a small Turtle manifest for a connected XCM environment:

```yaml
relaychain: polkadot
parachains:
  - polkadot-assethub
  - hydration
```

This becomes equivalent to:

```bash
chopsticks xcm \
  --relaychain chopsticks/configs/polkadot.yml \
  --parachain chopsticks/configs/polkadot-assethub.yml \
  --parachain chopsticks/configs/hydration.yml
```

Available topologies:

- `polkadot-basic`
- `polkadot-hydration`
- `polkadot-bifrost`
- `polkadot-mythos`
- `kusama-basic`

## Adding or updating a network

1. Copy the appropriate upstream config into `configs/` and retain a source URL plus commit in its header.
2. Add a unique `host`, `port`, and `db`. Database files belong under `.chopsticks/db/`.
3. Add the Turtle UID and optional ParaSpell chain name to `networks.yml`.
4. Add the UID to a topology or create a new topology.
5. Run `pnpm chopsticks:validate` and `pnpm test:chopsticks`.

`paraspellChain` must be omitted when the installed ParaSpell SDK does not support that network. Such a fork can still be started, but it will not be added to ParaSpell's `apiOverrides`.

## Test accounts and state

The imported upstream configurations generally fund standard Substrate development accounts such as Alice. To test with another wallet, add its storage entries to the relevant network config's `import-storage` section. Asset storage differs by runtime, so keep those overrides in the corresponding network file rather than in the topology.
