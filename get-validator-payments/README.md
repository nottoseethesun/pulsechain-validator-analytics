# Validator Payments Calculator

Works out how much PLS was paid to the PulseChain validators named, over a
date range, by address. A validator is paid in two ways: withdrawals from
its balance on the consensus layer, and the tips of the blocks it
proposes, on the execution layer. The calculator counts both.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

Install with `npm install` here (Node.js 22 or later), then:

```bash
node index.js --ids=0xKey1,12345 --start=2025-01-01 --end=2025-11-04
```

`--help` lists the options. For details, see the file header doc in `index.js`.

## Config

The calculator reads its settings from `config.json` in the folder it runs
in: the beacon api and rpc endpoint it asks, the seconds per slot, and how
many slots it asks at once, among others. The file header of
`fetch-validator-payments.js` describes them. The parent folder's README
lists other public rpc endpoints.
