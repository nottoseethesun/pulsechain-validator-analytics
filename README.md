# Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

This is a collection of tools used to provide and create data on PulseChain validators and validation.

IMPORTANT: Use of anything in this directory and its sub-directories, and so on, is *at your own risk* as defined in the included file, `./LICENSE`.

For details on each tool, see the README file in each sub-directory.

## Configuration

### RPC Endpoints

Here are some options for the RPC endpoints, which, where applicable, are configured in each project's `config.json` (descriptions courtesy Grok):

Official PulseChain
https://rpc.pulsechain.com
Default public endpoint; high usage volume; suitable for light transactions. Average global latency ~153 ms in recent tests. Hosted in Europe (Hetzner).

PublicNode (Allnodes)
https://pulsechain-rpc.publicnode.com
Free community endpoint; supports high request volumes (e.g., 55M+ total requests tracked); cached responses for efficiency. Average global latency ~178 ms. Hosted via Cloudflare (global CDN).

thirdweb
https://369.rpc.thirdweb.com
Developer-focused; reliable for dApps and integrations; EVM-compatible. Average global latency 294 ms, strong in Europe (69 ms). Hosted via Cloudflare.

BlockScout
https://api.scan.pulsechain.com
Explorer-backed RPC; supports Ethereum-standard methods; good for querying blocks/transactions. Limited to specific RPC calls (e.g., no full node features). No latency benchmarks available, but integrated with PulseChain explorer.

G4mm4
https://rpc.g4mm4.io
Community/recommended for performance; often suggested in forums for faster responses during congestion. No recent global benchmarks, but user-reported as low-latency alternative.
