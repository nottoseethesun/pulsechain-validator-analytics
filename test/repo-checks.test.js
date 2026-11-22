/**
 * Tests that hold the repo's tracked files to the owner's rules, by the
 * checks of crypto-price-fetchers, the owner's repo of code his projects
 * share (`crypto-price-fetchers/lib/repo-checks`): every EVM address in
 * EIP-55's form, every npm target named in `docs/project-commands.md`,
 * every test file and helper named in the docs, every link and path in
 * the docs pointing at a file, folder or heading the repo keeps, and a
 * config-example.json beside every config.json, holding what a committed
 * config.json holds.
 * @module test/repo-checks.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  addressesNotInEip55,
  configExampleProblems,
  localReferencesMissing,
  npmTargetsMissingFromDocs,
  testFilesMissingFromDocs,
} from "crypto-price-fetchers/lib/repo-checks";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

describe("the repo's tracked files", () => {
  it("write every EVM address in EIP-55's form", () => {
    assert.deepEqual(addressesNotInEip55(REPO_TOP), []);
  });

  it("name every npm target in docs/project-commands.md", () => {
    assert.deepEqual(
      npmTargetsMissingFromDocs(REPO_TOP, "docs/project-commands.md"),
      [],
    );
  });

  it("name every test file and test helper in docs/engineering.md or CLAUDE.md", () => {
    assert.deepEqual(
      testFilesMissingFromDocs(REPO_TOP, ["docs/engineering.md", "CLAUDE.md"]),
      [],
    );
  });

  it("point the docs' links and paths only at files, folders and headings the repo keeps", () => {
    assert.deepEqual(localReferencesMissing(REPO_TOP), []);
  });

  it("ship a config-example.json beside each config.json, holding what a committed config.json holds", () => {
    assert.deepEqual(configExampleProblems(REPO_TOP), []);
  });
});
