# Environment variables

Environment files are package-specific. Create only the files needed for the package you are running:

```bash
cp app/.env.local.example app/.env.local
cp widget/.env.local.example widget/.env.local
```

The example files are the source of truth for the variables supported by each package:

- [`app/.env.local.example`](../app/.env.local.example)
- [`widget/.env.local.example`](../widget/.env.local.example)

Restart the development server after changing an environment file. Public variables are embedded into browser bundles at build time, so deployed changes require a rebuild. Never put credentials in variables prefixed with `NEXT_PUBLIC_` or `VITE_PUBLIC_`.

## ParaSpell RPC overrides

ParaSpell owns the default RPC providers for supported chains. Turtle currently supplies `wss://hydration-rpc.n.dwellir.com` as a healthy Hydration fallback because the Hydration providers bundled with the installed ParaSpell release are unavailable.

To replace that fallback or override another ParaSpell chain, configure a public JSON map of ParaSpell chain names to WebSocket URLs.

For the app, set the following in `app/.env.local` or in the deployment environment:

```dotenv
NEXT_PUBLIC_PARASPELL_RPC_OVERRIDES='{"Hydration":"wss://your-rpc.example"}'
```

For the widget development package, set the following in `widget/.env.local` or in its build environment:

```dotenv
VITE_PUBLIC_PARASPELL_RPC_OVERRIDES='{"Hydration":"wss://your-rpc.example"}'
```

Multiple chains can be configured in the same map:

```dotenv
NEXT_PUBLIC_PARASPELL_RPC_OVERRIDES='{"Hydration":"wss://hydration-rpc.n.dwellir.com","AssetHubPolkadot":"wss://your-asset-hub-rpc.example"}'
```

RPC selection follows this precedence:

1. An explicit entry in the package's environment variable.
2. Turtle's Hydration fallback.
3. ParaSpell's default provider for chains not covered above.

The override parser accepts only `ws:` and `wss:` URLs and rejects unknown ParaSpell chain names. These values are visible in the browser, so use only public endpoints without embedded credentials.

The [Chopsticks launcher](../chopsticks/README.md) sets both variables automatically to its local WebSocket endpoints.
