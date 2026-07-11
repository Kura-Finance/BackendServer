#!/bin/bash
# Usage: GP_APP_ID=gp_your_app_id ./scripts/pse/generate-csr.sh
# Generates EC private key + CSR for Gnosis Pay PSE mTLS.
# Submit the .csr file to GP Partner Dashboard to get the signed cert.

set -e

GP_APP_ID="gp_d9d4d05ea3a9ff601bf706e1e2b95ff8"
if [ -z "$GP_APP_ID" ]; then
  echo "❌ Set GP_APP_ID env var first: GP_APP_ID=gp_xxxx ./scripts/pse/generate-csr.sh"
  exit 1
fi

OUT_DIR="scripts/pse/certs"
mkdir -p "$OUT_DIR"

echo "🔑 Generating EC private key (prime256v1)..."
openssl ecparam -name prime256v1 -genkey -noout -out "$OUT_DIR/pse-private-key.pem"

echo "📋 Generating CSR with CN=$GP_APP_ID..."
openssl req -new \
  -key "$OUT_DIR/pse-private-key.pem" \
  -out "$OUT_DIR/pse-csr.pem" \
  -subj "/CN=$GP_APP_ID"

echo "✅ Files generated:"
echo "   Private key : $OUT_DIR/pse-private-key.pem  (keep secret!)"
echo "   CSR         : $OUT_DIR/pse-csr.pem           (submit to GP)"
echo ""
echo "📤 Next: submit pse-csr.pem to GP Partner Dashboard → Integrations → PSE"
echo "   GP will return a signed certificate (pse-cert.pem)"
echo ""
echo "🔒 Then encode for env vars:"
echo "   cat $OUT_DIR/pse-private-key.pem | base64 | tr -d '\\n'"
echo "   cat pse-cert.pem                 | base64 | tr -d '\\n'"
