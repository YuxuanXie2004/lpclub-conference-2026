#!/usr/bin/env bash
# Usage: bash deploy/upload.sh user@SERVER_IP [ssh_key]
set -euo pipefail
HOST=${1:?usage: bash deploy/upload.sh user@SERVER_IP [ssh_key]}
KEY=${2:-}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
if [ -n "$KEY" ]; then SSH_OPTS+=(-i "$KEY"); fi

echo "==> preparing /opt/lpclub"
ssh "${SSH_OPTS[@]}" "$HOST" 'mkdir -p /opt/lpclub/site /opt/lpclub/data'
echo "==> uploading application"
# Stage application files without local credentials or persistent VIP data.
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/server"
cp -R "$ROOT/server/." "$STAGING/server/"
rm -f "$STAGING/server/.env"
scp "${SSH_OPTS[@]}" -r "$STAGING/server" "$ROOT/deploy" "$ROOT/package.json" "$HOST:/opt/lpclub/"
# The existing local lockfile is not part of this change; install from package.json.
scp "${SSH_OPTS[@]}" "$ROOT/index.html" "$HOST:/opt/lpclub/site/"
scp "${SSH_OPTS[@]}" -r "$ROOT/images" "$HOST:/opt/lpclub/site/"
echo "Uploaded. On the server, review /opt/lpclub/server/.env then run deploy/setup.sh."
