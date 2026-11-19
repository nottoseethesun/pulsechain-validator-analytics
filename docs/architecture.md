# pulsechain-validator-analytics — System Architecture

pulsechain-validator-analytics answers two questions about PulseChain
validators: which address a validator's withdrawals go to, and how much PLS
validators were paid over a date range, on the consensus and execution
layers, by address.

Two companion references sit alongside this one:

- [`docs/engineering.md`](engineering.md): the files on disk, the gates,
  the tests and CI.
- [`docs/npm-project-commands.md`](npm-project-commands.md): every npm
  command and its flags.

---

## Table of Contents

- [The Tools](#the-tools)
- [The Execution Address](#the-execution-address)
- [The Payments Calculator](#the-payments-calculator)
- [Api Keys](#api-keys)
- [Technology Choices](#technology-choices)

---

## The Tools

| Tool | Where | What it answers |
| ---- | ----- | --------------- |
| The execution address | `fetch-execution-address/` | The address each validator's withdrawal credentials name. A package of its own. |
| The payments calculator | `get-validator-payments/` | The PLS paid to validators over a date range, by address: consensus layer withdrawals and execution layer priority fees. A package of its own. |

Each tool is a command line, declared with commander, beside a module that
does its work, which the tests run directly. `lib/validator-ids.js` is the
check of the validators both command lines take: each a public key, 0x and
96 hex digits, or an index.

---

## The Execution Address

`fetch-execution-address/execution-address.js` looks up each validator, by
public key or index, at the beacon chain's finalized state, through a beacon
node's api: g4mm4's unless `--beacon-url` names another. Withdrawal
credentials of the 0x01 kind name an address in their last 20 bytes; other
credentials name none. A validator that cannot be looked up gets the error
in place of its address, and the others are still looked up.

A validator's fee recipient is set in its validator client, not on the
beacon chain's record of the validator, so this tool cannot read it.

---

## The Payments Calculator

`get-validator-payments/fetch-validator-payments.js` scans every slot from
the start day's midnight UTC up to the end day's, which is not counted,
several at once:

1. It reads the genesis time, and turns the days into slots at
   `slot_interval_seconds` a slot.
2. It looks up each validator, by public key or index, at the finalized
   state.
3. For each slot's block, it adds each withdrawal to a validator named to
   the consensus layer's total for the withdrawal's address, in PLS, less
   `max_effective_balance` from one that exceeds it, a full exit's
   principal. A slot with no block is skipped.
4. For each block a validator named proposed, it reads the execution block
   from the rpc endpoint, and adds each transaction's tip, the lesser of
   its priority fee and its fee cap over the base fee (a legacy
   transaction's gas price is both), times the gas its receipt says it
   used, to the execution layer's total for the block's fee recipient.

A request that fails is tried again, four more times, after a wait that
grows with each attempt. A slot whose block still cannot be read fails the
run, rather than leaving its payments out of the totals. The settings come
from `config.json` in the folder the command line runs in, which
`readConfig` reads and `index.js` hands the calculator: the beacon api and
rpc endpoint, the seconds per slot, gwei per PLS, the principal, the slots
asked at once, and, optionally, the wait between attempts.

---

## Api Keys

The tools send no api key: the beacon api and the rpc endpoints take
none. The repo is ready for one all the same, as its sibling projects are:
the top `config.json` lists the services whose keys the programs send,
under `apiKeys`, empty today; `npm run api-keys` runs
crypto-price-fetchers' key manager, and `unlock-api-keys.sh`, a copy of
crypto-price-fetchers', keeps the password for a terminal. A key would be
kept in `api-keys.json`, which git ignores, encrypted with the owner's
password.

This repo installs [crypto-price-fetchers](https://github.com/nottoseethesun/crypto-price-fetchers)
from GitHub, pinned to a commit, as a dependency `npm install` installs,
for the key store and for the security lint's rule against printing a
secret.

---

## Technology Choices

- **Node 22 or later**, ES modules, and Node's own test runner.
- **Node's own `fetch`** for the beacon api and the rpc endpoint.
- **commander** for each command line.
