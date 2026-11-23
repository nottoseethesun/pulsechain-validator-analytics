# Execution Address Lookup

Didn't record the Execution Address(es) of your PulseChain Validator(s), but now you need to find it/them?

The execution address is the address a validator's withdrawal credentials name, when they are of the 0x01 kind, or of the 0x02 kind, which EIP-7251 adds for a validator whose balance compounds: where the consensus layer's withdrawals go. A validator's fee recipient, where its proposed blocks' tips go, is set in its validator client, and is not on the beacon chain's record of it, so this tool cannot find it; `../get-validator-payments/` reads it from the blocks a validator proposed.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

## Run

```bash
node bin/fetch-execution-address.js --ids=12345,<public-key>
```

Run from the repo's top folder, this prints the execution addresses of
two validators, one by its index and one by its public key. The tool runs
on Node 24 or later, the program that runs JavaScript outside a browser.
Install its packages with `npm ci` here (npm is Node's package manager),
then run it through its start file in the repo's `bin/`.

### Usage of fetch-execution-address.js

`npm start -- <options>` here runs the same command line. `--help` lists
the options, with examples of its common uses and its exit codes. Check
out the details in the file header for `./fetch-execution-address.js`.

One validator's, by its index, from a beacon node on this computer:

```bash
node bin/fetch-execution-address.js --ids 12345 --beacon-url http://localhost:5052
```

The same two validators' as above, through npm, from this folder:

```bash
npm start -- --ids=12345,<public-key>
```
