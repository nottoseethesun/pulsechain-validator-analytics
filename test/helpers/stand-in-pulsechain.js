/**
 * A stand-in PulseChain beacon node and execution rpc endpoint, served on
 * this computer, for the tests of the two tools.
 * @module test/helpers/stand-in-pulsechain
 *
 * `startStandInPulseChain(chain)` serves, on a free local port, the beacon
 * api the tools read, under `/beacon-api`: the genesis time, each
 * validator by index or public key, and each slot's block; and, at `/rpc`,
 * the json-rpc methods `eth_getBlockByNumber` and
 * `eth_getTransactionReceipt`. It answers from `chain`:
 *
 * - `genesisTime`: the genesis time, in unix seconds.
 * - `validators`: each validator, `{ index, pubkey, withdrawalCredentials,
 *   withdrawableEpoch }`, its withdrawable epoch, from which its full
 *   withdrawal can come, as a string, or the beacon chain's far future,
 *   2^64 - 1, for one that has not exited. One not listed gets a 404, as a
 *   beacon node gives.
 * - `blocks`: each slot's block, by slot: `{ proposer, withdrawals,
 *   blockNumber, feeRecipient }`, its withdrawals each `{ validator_index,
 *   amount, address }`, amounts in gwei. A slot not listed gets a 404, as a
 *   slot with no block does.
 * - `executionBlocks`: each execution block, by number: `{ baseFeePerGas,
 *   transactions }`, hex quantities as json-rpc gives them.
 * - `receipts`: each transaction's gas used, by hash, as hex.
 * - `failures`: how many times a path, such as
 *   `/beacon-api/eth/v1/beacon/blocks/30`, answers 500 before it answers;
 *   `Infinity` for always.
 * - `stalled`: true to take each request and answer none, as a node that
 *   has stalled does.
 * - `stalledBodies`: true to answer each request with its status and
 *   headers and the first byte of its body, and never the rest, as a node
 *   that stalls mid-answer does.
 *
 * Every request's path is kept in `asked`, in order, and each json-rpc
 * request, `{ method, params }`, in `rpcRequests`.
 */

import http from "node:http";

/**
 * Writes a json answer.
 *
 * @param {http.ServerResponse} res - The response
 * @param {number} status - Its status
 * @param {*} body - Its body
 */
function answer(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** The beacon chain's far future epoch, 2^64 - 1: a validator's withdrawable epoch until it exits. */
const FAR_FUTURE_EPOCH = "18446744073709551615";

/**
 * Answers a beacon api request.
 *
 * @param {Object} chain - The chain
 * @param {string} path - The path, after `/beacon-api`
 * @returns {{status: number, body: *}} The answer
 */
function beaconAnswer(chain, path) {
  if (path === "/eth/v1/beacon/genesis") {
    return {
      status: 200,
      body: { data: { genesis_time: String(chain.genesisTime) } },
    };
  }
  const validator = path.match(
    /^\/eth\/v1\/beacon\/states\/finalized\/validators\/(.+)$/,
  );
  if (validator) {
    const found = (chain.validators ?? []).find(
      (v) => String(v.index) === validator[1] || v.pubkey === validator[1],
    );
    if (found === undefined)
      return { status: 404, body: { message: "NOT_FOUND" } };
    return {
      status: 200,
      body: {
        data: {
          index: String(found.index),
          validator: {
            pubkey: found.pubkey,
            withdrawal_credentials: found.withdrawalCredentials,
            withdrawable_epoch: found.withdrawableEpoch ?? FAR_FUTURE_EPOCH,
          },
        },
      },
    };
  }
  const slot = path.match(/^\/eth\/v1\/beacon\/blocks\/(\d+)$/);
  const block = slot ? chain.blocks?.[slot[1]] : undefined;
  if (block === undefined)
    return { status: 404, body: { message: "NOT_FOUND" } };
  return {
    status: 200,
    body: {
      data: {
        message: {
          proposer_index: String(block.proposer),
          body: {
            execution_payload: {
              withdrawals: block.withdrawals ?? [],
              block_number: String(block.blockNumber ?? 0),
              fee_recipient: block.feeRecipient ?? `0x${"0".repeat(40)}`,
            },
          },
        },
      },
    },
  };
}

/**
 * Answers a json-rpc request.
 *
 * @param {Object} chain - The chain
 * @param {{method: string, params: Array}} request - The request
 * @returns {Object} The answer's body
 */
function rpcAnswer(chain, request) {
  if (request.method === "eth_getBlockByNumber") {
    const block = chain.executionBlocks?.[parseInt(request.params[0], 16)];
    return { jsonrpc: "2.0", id: request.id, result: block ?? null };
  }
  if (request.method === "eth_getTransactionReceipt") {
    const gasUsed = chain.receipts?.[request.params[0]];
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: gasUsed === undefined ? null : { gasUsed },
    };
  }
  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: `No method ${request.method}` },
  };
}

/**
 * Reads a request's body.
 *
 * @param {http.IncomingMessage} req - The request
 * @returns {Promise<string>} Its body
 */
async function bodyOf(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

/**
 * Serves the stand-in chain.
 *
 * @param {Object} chain - The chain, as the module's header describes it
 * @returns {Promise<{beaconUrl: string, rpcUrl: string, asked: string[], rpcRequests: Array<{method: string, params: Array}>, close: function(): Promise<void>}>} The api's url, the endpoint's, the paths asked, the json-rpc requests answered, and how to stop it
 */
export async function startStandInPulseChain(chain) {
  const asked = [];
  const rpcRequests = [];
  const failures = { ...chain.failures };
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://stand-in").pathname;
    asked.push(path);
    if (chain.stalled === true) return;
    if (chain.stalledBodies === true) {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
      return;
    }
    if (failures[path] > 0) {
      failures[path] -= 1;
      answer(res, 500, { message: "stand-in failure" });
      return;
    }
    if (path === "/rpc") {
      const request = JSON.parse(await bodyOf(req));
      rpcRequests.push({ method: request.method, params: request.params });
      answer(res, 200, rpcAnswer(chain, request));
      return;
    }
    const beacon = path.startsWith("/beacon-api")
      ? beaconAnswer(chain, path.slice("/beacon-api".length))
      : { status: 404, body: {} };
    answer(res, beacon.status, beacon.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    beaconUrl: `${url}/beacon-api`,
    rpcUrl: `${url}/rpc`,
    asked,
    rpcRequests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
