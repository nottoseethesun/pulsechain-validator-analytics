/**
 * ESLint's settings for pulsechain-validator-analytics, with LP Ranger's
 * rules: no function above cyclomatic complexity 17, no file above 500
 * lines of code, no line above 80 characters but strings, template
 * literals, regular expressions, urls and comments, `===` always, no unused name, no comment that tells Prettier to
 * skip code, no `Math.random`, and no default made with `||`, which takes
 * its fallback for every falsy value (`no-or-default`,
 * crypto-price-fetchers' rule).
 * @file eslint.config.js
 *
 * Every JavaScript file in the repo is linted, the two tools' and the
 * tests' among them, as ES modules on Node, whose imports must resolve
 * (`n/no-missing-import`).
 *
 * `npm run lint` runs it with `--max-warnings 0`, so a warning fails too.
 * The security rules are in `eslint-security.config.js`, which
 * `npm run audit:security` runs.
 */

import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import nPlugin from "eslint-plugin-n";
import globals from "globals";
import noOrDefault from "crypto-price-fetchers/eslint-rules/no-or-default";

/** The rules every file is held to: LP Ranger's. */
const SHARED_RULES = {
  ...js.configs.recommended.rules,
  complexity: ["error", { max: 17 }],
  "max-len": [
    "error",
    {
      code: 80,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
      ignoreComments: true,
    },
  ],
  "max-lines": [
    "error",
    { max: 500, skipBlankLines: true, skipComments: true },
  ],
  "no-var": "error",
  "prefer-const": ["error", { destructuring: "all" }],
  eqeqeq: ["error", "always"],
  strict: ["error", "global"],
  "no-extend-native": "error",
  "no-unused-vars": [
    "error",
    {
      vars: "all",
      args: "after-used",
      argsIgnorePattern: "^_",
      caughtErrors: "all",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "no-warning-comments": [
    "error",
    { terms: ["prettier-ignore"], location: "anywhere" },
  ],
  "local/no-or-default": "error",
  "no-restricted-syntax": [
    "error",
    {
      selector:
        'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
      message:
        "Use crypto.randomBytes() instead of Math.random(): it is not cryptographically secure.",
    },
  ],
};

export default [
  { ignores: ["**/node_modules/**", "**/coverage/**"] },
  {
    files: ["**/*.js"],
    plugins: {
      n: nPlugin,
      local: { rules: { "no-or-default": noOrDefault } },
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { ...SHARED_RULES, "n/no-missing-import": "error" },
  },
  prettierConfig,
  // eslint-config-prettier turns max-len off, as it turns off every rule of
  // form that Prettier sees to. The line length is LP Ranger's rule, and
  // Prettier cannot break every line of code, so it is set again, after.
  { rules: { "max-len": SHARED_RULES["max-len"] } },
];
