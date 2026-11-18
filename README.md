# Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

This is a collection of tools used to provide and create data on PulseChain validators and validation.

IMPORTANT: Use of anything in this directory and its sub-directories, and so on, is *at your own risk* as defined in the included file, `./LICENSE`.

For details on each tool, see the README file in each sub-directory:

- `fetch-execution-address/`: the address a validator's withdrawal
  credentials name.
- `get-validator-payments/`: the PLS paid to validators over a date range,
  by address, on the consensus and execution layers.

## Prerequisites

Node.js 22 or later.

## Installation

From the repo's top folder, and then in the folder of each tool you use:

```bash
npm install
```

The top folder's install brings the checks and the key manager, with
crypto-price-fetchers, from GitHub; each tool's brings what it runs on.
`node <tool> --help` lists a tool's options.

### Api keys

The tools send no api key today: the beacon api and the rpc endpoints
take none. Should a service that takes one be added, its key is kept in
`api-keys.json` here, which git ignores, encrypted with a password you
choose, as LP Ranger keeps its keys. The top `config.json` lists the
services under `apiKeys`; `npm run api-keys` lists their keys, never
showing their characters, and saves each one asked for; and
`source ./unlock-api-keys.sh` keeps the password for a terminal. A key is
never a setting in a file, nor a command-line argument.

## Configuration

### RPC Endpoints

Here are some options for the RPC endpoints, which, where applicable, are configured in each project's `config.json` (descriptions courtesy Grok):

Official PulseChain
<https://rpc.pulsechain.com>
Default public endpoint; high usage volume; suitable for light transactions. Average global latency ~153 ms in recent tests. Hosted in Europe (Hetzner).

PublicNode (Allnodes)
<https://pulsechain-rpc.publicnode.com>
Free community endpoint; supports high request volumes (e.g., 55M+ total requests tracked); cached responses for efficiency. Average global latency ~178 ms. Hosted via Cloudflare (global CDN).

thirdweb
<https://369.rpc.thirdweb.com>
Developer-focused; reliable for dApps and integrations; EVM-compatible. Average global latency 294 ms, strong in Europe (69 ms). Hosted via Cloudflare.

BlockScout
<https://api.scan.pulsechain.com>
Explorer-backed RPC; supports Ethereum-standard methods; good for querying blocks/transactions. Limited to specific RPC calls (e.g., no full node features). No latency benchmarks available, but integrated with PulseChain explorer.

G4mm4
<https://rpc-pulsechain.g4mm4.io>
Community/recommended for performance; often suggested in forums for faster responses during congestion. No recent global benchmarks, but user-reported as low-latency alternative.

## Test

The tests ask nothing outside your computer. The one gate that must pass
before a commit, LP Ranger's, runs the lint, the tests and the security
audits:

```bash
npm ci
npm ci --prefix fetch-execution-address
npm ci --prefix get-validator-payments
npm run check
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md): how the tools work.
- [`docs/engineering.md`](docs/engineering.md): the files, the gates, the
  tests and CI.
- [`docs/npm-project-commands.md`](docs/npm-project-commands.md): every npm
  command.
