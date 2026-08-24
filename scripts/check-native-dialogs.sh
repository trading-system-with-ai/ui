#!/bin/sh
# §47 static scan (upgrade 2026-08-12 §27): production UI must contain NO
# browser-native dialogs. Fails CI on any match in app/, components/ or lib/.
# The pattern catches window.alert / alert( / window.confirm / confirm( /
# window.prompt / prompt( as global calls, while allowing identifiers that
# merely end in those words (e.g. showPrompt(, myConfirm().
set -e
cd "$(dirname "$0")/.."

# Test files are EXCLUDED: they legitimately contain strings like
# "javascript:alert(1)" as fixtures asserting that such URLs are BLOCKED.
# Flagging those inverted the check's meaning — it failed on the very tests
# proving the rule holds. The gate is about PRODUCTION UI, which is what the
# §47 rule says; a test asserting a dialog is refused is evidence FOR it.
MATCHES=$(grep -rn -E '(^|[^a-zA-Z0-9_.])(window\.)?(alert|confirm|prompt)\(' \
  app components lib \
  --include='*.ts' --include='*.tsx' \
  --exclude='*.test.ts' --exclude='*.test.tsx' \
  --exclude='*.spec.ts' --exclude='*.spec.tsx' \
  --exclude-dir='__tests__' \
  | grep -v -E '^\s*//|^\s*\*|Never use browser-native' || true)

if [ -n "$MATCHES" ]; then
  echo "FAIL (§47): browser-native dialog calls found in production UI:" >&2
  echo "$MATCHES" >&2
  exit 1
fi
echo "OK (§47): no browser-native alert/confirm/prompt in production UI."
