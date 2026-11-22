# pulsechain-validator-analytics — System Architecture

pulsechain-validator-analytics answers two questions about PulseChain
validators: which address a validator's withdrawals go to, and how much PLS
validators were paid over a date range, on the consensus and execution
layers, by address. Each answer comes from a command-line tool that runs
on Node, the program that runs JavaScript outside a browser.

Two companion references sit alongside this one:

- [`docs/engineering.md`](engineering.md): the files on disk, the gates,
  the tests and CI, the checks GitHub, the website that hosts the repo,
  runs at each push.
- [`docs/npm-project-commands.md`](npm-project-commands.md): every command
  the repo's `package.json` files give npm, Node's package manager, to run,
  and its flags.

---

## Table of Contents

- [The Tools](#the-tools)
- [The Execution Address](#the-execution-address)
- [The Payments Calculator](#the-payments-calculator)
- [Api Keys](#api-keys)
- [crypto-price-fetchers](#crypto-price-fetchers)
- [Technology Choices](#technology-choices)

---

## The Tools

Each question has a tool of its own, in its own folder and package.

| Tool | Where | What it answers |
| ---- | ----- | --------------- |
| The execution address | `fetch-execution-address/` | The address each validator's withdrawal credentials name. A package of its own. |
| The payments calculator | `get-validator-payments/` | The PLS paid to validators over a date range, by address: consensus layer withdrawals and execution layer priority fees. A package of its own. |

Each tool is a command line, declared with commander, the package that reads
a command line's options and writes its help, with examples of its common
uses and its exit codes, beside a module that does its work, which the
tests run directly. `lib/validator-ids.js` is the check of the validators
both command lines take: each a public key, 0x and 96 hex digits, or an
index.

---

## The Execution Address

A validator's withdrawals go to the address its withdrawal credentials name,
which the beacon chain keeps on its record of the validator.
`fetch-execution-address/execution-address.js` looks up each validator, by
public key or index, at the beacon chain's finalized state, through a beacon
node's api: that of g4mm4's public PulseChain node, unless `--beacon-url`
names another. Withdrawal credentials of the 0x01 kind name an address in
their last 20 bytes; other credentials name none. A validator that cannot be
looked up gets the error in place of its address, and the others are still
looked up. A lookup the beacon node gives no answer to within 30 seconds
is one that cannot be.

A validator's fee recipient is set in its validator client, not on the
beacon chain's record of the validator, so this tool cannot read it.

---

## The Payments Calculator

A validator is paid in two ways: withdrawals from its balance on the
consensus layer, and the tips of the blocks it proposes, on the execution
layer. `get-validator-payments/fetch-validator-payments.js` adds up both.
It scans every slot from the start day's midnight UTC up to the end
day's, which is not counted, several at once:

1. It reads the genesis time, and turns the days into slots at
   `slot_interval_seconds` a slot. PulseChain's slots are ten seconds
   long, as its beacon node's spec says, and every block since genesis
   carries the time that predicts. So the setting is 10.
2. It looks up each validator, by public key or index, at the finalized
   state, with its withdrawable epoch, the epoch from which its full exit
   can come. One the beacon node does not know stops the run.
3. For each slot's block, it adds each withdrawal to a validator named to
   the consensus layer's total for the withdrawal's address, in PLS. A
   validator's stake, 32,000,000 PLS on PulseChain (`max_effective_balance`),
   is a deposit, not a payment: a withdrawal before the validator's
   withdrawable epoch is a partial one, of what its balance holds above the
   stake, and counts in full; its full exit, the withdrawal at or after that
   epoch, returns the whole balance, so only what it pays above the stake
   counts, none when penalties left less. `slots_per_epoch`, 32 on
   PulseChain, turns the epoch into a slot. A slot with no block is
   skipped.
4. For each block a validator named proposed, it reads the execution block
   from the rpc endpoint, the json-rpc api of an execution-layer node, and adds each transaction's tip, the lesser of
   its priority fee and its fee cap over the base fee (a legacy
   transaction's gas price is both), times the gas its receipt says it
   used, to the execution layer's total for the block's fee recipient.
5. A slot adds nothing to the totals until every read it needs has
   succeeded, so a slot tried again counts once.

A request that fails is tried again, four more times, after a wait that
grows with each attempt: a server error, a rate limit, an answer not all
there, its body included, within 30 seconds (`request_timeout_ms`), or an
endpoint that cannot give a block or a receipt it should have. Anything still unread
after every attempt, a validator, a slot's block, a proposed block or a
transaction's receipt, fails the run, rather than leaving its payments out
of the totals.

The settings come from `config.json` in the folder the command line runs
in, which `readConfig` reads and `index.js` hands the calculator: the
beacon api and rpc endpoint, the seconds per slot, gwei per PLS, the
stake, the slots per epoch, the slots asked at once, and, optionally, the
wait between attempts and the time a request may take. PulseChain's beacon node gives the chain's values
in its spec (`/eth/v1/config/spec`): SECONDS_PER_SLOT 10, SLOTS_PER_EPOCH
32, and MAX_EFFECTIVE_BALANCE 32,000,000,000,000,000 gwei, 32,000,000 PLS;
a test holds the shipped `config.json` to them.

---

## Api Keys

The tools send no api key: the beacon api and the rpc endpoints take none.
The repo is ready for one all the same, through the key store of
crypto-price-fetchers, the owner's repo of code his projects share
([crypto-price-fetchers](#crypto-price-fetchers)), set up as in
pulsechain-analytics and x1-validator-analytics, the owner's other projects
that install it: the top `config.json` lists the services whose keys the
programs send, under `apiKeys`, empty today; this repo's `npm run api-keys`
runs the store's key manager, and `unlock-api-keys.sh`, a script in the
repo's top folder and a copy of crypto-price-fetchers', keeps the password
for a terminal. A key would be kept in `api-keys.json`, which git, the
version-control program that keeps the repo's history, ignores, encrypted
with the owner's password.

---

## crypto-price-fetchers

This repo installs [crypto-price-fetchers](https://github.com/nottoseethesun/crypto-price-fetchers)
from GitHub, as a dependency the top folder's `npm install` installs, for
the key store, for the lint rules against printing a secret and against a
default made with `||` (`no-or-default`), for `run-actionlint`, which runs
actionlint, the checker of GitHub Actions workflow files, from its
official release, refused unless its SHA-256 and its program's are the
ones crypto-price-fetchers pins, and for the checks its tests make of each
command line's help and of the repo's tracked files. Each tool's package
installs it too, with the same ref, for its helpers: `dayStartSeconds`,
which reads a day written YYYY-MM-DD and refuses a day the calendar does
not have, `isHttpUrl`, `endQuietlyWhenOutputCloses`, which ends a command
line quietly when the program reading its output stops, and
`fetchWithinTimeLimit`, which sends a request and reads its whole answer
within a time limit, naming the server when the time runs out.
`package.json` names its main branch (`#main`), and `package-lock.json`
keeps the commit installed, which `npm ci` installs.
crypto-price-fetchers' versions tool, which this repo runs as
`npm run github-project-deps`, moves it: `-- main` to main's newest
commit, and `-- release` to its latest release (`#semver:*`), its highest
version tag. The tool sets the ref, then makes the lockfile again from a
fresh `node_modules`, and puts both files back if the install fails. The
tools' own folders install nothing from GitHub, so it leaves them alone.

---

## Technology Choices

- **Node 24 or later**, ES modules, and Node's own test runner.
- **Node's own `fetch`** for the beacon api and the rpc endpoint.
- **commander** for each command line.
