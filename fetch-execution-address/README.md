# Overview

Didn't record the Execution Address(es) of your PulseChain Validator(s), but now you need to find it/them?

The execution address is the address a validator's withdrawal credentials name, when they are of the 0x01 kind: where the consensus layer's withdrawals go. A validator's fee recipient, where its proposed blocks' tips go, is set in its validator client, and is not on the beacon chain's record of it, so this tool cannot find it; `../get-validator-payments/` reads it from the blocks a validator proposed.

IMPORTANT: Use at your own risk as defined in the included file, `../LICENSE`.

Install with `npm install` here (Node.js 22 or later), then:

```bash
node fetch-execution-address.js --ids=12345,0xYourPubKey1
```

`--help` lists the options. Check out the details in the file header for `./fetch-execution-address.js`.
