#!/usr/bin/env bash
# Checks the three EAS Observe packages for iOS privacy manifests
# (PrivacyInfo.xcprivacy) and for podspec resource_bundles entries that
# would carry one.
set -uo pipefail

PACKAGES=("expo-observe" "expo-app-metrics" "expo-eas-client")

for pkg in "${PACKAGES[@]}"; do
  dir="node_modules/$pkg"
  echo "=== $pkg ==="
  if [ ! -d "$dir" ]; then
    echo "  not installed (missing $dir)"
    echo
    continue
  fi

  version=$(node -e "console.log(require('./$dir/package.json').version)" 2>/dev/null || echo "unknown")
  echo "  resolved version: $version"

  echo "  .xcprivacy files:"
  found=$(find "$dir" -iname '*.xcprivacy' 2>/dev/null)
  if [ -z "$found" ]; then
    echo "    none"
  else
    echo "$found" | sed 's/^/    /'
  fi

  echo "  podspec xcprivacy references:"
  podspec_hits=$(grep -rn --include='*.podspec' -i 'xcprivacy' "$dir" 2>/dev/null)
  if [ -z "$podspec_hits" ]; then
    echo "    none"
  else
    echo "$podspec_hits" | sed 's/^/    /'
  fi

  echo "  podspec resource_bundles entries:"
  bundle_hits=$(grep -rn --include='*.podspec' -i 'resource_bundles' "$dir" 2>/dev/null)
  if [ -z "$bundle_hits" ]; then
    echo "    none"
  else
    echo "$bundle_hits" | sed 's/^/    /'
  fi

  echo
done
