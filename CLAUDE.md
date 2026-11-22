# pulsechain-validator-analytics — notes for Claude

## Conventions

Follow the coding standards of LP Ranger, the owner's bot that manages his
9mm V3 liquidity positions: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

The repo's programs run on Node, the program that runs JavaScript outside a
browser; npm, Node's package manager, installs their packages and runs the
commands `package.json` names; git, the version-control program, keeps the
repo's history, on GitHub, the website that hosts it.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

**Never show any character of an api key once it is entered**: not in a
reply, a log line, an error message, a test's output, or a listing.

## The tools

The repo has two tools. `fetch-execution-address/` finds the execution
address each validator's withdrawal credentials name, and
`get-validator-payments/` works out the PLS paid to validators over a date
range, by address. Each is a package of its own, with its own
`package.json`: a command line, declared with commander, the package that
reads a command line's options, beside the module that does its work, which
the tests run directly. `lib/validator-ids.js` checks the validators both
take. The payments calculator's settings are its `config.json`, which the
command line reads from the folder it runs in and hands the calculator; the
module reads nothing as it loads.

## Where things are

The programs a reader runs from a terminal are in `bin/`: a start file
for each tool, `fetch-execution-address.js` and
`get-validator-payments.js`, which loads the tool's package, the key
manager and `unlock-api-keys.sh`. Each tool's code and packages stay in
its own folder. The payments calculator reads `config.json` from the
folder it runs in, as before.

## Settings

Before the payments calculator takes a setting, `readConfig` checks
`config.json` against its JSON Schema, `SETTINGS_SCHEMA` in
`get-validator-payments/fetch-validator-payments.js`, a description in JSON
of the keys the file may hold and the kind of value each takes, with
crypto-price-fetchers' `readSettingsFile`
(`crypto-price-fetchers/lib/settings-file`) and its kinds of value
(`crypto-price-fetchers/lib/settings-schema`), as LP Ranger checks its
settings: Ajv, an npm package that checks JSON against a schema, on draft
2020-12, strict. A missing file, one that is not JSON, a setting missing, a
key the schema does not name, or a value of the wrong kind stops the run,
with every problem listed, one line each; a value is refused, never
corrected. The schema names only the keys the calculator reads; a key is
added to it with the owner's go-ahead. The top `config.json` holds only
`apiKeys`, which the key store checks as it reads it.

## Keys

The tools send no api key today. Should they come to, the key is kept as the
key store of crypto-price-fetchers, the owner's repo of code his projects
share, which this repo installs (below), keeps keys
(`crypto-price-fetchers/api-key-store`): the service is listed in the top
`config.json` under `apiKeys`, `npm run api-keys` runs the manager
(`bin/manage-api-keys.js`), and `source ./bin/unlock-api-keys.sh`, a
script in `bin/`, keeps the password for a terminal.
`bin/unlock-api-keys.sh` is a copy of crypto-price-fetchers', which a
test holds it to; a change to it is made there. A key is never a setting in a file git keeps, nor a command-line
argument.

## crypto-price-fetchers

The top `package.json` and each tool's install crypto-price-fetchers from
GitHub, following its main branch (`#main`), the same ref in all three;
each `package-lock.json` keeps the commit installed. The tools use its
helpers for a day, an url, a closed pipe, a time limit on each request, an
address's EIP-55 form, the check of `config.json` against its schema and
an amount's exact decimal text,
and the tests its checks of each command line's help and of the repo's
tracked files (`test/repo-checks.test.js`). crypto-price-fetchers'
versions tool, which this repo runs as
`npm run github-project-deps -- main|release`, sets the ref in all three
to `#main` or `#semver:*` (the latest release) and makes each lockfile
again; the tool lives there, and this repo keeps no copy.
`test/dependencies.test.js` holds the refs to that.

## Docs

`docs/architecture.md` says how the tools work, `docs/engineering.md`
covers the files, the gates, the tests and CI (the gates, run by GitHub
Actions at each push), and
`docs/project-commands.md` lists every command, those npm runs and those
run with `node` or `source`, as LP Ranger's `docs/` does. A change keeps
them true.

Every doc passes the owner's documentation audit: it tells no story of an
old bug, leads every topic and sub-topic with the context it needs,
introduces each tool where it first names it, explains with facts rather
than adjectives, and leaves out no step in the logic of an explanation. A
tool is anything a reader runs or a program uses: an `npm run` command, a
bin, a script, a package or an outside service. Its introduction starts
from the big picture, gives a few words of context or a scenario where the
tool is used, says which codebase it comes from, and says what it does in
precise words.

