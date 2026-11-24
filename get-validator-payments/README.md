# Validator Payments Calculator

Works out how much PLS was paid to the PulseChain validators named, over a
date range, by address. A validator is paid in two ways: withdrawals from
its balance on the consensus layer, and the tips of the blocks it
proposes, on the execution layer. The calculator counts both, leaving out
the stake a validator's full exit returns, which is a deposit, not a
payment.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

## Run

```bash
node ../bin/end-user/get-validator-payments.js --ids=<public-key>,12345 --start=2025-01-01 --end=2025-11-04
```

Run in this folder, where its `config.json` is, this prints what two
validators, one by its public key and one by its index, were paid from 1
January 2025 to the end of 3 November 2025, by address. The tool runs on
Node 24 or later, the program that runs JavaScript outside a browser.
Install its packages with `npm ci` here (npm is Node's package manager),
then run it here through its start file in the repo's `bin/end-user/`.

### Usage of get-validator-payments.js

`npm start -- <options>` here runs the same command line. `--help` lists
the options, with examples of its common uses and its exit codes. For
details, see the file header doc in `index.js`.

What one validator was paid on one day, a range of 8,640 slots:

```bash
node ../bin/end-user/get-validator-payments.js --ids 12345 --start 2026-11-20 --end 2026-11-21
```

The same day, through npm:

```bash
npm start -- --ids 12345 --start 2026-11-20 --end 2026-11-21
```

## Config

The calculator reads its settings from `config.json` in the folder it runs
in: the beacon api, through which a consensus-layer node answers, and the
rpc endpoint, through which an execution-layer node answers, that it asks,
the seconds per slot, and how many slots it asks at once, among others. The
file header of `fetch-validator-payments.js` describes them. The file is
checked against its JSON Schema, `SETTINGS_SCHEMA` in
`fetch-validator-payments.js`, before the calculator takes a setting: a
setting missing, a key the schema does not name, such as a misspelled one,
or a value of the wrong kind stops the run, with every problem listed. The
parent folder's README lists other public rpc endpoints.
