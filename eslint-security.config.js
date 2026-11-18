/**
 * ESLint's security pass, apart from the main lint: LP Ranger's. It runs
 * eslint-plugin-security, for code patterns open to attack;
 * eslint-plugin-no-secrets, for strings that look like keys; and
 * `no-secret-logging`, from crypto-price-fetchers, which refuses printing
 * a name that may hold a key or a password. `npm run audit:security` runs
 * it, with `--max-warnings 0`, so a warning fails too.
 * @file eslint-security.config.js
 *
 * As in LP Ranger, two rules are off: `detect-non-literal-fs-filename`,
 * since every path here is built from the repo's own folders, a temp
 * folder or a path its owner names, and `detect-object-injection`, which
 * flags every `object[name]`.
 */

import noSecretLogging from "crypto-price-fetchers/eslint-rules/no-secret-logging";
import noSecrets from "eslint-plugin-no-secrets";
import security from "eslint-plugin-security";

export default [
  { ignores: ["**/node_modules/**", "**/coverage/**"] },
  {
    files: ["**/*.js"],
    plugins: {
      security,
      "no-secrets": noSecrets,
      local: { rules: { "no-secret-logging": noSecretLogging } },
    },
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "security/detect-unsafe-regex": "warn",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-eval-with-expression": "warn",
      "security/detect-no-csrf-before-method-override": "warn",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "warn",
      "security/detect-child-process": "warn",
      "security/detect-new-buffer": "warn",
      "security/detect-disable-mustache-escape": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-object-injection": "off",
      "no-secrets/no-secrets": [
        "warn",
        { tolerance: 4.5, additionalDelimiters: ["0x"] },
      ],
      "local/no-secret-logging": "warn",
    },
  },
];
