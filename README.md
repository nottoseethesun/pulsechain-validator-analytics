# PulseChain Validator Analytics

![Elrond stands on a moonlit stone balcony of an Elven fortress, wearing flowing robes in deep blues, purples, and magentas. He holds his hands open as a continuous stream of luminous digital data—glowing lines, hexagons, charts, and symbols in cyan, blue, purple, and magenta—flows through them under a bright full moon, with waterfalls and ornate Elven architecture visible behind him.](./assets/images/elrond-validates_1280-640.jpeg "PulseChain Validator Analytics")

[![Lint (JS+MD)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/ci.yml?branch=main&label=lint)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/ci.yml)
[![Tests (Node 24/26)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/ci.yml?branch=main&label=tests)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/nottoseethesun/pulsechain-validator-analytics/security-audit.yml?branch=main&label=security)](https://github.com/nottoseethesun/pulsechain-validator-analytics/actions/workflows/security-audit.yml)

## Overview

Tools that answer two questions about PulseChain validators: which address
a validator's withdrawals go to, and how much PLS, PulseChain's coin,
validators were paid over a date range, by address.

- The address lookup, `fetch-execution-address/`, finds the execution
  address a validator's withdrawal credentials name, the address its
  withdrawals are paid to.
- The payments calculator, `get-validator-payments/`, works out the PLS
  paid to validators over a date range, by address: their withdrawals on
  the consensus layer, the chain's proof-of-stake side, less the stake a
  full exit returns, and the priority fees of the blocks they proposed on
  the execution layer, the side that runs transactions.

The tools run on Node, the program that runs JavaScript outside a
browser. They ask a beacon node, which answers for the consensus layer,
and an rpc endpoint, which answers for the execution layer's blocks and
transactions through json-rpc, a format for calling a program's methods
over the web in JSON: by default, those of g4mm4, a PulseChain node
operator that serves public endpoints.

### The Scripts

The programs you run from a terminal are in `bin/`. Each has a
sub-section below; [Run](#run) shows each at work.

#### fetch-execution-address.js

The address lookup: it prints the execution address each validator's
withdrawal credentials name, the address its withdrawals are paid to. Its
code is the package in `fetch-execution-address/`, which this start file
loads.

#### get-validator-payments.js

The payments calculator: it works out the PLS paid to validators over a
date range, by address. Its code is the package in
`get-validator-payments/`, which this start file loads.

#### manage-api-keys.js

The key manager, crypto-price-fetchers': it lists the api keys the top
`config.json` names, saved or not, never showing a key's characters, and
saves each key typed, encrypted with your password. The tools send no key
today, so the list is empty.

#### unlock-api-keys.sh

The script that keeps the key store's password for a terminal, so the
programs open their keys without asking. It runs with `source`, in bash
or zsh.

## Table of Contents

- [Overview](#overview)
  - [The Scripts](#the-scripts)
    - [fetch-execution-address.js](#fetch-execution-addressjs)
    - [get-validator-payments.js](#get-validator-paymentsjs)
    - [manage-api-keys.js](#manage-api-keysjs)
    - [unlock-api-keys.sh](#unlock-api-keyssh)
- [Disclaimer](#disclaimer)
- [Screenshot](#screenshot)
- [Prerequisites](#prerequisites)
- [Install](#install)
  - [Api Keys](#api-keys)
- [Optional: Verify Download](#optional-verify-download)
- [Update](#update)
  - [Versions of crypto-price-fetchers](#versions-of-crypto-price-fetchers)
- [Uninstall](#uninstall)
- [Run](#run)
  - [fetch-execution-address.js](#fetch-execution-addressjs-1)
    - [Usage of fetch-execution-address.js](#usage-of-fetch-execution-addressjs)
  - [get-validator-payments.js](#get-validator-paymentsjs-1)
    - [Usage of get-validator-payments.js](#usage-of-get-validator-paymentsjs)
  - [manage-api-keys.js](#manage-api-keysjs-1)
    - [Usage of manage-api-keys.js](#usage-of-manage-api-keysjs)
  - [unlock-api-keys.sh](#unlock-api-keyssh-1)
    - [Usage of unlock-api-keys.sh](#usage-of-unlock-api-keyssh)
- [Configure](#configure)
  - [RPC Endpoints](#rpc-endpoints)
- [Lint & Test](#lint--test)
- [Private Key Security](#private-key-security)
- [Development](#development)
  - [Architecture and Engineering References](#architecture-and-engineering-references)
- [License](#license)
- [Road Map](#road-map)
- [Donations](#donations)
- [Contributing](#contributing)

---

## Disclaimer

USE AT YOUR OWN RISK: this software is provided "as is", without warranty
of any kind, as its [license](LICENSE) says. It has not been formally
audited and may contain bugs. Its figures come from the beacon node and
the rpc endpoint it asks, which can be wrong or fail: check them before
you rely on them, for your taxes or for anything else.

---

## Screenshot

The tools print to the terminal, and the repo has no picture of a run.
The address lookup prints a line per validator, each address in EIP-55's
mixed case, as LP Ranger writes addresses:

```text
Validator Execution Addresses:
- ID <validator>: <execution address>
```

The payments calculator logs its progress, then prints its totals, in
PLS, each as exact decimal text, by address in EIP-55's mixed case, as
JSON, last:

```text
{
  "consensus": {
    "<withdrawal address>": "<PLS withdrawn, less the stake a full exit returns>"
  },
  "execution": {
    "<fee recipient>": "<PLS of priority fees>"
  }
}
```

---

## Prerequisites

- A terminal.
- Node 24 or later, from [nodejs.org](https://nodejs.org/), with npm, the
  package manager that comes with it, which installs a project's packages
  and runs the commands its `package.json` names. The repo is tested on
  Node 24 and 26.
- git, the version-control program, to clone the repo from GitHub, the
  website that hosts it.
- The validators' indices or public keys.

---

## Install

Clone the repo, then, from its top folder, install the top folder's
packages, then each tool's. npm installs the packages each folder's
`package.json` lists, at the versions its `package-lock.json` keeps:

```bash
git clone https://github.com/nottoseethesun/pulsechain-validator-analytics.git
cd pulsechain-validator-analytics
npm ci
npm ci --prefix fetch-execution-address
npm ci --prefix get-validator-payments
```

The top folder's install brings what the gate runs
([Lint & Test](#lint--test)), including, from GitHub,
crypto-price-fetchers, the owner's repo of code his projects share. From
crypto-price-fetchers, this repo runs its key manager, which saves and
lists the api keys; its versions tool, which moves crypto-price-fetchers
to its newest commit of main or its latest release; its bin
`run-actionlint`, which the lint runs; and its checks of each command
line's help and of the repo's tracked files, which the tests run. Each
tool's install brings what the tool runs on: commander, the package that
reads its command line, and crypto-price-fetchers, whose helpers check a
day, an url and a settings file, and give each request its time limit.

### Api Keys

The tools send no api key today: the beacon node and the rpc endpoints
take none. Should a service that takes one be added, its key is kept in
`api-keys.json` here, which git ignores, encrypted with a password you
choose, by crypto-price-fetchers' key store, which keeps keys as LP
Ranger, the owner's bot that manages his 9mm V3 liquidity positions,
keeps its own. The top `config.json` lists the services under `apiKeys`;
this repo's `npm run api-keys` runs the store's key manager, which lists
their keys, never showing their characters, and saves each one asked for;
and `source ./bin/unlock-api-keys.sh`, a script in the repo's `bin/`,
keeps the password for a terminal. A key is never a setting in a file,
nor a command-line argument.

---

## Optional: Verify Download

Shows that your clone is at the commit GitHub has, and that the packages
npm installed are the ones the lockfiles name.

git names each commit by a hash of its files and its history, so a
commit's name changes when any of its files does, and two clones at
commits of the same name hold the same files. From the repo's top folder,
these print the commit you have and the commit GitHub has for `main`; the
same 40 characters in both mean you hold the code GitHub holds:

```bash
git rev-parse HEAD
git ls-remote https://github.com/nottoseethesun/pulsechain-validator-analytics.git main
```

`npm ci` checks every package it downloads from npm's registry against
the hash `package-lock.json` keeps for it, its `integrity`, and stops when
one differs. crypto-price-fetchers comes from GitHub instead, at the
commit each lockfile names. actionlint, the checker of GitHub Actions
workflow files that the lint runs, is downloaded by crypto-price-fetchers'
bin `run-actionlint`, which refuses it unless its SHA-256 is the one that
repo pins.

---

## Update

From the repo's top folder, take the newest commit of `main`, then install
the packages its lockfiles name:

```bash
git pull
npm ci
npm ci --prefix fetch-execution-address
npm ci --prefix get-validator-payments
```

The calculator's `config.json` is a file git keeps: when a newer commit
changes it too, `git pull` stops rather than write over your change, and
`git stash`, then `git pull`, then `git stash pop` carries your change
across.

### Versions of crypto-price-fetchers

The top folder and each tool's folder install crypto-price-fetchers
straight from its GitHub project, rather than from npm's registry, at the
commit each lockfile names, so this step is optional. Each `package.json`
names it with the same ref: `#main`, its main branch,
which this repo follows, or `#semver:*`, its latest release, its highest
version tag. Each `package-lock.json` keeps the commit the ref named when
the lockfile was made, and `npm ci` installs that commit.

crypto-price-fetchers also holds the tool that moves it: its versions
tool, which this repo runs as `npm run github-project-deps`. It sets the
ref in each folder's `package.json`, then makes each `package-lock.json`
again from a fresh `node_modules`. If an install fails, every
`package.json` and `package-lock.json` goes back as it was, and
`node_modules` is installed again from them. From the repo's top folder,
the newest commit of main:

```bash
npm run github-project-deps -- main
```

The latest release:

```bash
npm run github-project-deps -- release
```

No release can be installed yet: every release of crypto-price-fetchers,
the newest being 1.3.0, came before its `package.json`, so `release`
fails, and the files go back as they were. It works once a release with a
`package.json` is tagged.

---

## Uninstall

From the folder that holds it, delete the repo's folder:

```bash
rm -rf pulsechain-validator-analytics
```

---

## Run

The programs are in `bin/`. Each sub-section below covers one: first an
example of how to run it, then what it does, and, under its Usage, more
examples, of the options and cases that take more. Each command line answers `--help` with its options, more
examples and its exit codes, and
[`docs/project-commands.md`](docs/project-commands.md) lists every
command with its flags. A validator is named by its index, such as
`12345`, or its public key, `0x` and 96 hex digits; several are separated
by commas.

### fetch-execution-address.js

```bash
node bin/fetch-execution-address.js --ids 12345
```

This prints the execution address of one validator, by its index, run
from the repo's top folder. `bin/fetch-execution-address.js`, the address lookup, prints the
execution address each validator's withdrawal credentials name, read from
the beacon node at `--beacon-url`, g4mm4's unless given. It runs from any
folder. `npm start -- <options>`, in `fetch-execution-address/`, runs the
same command line.

#### Usage of fetch-execution-address.js

The addresses of two validators, one by index and one by public key,
from a beacon node on this computer:

```bash
node bin/fetch-execution-address.js --ids 12345,<public-key> --beacon-url http://localhost:5052
```

The same first lookup, through npm, from the tool's folder:

```bash
cd fetch-execution-address
npm start -- --ids 12345
```

### get-validator-payments.js

```bash
cd get-validator-payments
node ../bin/get-validator-payments.js --ids 12345,12346 --start 2026-10-01 --end 2026-11-01
```

This prints what two validators were paid in October 2026, by address.
`bin/get-validator-payments.js`, the payments calculator, works out the
PLS paid to the validators named, from the first day counted to the day
the count stops before, each `YYYY-MM-DD` in UTC, by address. It reads
its settings from `config.json` in the folder it runs in
([Configure](#configure)), so it runs from `get-validator-payments/`,
which holds the one shipped. `npm start -- <options>` in that folder runs
the same command line.

#### Usage of get-validator-payments.js

It asks the beacon node for every slot of the range, one request each,
8,640 for a day of 10-second slots; and, for each block a validator named
proposed, the rpc endpoint for the block and for each of its
transactions' receipts. What one validator was paid on one day, a range
of 8,640 slots:

```bash
node ../bin/get-validator-payments.js --ids 12345 --start 2026-11-20 --end 2026-11-21
```

The same day, through npm:

```bash
npm start -- --ids 12345 --start 2026-11-20 --end 2026-11-21
```

### manage-api-keys.js

```bash
npm run api-keys
```

This lists each key the top `config.json` names, saved or not, never
showing its characters, and asks for each one not saved: `npm run
api-keys` runs `bin/manage-api-keys.js`, the key manager. The tools send
no key today, so it lists none.

#### Usage of manage-api-keys.js

Whether the password kept for the terminal opens every saved key, by its
exit code, 0 when it does; while no key is saved, any password does:

```bash
npm run api-keys -- check-password
```

Its commands, with examples and its exit codes:

```bash
npm run api-keys -- --help
```

### unlock-api-keys.sh

```bash
source ./bin/unlock-api-keys.sh
```

This asks for the key store's password, showing nothing of what is
typed, checks that it opens the keys saved, and keeps it for the terminal
in `API_KEYS_PASSWORD`. `bin/unlock-api-keys.sh` runs with `source`,
since a script run as a program cannot set anything in the terminal that
started it.

#### Usage of unlock-api-keys.sh

The same from any other folder, by the script's path:

```bash
source /path/to/pulsechain-validator-analytics/bin/unlock-api-keys.sh
```

Its help, which asks nothing and keeps no password:

```bash
source ./bin/unlock-api-keys.sh --help
```

---

## Configure

The address lookup takes its one setting, the beacon node, from
`--beacon-url`. The payments calculator reads `config.json` in the folder
it runs in, `get-validator-payments/config.json` in the examples. Before it
takes a setting, it checks the file against its JSON Schema, a
description of the keys the file may hold and the kind of value each
takes: a missing file, a setting missing, a key it does not read, or a
value of the wrong kind stops the run, with every problem listed, one
line each.

| Setting | What it sets |
| ------- | ------------ |
| `beacon_url` | the beacon node's api it asks |
| `rpc_url` | the rpc endpoint it asks |
| `slot_interval_seconds` | the length of the chain's slots, which turns a date into a slot: 10 on PulseChain |
| `slots_per_epoch` | the slots in an epoch, which turns a validator's withdrawable epoch into a slot: 32 on PulseChain |
| `max_effective_balance` | the stake, in PLS, which a full exit returns and the calculator leaves out of the payments: 32,000,000 on PulseChain |
| `gwei_to_pls` | the gwei in one PLS, a power of ten from 1 to 10^15: 1,000,000,000 |
| `concurrency` | how many requests it has open at once |
| `retry_delay_ms`, optional | the wait before a failed request is tried again, times its attempt, in milliseconds, from 0 to 536870911, so its longest wait, 4 times it, is one Node's timers keep: 1000 when absent |
| `request_timeout_ms`, optional | how long a request may take, its whole answer read, before it counts as failed, in milliseconds, from 1 to 2147483647, the longest Node's timers keep: 30000 when absent |

The top `config.json` holds only `apiKeys`, the services whose keys the
key store keeps: none today. Beside each `config.json` is a
`config-example.json`, which git keeps, holding the same settings, the
defaults the repo ships: copy it over `config.json` to go back to them.

### RPC Endpoints

The calculator asks its rpc endpoint for blocks and receipts through two
json-rpc methods, `eth_getBlockByNumber` and `eth_getTransactionReceipt`,
which a PulseChain full node answers. Its default is g4mm4's,
<https://rpc-pulsechain.g4mm4.io>. A busy public endpoint can turn
requests away with HTTP 429, its rate limit. When the calculator meets
it, lower `concurrency`, or name another endpoint in `rpc_url`, such as
one of these public ones:

- **PulseChain**, <https://rpc.pulsechain.com>: the endpoint on
  PulseChain's own domain.
- **PublicNode**, <https://pulsechain-rpc.publicnode.com>: run by
  Allnodes, a company that hosts blockchain nodes.
- **thirdweb**, <https://369.rpc.thirdweb.com>: run by thirdweb, a company
  that makes tools for building apps on blockchains; 369 is PulseChain's
  chain id.

PulseChain's block explorer, BlockScout, answers json-rpc too, at
<https://api.scan.pulsechain.com/api/eth-rpc>, but only
`eth_blockNumber`, `eth_getBalance` and `eth_getLogs`, as its
[api page](https://api.scan.pulsechain.com/eth-rpc-api-docs) lists, so it
cannot serve the calculator.

---

## Lint & Test

The gate, LP Ranger's, runs the lint, the tests and the security audits,
and must pass before every commit and push. The lint runs ESLint, which
checks JavaScript against rules; markdownlint, which checks the form of
Markdown files; the check of Prettier, a program that formats code;
actionlint, which checks the GitHub Actions workflow files; and knip,
which finds files nothing uses. From the repo's top folder, after the
installs:

```bash
npm run lint      # the linters above
npm test          # the tests, on Node's test runner
npm run check     # the whole gate, as CI runs it
```

The tests ask nothing outside your computer: the tools run against a
stand-in beacon node and rpc endpoint served locally.
[`docs/engineering.md`](docs/engineering.md) lists the tests.

---

## Private Key Security

The tools hold no private key: they read what the chain says of
validators, which anyone can read, and print it. They need only the
validators' indices or public keys, which are public.

No api key is sent today. Should one be added, it is kept as
[Api Keys](#api-keys) describes: encrypted in `api-keys.json` by
AES-256-GCM with a key made from your password by PBKDF2-SHA512 at
600,000 rounds, as LP Ranger keeps its keys, with the password kept
nowhere on disk.

---

## Development

The repo follows the coding standards of LP Ranger: its `CLAUDE.md` and
everything under its `docs/claude/`.

### Architecture and Engineering References

The `docs/` folder holds three references:

- [`docs/architecture.md`](docs/architecture.md): how the tools work.
- [`docs/engineering.md`](docs/engineering.md): the files, the gates, the
  tests and CI: the checks GitHub runs, through its GitHub Actions
  service, at each push.
- [`docs/project-commands.md`](docs/project-commands.md): every command,
  with its flags and an example.

---

## License

Licensed under the MIT License. See [LICENSE](LICENSE) for the full text.

---

## Road Map

The repo lists no planned work yet, and no bug is known.

---

## Donations

The owner takes donations for his projects at the address in
[LP Ranger's Donations](https://github.com/nottoseethesun/lp-ranger#donations).

---

## Contributing

Bug reports and ideas for new features and improvements are welcome, in
the [Issues](https://github.com/nottoseethesun/pulsechain-validator-analytics/issues)
tab. A change must pass `npm run check` ([Lint & Test](#lint--test)).
