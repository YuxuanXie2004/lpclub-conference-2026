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
scp "${SSH_OPTS[@]}" -r "$ROOT/server" "$ROOT/deploy" "$ROOT/package.json" "$HOST:/opt/lpclub/"
[ -f "$ROOT/package-lock.json" ] && scp "${SSH_OPTS[@]}" "$ROOT/package-lock.json" "$HOST:/opt/lpclub/" || true
scp "${SSH_OPTS[@]}" "$ROOT/index.html" "$HOST:/opt/lpclub/site/"
scp "${SSH_OPTS[@]}" -r "$ROOT/images" "$HOST:/opt/lpclub/site/"
echo "Uploaded. On the server, review /opt/lpclub/server/.env then run deploy/setup.sh."
