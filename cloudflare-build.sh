#!/usr/bin/env bash
set -euo pipefail

# Build only the public frontend for Cloudflare Pages.
# Firebase backend/config files stay in the repository but are not published.
rm -rf dist
mkdir -p dist

for item in * .*; do
  case "$item" in
    .|..|.git|.gitignore|.firebaserc|firebase.json|firestore.rules|firestore.indexes.json|firebase-functions|dist)
      continue
      ;;
    *)
      cp -a "$item" dist/
      ;;
  esac
done

