/**
 * Tests that hold the repo's tracked files to the owner's rules, by the
 * checks of crypto-price-fetchers, the owner's repo of code his projects
 * share (`crypto-price-fetchers/lib/repo-checks`): every EVM address in
 * EIP-55's form, every npm target named in `docs/npm-project-commands.md`,
 * and every test file and helper named in the docs.
 * @module test/repo-checks.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  addressesNotInEip55,
  npmTargetsMissingFromDocs,
  testFilesMissingFromDocs,
} from "crypto-price-fetchers/lib/repo-checks";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

describe("the repo's tracked files", () => {
  it("write every EVM address in EIP-55's form", () => {
    assert.deepEqual(addressesNotInEip55(REPO_TOP), []);
  });

  it("name every npm target in docs/npm-project-commands.md", () => {
    assert.deepEqual(
      npmTargetsMissingFromDocs(REPO_TOP, "docs/npm-project-commands.md"),
      [],
    );
  });

  it("name every test file and test helper in docs/engineering.md or CLAUDE.md", () => {
    assert.deepEqual(
      testFilesMissingFromDocs(REPO_TOP, ["docs/engineering.md", "CLAUDE.md"]),
      [],
    );
  });
});
