# Execution Address Lookup

Didn't record the Execution Address(es) of your PulseChain Validator(s), but now you need to find it/them?

The execution address is the address a validator's withdrawal credentials name, when they are of the 0x01 kind: where the consensus layer's withdrawals go. A validator's fee recipient, where its proposed blocks' tips go, is set in its validator client, and is not on the beacon chain's record of it, so this tool cannot find it; `../get-validator-payments/` reads it from the blocks a validator proposed.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

The tool runs on Node 24 or later, the program that runs JavaScript
outside a browser. Install its packages with `npm install` here (npm is
Node's package manager), then:

```bash
node fetch-execution-address.js --ids=12345,0xYourPubKey1
```

`--help` lists the options, with examples of its common uses and its exit
codes. Check out the details in the file header for
`./fetch-execution-address.js`.