## Command lines

Every command line in this repo answers `--help`, and `-h`, with all it
takes and how to use it: each option and argument with what it does, then
examples of its common uses, each a full command and what it does, and its
exit codes. An npm target that runs one passes the flag through, as
`npm run <target> -- --help`. Each is declared with commander, the package
that parses command lines, so the options its help lists come from the
declaration the program parses; the examples and exit codes go in the
help's closing text (`addHelpText("after", …)`). Each option's value is
checked as commander parses it, with `InvalidArgumentError`, so a mistake
names its option before anything is asked: a day with
crypto-price-fetchers' `dayStartSeconds`
(`crypto-price-fetchers/lib/calendar-day`), which refuses a day the
calendar does not have, and an url with its `isHttpUrl`
(`crypto-price-fetchers/lib/http-url`). Each entry point calls its
`endQuietlyWhenOutputCloses` (`crypto-price-fetchers/lib/closed-output`)
before it starts, so a command line whose output is piped into a program
that stops reading, such as `head`, ends with its exit code and no stack
trace; the help test checks it of each command line.
`docs/project-commands.md` lists every npm target, including those
that run other tools, such as `lint` and `check`, and every command line
run with `node`, each with its flags and an example. LP Ranger's rules do not yet ask for the examples; this repo does.

## Gates and CI

`npm run check` is the one gate, LP Ranger's: the lint (ESLint, which checks
JavaScript against rules, here LP Ranger's and crypto-price-fetchers'
`no-or-default`, which refuses a default made with `||`; markdownlint, which checks the
form of Markdown files; Prettier, which formats code; actionlint, which
checks the GitHub Actions workflow files, run from its official release by
crypto-price-fetchers' bin `run-actionlint`, which refuses an archive whose
SHA-256 differs from the one it pins; and knip, which finds files nothing
uses), the tests with at least 80% of lines covered, and the security
audits (npm audit, npm's check of the installed packages against known
vulnerabilities, for the three packages, with `run-actionlint --check`,
which checks every archive of that release; the security lint in
`eslint-security.config.js` with crypto-price-fetchers' `no-secret-logging`,
a rule that refuses printing a name that may hold a secret; and secretlint,
which looks for keys and credentials in files). It must pass before a commit
and a push; husky, the package that runs scripts at git's hooks, runs
`npm run lint` before each commit. CI runs `npm run check` on both supported
versions of Node (below), in `ci.yml`, and each audit as a job of its own
(`security-audit.yml`), after installing the three packages. `main` is
protected: those five checks must pass on a pull request, never squashed,
and no branch is deleted. LP Ranger's eight steps in
`docs/claude/CLAUDE-CI.md` take a change to `main`.

## Supported versions of Node

The repo supports two major versions of Node: the newest LTS (long-term
support) version, today 26, and the version two majors before it, today 24.
Every tool, every test and every npm command, each a target a `package.json`
names (`docs/project-commands.md` lists them), runs on both. `engines` in
`package.json` names only the oldest supported major as a minimum, `>=24`,
raised to a minor version, such as `>=24.15`, only when the code needs what
that version added; no file pins or requires one exact version of Node.

CI runs the gate on each, as two checks named for their roles, never for
their versions: `check-latest-nodejs-lts` and
`check-oldest-nodejs-supported`, in `ci.yml`. Moving to newer versions
changes the two `node-version` values there, `NODE_VERSION` in
`security-audit.yml`, `engines` and the docs, but never a check's or a
file's name, so `main`'s required checks stay as they are.

## Tests

The tests are in `test/`, on Node's own test runner, and ask nothing outside
the computer: the tools run against a stand-in beacon node, the consensus
layer's api, and rpc endpoint, the execution layer's json-rpc api, served
locally (`test/helpers/stand-in-pulsechain.js`). `docs/engineering.md` lists
them.

```bash
npm ci
npm ci --prefix fetch-execution-address
npm ci --prefix get-validator-payments
npm run check
```

## Known bugs

None is known. When one is found, it gets a test in
`test/known-bugs.test.js`, declared with `knownBug`
(`test/helpers/known-bug.js`), so the test passes while the bug is present.
The bug's fix makes its test fail; declare that test with `it` instead, in
the same change, among the tests of the code it is about.
