# pulsechain-validator-analytics — Engineering Reference

The files the tools read, the gates every change passes, the tests, and CI:
the same gates, run at each push by GitHub Actions, the service of GitHub,
the website that hosts the repo. For how the tools work, see
[`docs/architecture.md`](architecture.md); for every command the repo's
`package.json` gives npm, the package manager of Node, the program that runs
JavaScript outside a browser, to run, see
[`docs/npm-project-commands.md`](npm-project-commands.md).

The repo follows the coding standards of LP Ranger, the owner's bot that
manages his 9mm V3 liquidity positions: its `CLAUDE.md` and
`docs/claude/`, in
[nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Files on Disk](#files-on-disk)
- [The Gate: `npm run check`](#the-gate-npm-run-check)
- [Lint](#lint)
- [Tests](#tests)
- [Security Audits](#security-audits)
- [Dead Code Detection](#dead-code-detection)
- [CI and Branch Protection](#ci-and-branch-protection)
- [Known Bugs](#known-bugs)

---

## Quick Start

A working copy needs Node 24 or later, and the packages of the repo and of
its two tools. From the repo's top folder:

```bash
npm ci
npm ci --prefix fetch-execution-address
npm ci --prefix get-validator-payments
npm run check
```

`npm ci` installs crypto-price-fetchers, the owner's repo of code his
projects share, too, from GitHub, at the commit `package-lock.json` keeps
for its main branch: no other step installs it. Its versions tool, which
this repo runs as `npm run github-project-deps`, moves it: `-- main` to
main's newest commit, and `-- release` to its latest release (see
[crypto-price-fetchers](architecture.md#crypto-price-fetchers)).

---

## Files on Disk

The tools and their tests read these files. Git, the version-control program that keeps the repo's history, keeps the
settings, which
hold no key; a key would stay on the owner's computer.

| File | In git | What it holds |
| ---- | ------ | ------------- |
| `config.json` | yes | The services whose keys the programs send, under `apiKeys`: none today. |
| `api-keys.json` | no | Api keys, encrypted with the owner's password, should a service that takes one be added. |
| `get-validator-payments/config.json` | yes | The payments calculator's settings, read from the folder it runs in. |
| `coverage/` | no | A test run's coverage report. |

---

## The Gate: `npm run check`

`npm run check` runs every gate, in order, and stops at the first that
fails: the lint, the tests with coverage, then the three security audits. It
must pass before every commit and push, and CI runs it on Node 26, the
newest LTS (long-term support) version, and on Node 24, the oldest the repo
supports.

---

## Lint

The lint checks each file's form before any test runs: the rules the code
follows, its formatting, the workflows, and files nothing uses.
`npm run lint` runs five tools: four npm packages, and actionlint, a
program its author publishes for each system, which the table's fourth
row explains:

| Tool | Configured in | What it does, and what it holds the repo to |
| ---- | ------------- | ------------------------------------------- |
| ESLint | `eslint.config.js` | Checks JavaScript against rules: LP Ranger's, with no warning allowed: cyclomatic complexity ≤ 17, ≤ 500 lines of code a file (blank lines and comments not counted), lines ≤ 80 characters but strings, urls and comments, `===`, no unused name, no `var`, `const` where nothing is reassigned, no `Math.random`, no comment that tells Prettier, the formatter in the row below, to skip code, and every import resolved. |
| markdownlint | `.markdownlint-cli2.jsonc` | Checks the form of Markdown files, with LP Ranger's settings, over every Markdown file. |
| Prettier | `.prettierrc`, `.prettierignore` | Formats code; in check mode, it fails when its formatting would change any JavaScript, JSON or YAML file. |
| actionlint | crypto-price-fetchers' `actionlint/release.js` | Checks the GitHub Actions workflow files, in `.github/workflows/`, for mistakes in their syntax, their expressions and the shell scripts their steps run. The lint runs the official release of actionlint, rhysd's program, through `run-actionlint`, a bin of crypto-price-fetchers: the first run downloads the archive for its system, refuses it unless its SHA-256 is the one crypto-price-fetchers pins, and keeps the program in `node_modules/.cache/actionlint/`, which later runs use. |
| knip | `knip.json` | Finds files nothing imports or runs, and fails on any. See [Dead Code Detection](#dead-code-detection). |

The lint covers both tools, whose imports resolve once their own packages
are installed. husky, a package that runs scripts at git's hooks, runs
`npm run lint` before each commit (`.husky/pre-commit`); this repo's
`prepare` script installs the hook at `npm install`. `npm run format` or
`npm run lint:fix` fixes formatting. No rule is ever switched off in a
file, no file is left out of the lint, and a file over 500 lines is split,
not excused.

---

## Tests

The tests are in `test/`, on Node's test runner. They ask nothing outside
the computer: the tools run against a stand-in beacon node and rpc
endpoint, served on a local port.

| Test | What it covers |
| ---- | -------------- |
| `execution-address.test.js` | Reading an address from withdrawal credentials, and the lookup, by index or public key, an error in place of an address. |
| `validator-payments.test.js` | The payments calculator: withdrawals by address less a full exit's principal, tips by fee recipient, a legacy transaction's among them, validators by index or public key, the slots asked, the end day left out, a slot with no block, a request tried again, a run that fails on a validator, block or receipt it cannot read, and its refusals. |
| `command-lines.test.js` | Both command lines, run as their owner runs them: their help, their output, their refusals and their exit codes. |
| `command-line-help.test.js` | Every command line's help, `--help` and `-h`: the two tools', the key manager's, and those of the bins of crypto-price-fetchers the npm targets run, its versions tool and `run-actionlint`, each with its options, examples and exit codes, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/command-line-help`); and that its list holds every command line the repo runs, every bin of crypto-price-fetchers among them. |
| `api-keys.test.js` | The keys `config.json` lists, none today, the key manager, which saves and lists the api keys, and the copy of `unlock-api-keys.sh`, the script that keeps the password for a terminal. |
| `dependencies.test.js` | crypto-price-fetchers installed from GitHub, following its main branch or its latest release, and `npm run github-project-deps` running its versions tool. |

`test/helpers/` holds the stand-ins:

- `stand-in-pulsechain.js` serves a beacon api, its genesis time,
  validators and blocks, and an rpc endpoint, its execution blocks and
  receipts, from what a test gives, and fails a path as many times as the
  test says.
- `payments-chain.js` builds the chain the payments tests share: a day of
  hour-long slots, the tests' validator and another, and blocks that pay
  nothing unless a test says otherwise; and the settings a run against it
  takes, retries a millisecond apart.
- `known-bug.js` declares a known-bug test.

`npm run test:coverage` fails below 80% of lines covered. Code written to
check something goes into the tests, so it is kept and run again rather
than written again.

---

## Security Audits

Four audits look for security problems: in the packages the repo and its
tools install, through npm audit, npm's check of installed packages against
known vulnerabilities; in the release of actionlint the lint runs; in the
code, through ESLint with security rules; and in the text of every file,
through secretlint, which looks for keys and credentials.

| Command | What it runs | What it catches |
| ------- | ------------ | --------------- |
| `npm run audit:deps` | `npm audit --audit-level=high --omit=dev`, for the repo and each tool, then `npm run audit:actionlint` | Known vulnerabilities, of high severity or worse, in the packages that ship; then what the next row says. |
| `npm run audit:actionlint` | `run-actionlint --check`: downloads every archive of the actionlint release crypto-price-fetchers pins | An archive that cannot be downloaded, or whose SHA-256 differs from the one pinned. npm audit does not cover actionlint, which is no npm package; the lint makes the same check on the one archive it runs. |
| `npm run audit:security` | ESLint with `eslint-security.config.js` | Code open to attack (eslint-plugin-security), strings that look like keys (eslint-plugin-no-secrets), and printing a name that may hold a secret (`no-secret-logging`, from crypto-price-fetchers). |
| `npm run audit:secrets` | secretlint, with `.secretlintrc.json` and `.secretlintignore` | Keys and credentials in any file. |

The security lint follows LP Ranger's: no warning allowed, with
`detect-non-literal-fs-filename` and `detect-object-injection` off.

---

## Dead Code Detection

A file nothing in the repo uses is dead code. knip finds such a file: it
follows the imports from each entry point, a file that a program or a test
starts from, and reports any file it never reaches. `npm run knip:files`
fails on one, as in LP Ranger. The two command lines are started by their
paths rather than imported, so `knip.json` names them as entry points,
with the security config and the tests. Unused exports are not gated.

---

## CI and Branch Protection

CI runs the gate again on GitHub, so a change reaches `main` only after it
passes there too. Two workflows run on every push to `main`, every pull
request to `main`, and by hand:

| Workflow | Job | Runs |
| -------- | --- | ---- |
| `ci.yml` | check-latest-nodejs-lts (Node 26), check-oldest-nodejs-supported (Node 24) | `npm run check`, after installing the repo's packages and each tool's. |
| `security-audit.yml` | Dependency Audit, Security Lint, Secret Scan | Each audit as a job of its own; Dependency Audit runs `npm run audit:deps`, so the check of actionlint's archives with it. |

The two checks of `ci.yml` are named for their roles, not their Node
versions, so moving to newer versions renames no check.

`main` is protected: a change reaches it only by a pull request whose five
checks, those five jobs, have passed. Force pushes and deletion are
refused. Merges are merge commits, never squashed, and no branch is
deleted. The steps from a branch to `main` are LP Ranger's eight, in its
`docs/claude/CLAUDE-CI.md`.

---

## Known Bugs

None is known. A bug found gets a test in `test/known-bugs.test.js`,
declared with `knownBug` (`test/helpers/known-bug.js`), so the test passes
while the bug is present. The bug's fix makes its test fail; the same change
declares the test with `it`, among the tests of the code it is about.
