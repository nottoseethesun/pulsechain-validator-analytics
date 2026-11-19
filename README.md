# PulseChain Validator Analytics

[![Lint (JS+MD)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/ci.yml?branch=main&label=lint)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/ci.yml)
[![Tests (Node 22/24)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/ci.yml?branch=main&label=tests)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/security-audit.yml?branch=main&label=security)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/security-audit.yml)

## Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

Tools that answer two questions about PulseChain validators: which address
a validator's withdrawals go to, and how much PLS validators were paid over
a date range, by address.

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

The payments calculator asks an rpc endpoint about every block a
validator proposed in its range, and a busy public endpoint can turn
requests away with HTTP 429, its rate limit. Each tool's `config.json`
names the endpoints it asks: g4mm4's, for both the beacon api and the rpc
endpoint, unless changed. These public rpc endpoints can stand in. The
latencies are worldwide averages measured when this list was written.

- **Official PulseChain**, <https://rpc.pulsechain.com>: the default public
  endpoint, and heavily used. Hosted in Europe (Hetzner); about 153 ms.
- **PublicNode (Allnodes)**, <https://pulsechain-rpc.publicnode.com>: a
  free community endpoint that caches its answers. Served through
  Cloudflare; about 178 ms.
- **thirdweb**, <https://369.rpc.thirdweb.com>: thirdweb's endpoint, for
  apps built on its tools. Served through Cloudflare; about 294 ms, and
  69 ms from Europe.
- **BlockScout**, <https://api.scan.pulsechain.com>: the endpoint of
  PulseChain's block explorer. It answers the standard methods for blocks
  and transactions, but not every method a full node answers. No latency
  was measured.
- **G4mm4**, <https://rpc-pulsechain.g4mm4.io>: a community endpoint, which
  users in forums report answers quickly when the chain is busy. No latency
  was measured.

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

The `docs/` folder holds three references:

- [`docs/architecture.md`](docs/architecture.md): how the tools work.
- [`docs/engineering.md`](docs/engineering.md): the files, the gates, the
  tests and CI.
- [`docs/npm-project-commands.md`](docs/npm-project-commands.md): every npm
  command.
