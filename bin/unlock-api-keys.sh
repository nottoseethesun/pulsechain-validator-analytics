# unlock-api-keys.sh
#
# Asks for the password of this project's api keys, showing nothing of what
# is typed, checks that it opens the keys saved in this project's
# api-keys.json, and keeps it for this terminal in the environment variable
# API_KEYS_PASSWORD. The project's programs then open their keys with it,
# without asking. Run it with source, by its path from the folder you are
# in; from the project's top folder:
#
#   source ./bin/unlock-api-keys.sh
#
# Closing the terminal forgets the password, as does: unset API_KEYS_PASSWORD
#
# The same script is in the bin/ folders of crypto-price-fetchers,
# pulsechain-analytics, pulsechain-validator-analytics and
# x1-validator-analytics, and each project's tests check that its copy
# matches crypto-price-fetchers'. With one password for all four, one
# unlock serves them all. It runs in bash and zsh; the parts
# only one of them reads are in eval, so the other never parses them.

# Run as a program, a script cannot set anything in the terminal it was
# started from, so it says how to run it, and stops.
if [ -n "${ZSH_VERSION:-}" ]; then
  case "${ZSH_EVAL_CONTEXT:-}" in
    *:file*) _api_keys_sourced=yes ;;
    *) _api_keys_sourced=no ;;
  esac
elif [ -n "${BASH_VERSION:-}" ]; then
  eval '_api_keys_script=${BASH_SOURCE[0]}'
  if [ "$_api_keys_script" != "$0" ]; then _api_keys_sourced=yes; else _api_keys_sourced=no; fi
else
  echo "unlock-api-keys.sh runs in bash or zsh." >&2
  return 1 2>/dev/null || exit 1
fi
if [ "$_api_keys_sourced" = no ]; then
  printf '%s\n' "Run it with source, so it can keep the password in this terminal:" "  source $0" >&2
  exit 1
fi

# The project's top folder: the one above bin/, which this script is in.
if [ -n "${ZSH_VERSION:-}" ]; then
  eval '_api_keys_top=${${(%):-%x}:A:h:h}'
else
  _api_keys_top=$(cd "$(dirname "$_api_keys_script")/.." && pwd)
fi

printf 'Password for the api keys of %s: ' "$(basename "$_api_keys_top")" >&2
IFS= read -r -s _api_keys_password
printf '\n' >&2

if [ -z "$_api_keys_password" ]; then
  echo "No password was typed, so none is kept." >&2
elif API_KEYS_PASSWORD="$_api_keys_password" node "$_api_keys_top/bin/manage-api-keys.js" check-password; then
  export API_KEYS_PASSWORD="$_api_keys_password"
  echo "API_KEYS_PASSWORD is set for this terminal." >&2
else
  echo "The password is not kept." >&2
fi
unset _api_keys_sourced _api_keys_script _api_keys_top _api_keys_password
