/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/**
 * Runs a tool's start file with `--help` as a checkout runs it after
 * `npm ci` in the tool's folder alone: from a copy of the start file in the
 * `bin/` of a temp folder, beside a link to the tool's folder, with no
 * packages of the top folder's to resolve from.
 *
 * @param {string} startFile - The start file's name in `bin/`
 * @param {string} toolFolder - The tool's folder, from the repo's top
 * @returns {import('node:child_process').SpawnSyncReturns<string>} The run
 */
function helpWithToolPackagesOnly(startFile, toolFolder) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), "pva-start-file-"));
  const link = path.join(top, toolFolder);
  try {
    fs.writeFileSync(path.join(top, "package.json"), '{"type":"module"}\n');
    fs.mkdirSync(path.join(top, "bin"));
    fs.copyFileSync(
      path.join(REPO_TOP, "bin", startFile),
      path.join(top, "bin", startFile),
    );
    fs.symlinkSync(path.join(REPO_TOP, toolFolder), link, "dir");
    return spawnSync(
      process.execPath,
      [path.join(top, "bin", startFile), "--help"],
      { cwd: top, encoding: "utf8", timeout: 30000 },
    );
  } finally {
    if (fs.existsSync(link)) fs.unlinkSync(link);
    fs.rmSync(top, { recursive: true, force: true });
  }
}

describe("the start files in bin/", () => {
  for (const [startFile, toolFolder] of [
    ["fetch-execution-address.js", "fetch-execution-address"],
    ["get-validator-payments.js", "get-validator-payments"],
  ]) {
    knownBug(
      `bin/${startFile} runs its tool with only the packages npm ci installs in ${toolFolder}/`,
      () => {
        const run = helpWithToolPackagesOnly(startFile, toolFolder);
        assert.equal(run.status, 0, run.stderr);
        assert.match(run.stdout, /^Usage: /);
      },
    );
  }
});
