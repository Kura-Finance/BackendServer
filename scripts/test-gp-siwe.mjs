/**
 * Standalone Gnosis Pay SIWE auth tester.
 *
 * Runs the full SIWE flow against GP with a throwaway (or provided) wallet,
 * completely independent of Privy and the backend deployment. Use it to
 * isolate the "SIWE domain not allowed" / WAFForbidden problem by trying
 * different domains from your local (residential) IP.
 *
 * Usage:
 *   node scripts/test-gp-siwe.mjs                      # domain=localhost:3000, random wallet
 *   node scripts/test-gp-siwe.mjs api.kura-finance.com # try a specific domain
 *   GP_PRIVATE_KEY=0x... node scripts/test-gp-siwe.mjs api.kura-finance.com
 *
 * Notes:
 *   - /auth/challenge only verifies the signature + issues a JWT; the wallet
 *     does NOT need to be a registered GP user to get a token.
 *   - A 401 "not registered" style response still means SIWE auth SUCCEEDED.
 *   - localhost is auto-allowed by GP, but only works from a non-datacenter IP
 *     (run this from your laptop, not a cloud server, to avoid WAFForbidden).
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const GP_API = 'https://api.gnosispay.com/api/v1';
const domain = process.argv[2] || 'localhost:3000';
const scheme = /^localhost(:\d+)?$/.test(domain) ? 'http' : 'https';

const privateKey = process.env.GP_PRIVATE_KEY || generatePrivateKey();
const account = privateKeyToAccount(privateKey);

function log(title, obj) {
  console.log(`\n=== ${title} ===`);
  if (obj !== undefined) console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

async function main() {
  log('Config', {
    domain,
    scheme,
    address: account.address,
    usingRandomWallet: !process.env.GP_PRIVATE_KEY,
  });

  // 1. Get nonce (plain text or JSON)
  const nonceRes = await fetch(`${GP_API}/auth/nonce?address=${account.address}`);
  const nonceText = await nonceRes.text();
  let nonce = nonceText;
  try {
    const parsed = JSON.parse(nonceText);
    nonce = parsed.nonce ?? nonceText;
  } catch {
    /* plain text nonce */
  }
  log(`Nonce (HTTP ${nonceRes.status})`, nonce);

  if (!nonceRes.ok) {
    log('Aborting — nonce request failed', nonceText);
    return;
  }

  // 2. Build EIP-4361 SIWE message
  const uri = `${scheme}://${domain}`;
  const issuedAt = new Date().toISOString();
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    account.address,
    '',
    'Sign in to Gnosis Pay',
    '',
    `URI: ${uri}`,
    'Version: 1',
    'Chain ID: 100',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
  log('SIWE message', message);

  // 3. Sign (EIP-191 personal_sign)
  const signature = await account.signMessage({ message });
  log('Signature', signature);

  // 4. Submit to /auth/challenge
  // Optionally send a browser-style Origin/Referer (set SEND_ORIGIN=1). GP's WAF
  // layer inspects these; the app-layer SIWE whitelist checks the message domain.
  const sendOrigin = process.env.SEND_ORIGIN === '1';
  const headers = { 'Content-Type': 'application/json' };
  if (sendOrigin) {
    headers.Origin = uri;
    headers.Referer = `${uri}/`;
  }
  log('Request headers', headers);
  const challengeRes = await fetch(`${GP_API}/auth/challenge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, signature, ttlInSeconds: 3600 }),
  });
  const challengeBody = await challengeRes.text();
  log(`/auth/challenge response (HTTP ${challengeRes.status})`, challengeBody);

  if (challengeRes.ok) {
    log('RESULT', '✅ SIWE auth SUCCEEDED — domain is whitelisted and flow works.');
  } else if (challengeRes.status === 401) {
    log('RESULT', '✅ Signature verified but wallet not registered (401). Domain IS allowed — auth flow works.');
  } else if (challengeBody.includes('domain not allowed')) {
    log('RESULT', `❌ Domain "${domain}" is NOT whitelisted/active in GP. Fix in Partners Dashboard or contact support.`);
  } else if (challengeBody.includes('WAFForbidden')) {
    log('RESULT', '❌ WAF blocked the request (commonly localhost/127.0.0.1 from a server IP).');
  } else {
    log('RESULT', '❌ Other failure — see response above.');
  }
}

main().catch((err) => {
  console.error('\nScript error:', err);
  process.exit(1);
});
