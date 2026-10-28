#!/bin/zsh
cd "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print "Node.js 22 or newer is required. Install it from https://nodejs.org/ then try again."
  read "?Press Return to close."
  exit 1
fi
node server/index.mjs
if [[ $? -ne 0 ]]; then
  read "?Press Return to close."
fi
