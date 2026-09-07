#!/usr/bin/env bash
# Push main to GitHub using the token stored outside the repo (~/.config/prodplan/github_token).
set -euo pipefail
TOKEN="$(cat ~/.config/prodplan/github_token)"
cd "$(dirname "$0")/.."
git -c credential.helper= push "https://x-access-token:${TOKEN}@github.com/codershiveinterns-cloud/ProdPlan.git" HEAD:main "$@" 2>&1 | sed -E 's#(x-access-token:)[^@]+@#\1***@#g'
