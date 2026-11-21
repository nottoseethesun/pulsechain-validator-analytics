# PulseChain Validator Analytics

![Elrond stands on a moonlit stone balcony of an Elven fortress, wearing flowing robes in deep blues, purples, and magentas. He holds his hands open as a continuous stream of luminous digital data—glowing lines, hexagons, charts, and symbols in cyan, blue, purple, and magenta—flows through them under a bright full moon, with waterfalls and ornate Elven architecture visible behind him.](./assets/images/elrond-validates_1280-640.jpeg "PulseChain Validator Analytics")

[![Lint (JS+MD)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/ci.yml?branch=main&label=lint)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/ci.yml)
[![Tests (Node 24/26)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/ci.yml?branch=main&label=tests)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/security-audit.yml?branch=main&label=security)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/security-audit.yml)

## Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

Tools that answer two questions about PulseChain validators: which address
a validator's withdrawals go to, and how much PLS validators were paid over
a date range, by address.

IMPORTANT: Use of anything in this directory and its sub-directories, and so
on, is *at your own risk* as defined in the included file, `./LICENSE`.

For details on each tool, see the README file in each sub-directory:

- `fetch-execution-address/`: the address a validator's withdrawal
  credentials name.
- `get-validator-payments/`: the PLS paid to validators over a date range,
  by address, on the consensus and execution layers.

## Prerequisites

Node 24 or later: the program that runs JavaScript outside a browser, on
which the tools run.

## Installation

npm, Node's package manager, installs the packages each `package.json`
lists and runs the repo's commands. From the repo's top folder, and then in
the folder of each tool you use:

```bash
npm install
```

The top folder's install brings the checks, and, from GitHub, the website
that hosts the owner's code, crypto-price-fetchers, the owner's repo of
code his projects share. This repo runs two of its tools: its key manager,
which saves and lists the api keys, and its versions tool, which moves
crypto-price-fetchers to its newest main or its latest release. Each
tool's install brings what the tool runs on. `node <tool> --help`, or
`npm start -- --help` in a tool's folder, lists a tool's options, with
examples of its common uses and its exit codes.

### Choosing Versions of Dependencies that are Raw Github Projects

This step is entirely optional: `npm install` already installs everything
the tools need.

crypto-price-fetchers is installed straight from its GitHub project,
rather than from the npm registry, by the top folder. `package.json` names
it with a ref: `#main`, its main branch, which this repo follows, or
`#semver:*`, its latest release, its highest version tag.
`package-lock.json` keeps the commit the ref named when the lockfile was
made, and `npm ci` installs that commit.

crypto-price-fetchers also holds the tool that moves it: its versions
tool, which this repo runs as `npm run github-project-deps`. To move to
the newest commit of main, or to switch to the latest release, from the
repo's top folder:

```bash
npm run github-project-deps -- main
npm run github-project-deps -- release
```

Each sets the ref, then makes `package-lock.json` again from a fresh
`node_modules`, so the newest commit of main, or the newest release, is
installed. If the install fails, as it does for a release whose top folder
has no package.json, `package.json` and `package-lock.json` go back as they
were, and `node_modules` is installed again from them. The tools' own
folders install nothing from GitHub, so it leaves them alone.
`npm run github-project-deps -- --help` says more.

### Api keys

The tools send no api key today: the beacon api, through which a
consensus-layer node answers, and the rpc endpoints, through which an
execution-layer node answers json-rpc calls about blocks and transactions,
take none. Should a service that takes one be added, its key is kept in
`api-keys.json` here, which git, the version-control program that keeps the
repo's history, ignores, encrypted with a password you choose, by
crypto-price-fetchers' key store, which keeps keys as LP Ranger, the owner's
bot that manages his 9mm V3 liquidity positions, keeps its own. The top
`config.json` lists the services under `apiKeys`; this repo's
`npm run api-keys` runs the store's key manager, which lists their keys,
never showing their characters, and saves each one asked for; and
`source ./unlock-api-keys.sh`, a script in the repo's top folder, keeps the
password for a terminal. A key is never a setting in a file, nor a
command-line argument.

## Configuration

### RPC Endpoints

The payments calculator (`get-validator-payments/`) asks an rpc endpoint
about every block a validator proposed in its range, and a busy public
endpoint can turn requests away with HTTP 429, its rate limit. Each tool's
`config.json` names the endpoints it asks: those of g4mm4, a PulseChain node
operator that serves public endpoints, for both the beacon api and the rpc
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
  tests and CI, the checks GitHub Actions, GitHub's service for running
  them, runs at each push.
- [`docs/npm-project-commands.md`](docs/npm-project-commands.md): every npm
  command.
