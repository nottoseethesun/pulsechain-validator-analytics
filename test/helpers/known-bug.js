/**
 * Declares a test of a known bug, for Node's test runner.
 * @module test/helpers/known-bug
 *
 * A known-bug test states what the code should do, in a check made of
 * assertions, and passes while the code still does the wrong thing, which
 * is while the check fails on one of its assertions. Once the code does the
 * right thing, the check passes and the test fails, saying so. That is the
 * cue to declare the test with `it` instead, in the same change as the fix,
 * so it then guards the fix. A check that fails with any other error fails
 * the test too, since the check then no longer tests the bug.
 */

import { it } from "node:test";
import assert from "node:assert/strict";

/**
 * Declares a known-bug test.
 *
 * @param {string} name - What the code should do
 * @param {function(): (void|Promise<void>)} check - Asserts that it does
 */
export function knownBug(name, check) {
  it(`known bug: ${name}`, async () => {
    try {
      await check();
    } catch (error) {
      if (error instanceof assert.AssertionError) return;
      throw error;
    }
    assert.fail(
      "This known bug looks fixed: declare its test with it() instead of knownBug().",
    );
  });
}
