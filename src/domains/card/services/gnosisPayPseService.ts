/**
 * Gnosis Pay PSE (Partner Secure Elements) Service
 *
 * PSE allows displaying sensitive card data (PAN, CVV, PIN) in a secure iframe.
 * Requires mTLS authentication with GP-signed client certificate.
 *
 * Setup (one-time):
 *   1. Run: GP_APP_ID=gp_xxx ./scripts/pse/generate-csr.sh
 *   2. Submit generated CSR to GP Partner Dashboard → Integrations → PSE
 *   3. GP returns signed certificate
 *   4. Encode to base64 and set env vars:
 *        GNOSIS_PAY_PSE_APP_ID=gp_xxx
 *        GNOSIS_PAY_PSE_KEY_B64=<base64 of private key PEM>
 *        GNOSIS_PAY_PSE_CERT_B64=<base64 of signed cert PEM>
 *
 * Usage:
 *   Backend calls GET /pse/token → returns ephemeral token (TTL ~60s)
 *   Frontend initialises @gnosispay/pse-sdk with { token, appId }
 */

import https from 'https';
import { appLogger } from '../../logger';

const PSE_API = 'https://api-pse.gnosispay.com/api/v1/ephemeral-token';

export interface PseConfig {
  appId: string;
  certPem: string;
  keyPem: string;
}

function loadPseConfig(): PseConfig | null {
  const appId = process.env.GNOSIS_PAY_PSE_APP_ID;
  const certB64 = process.env.GNOSIS_PAY_PSE_CERT_B64;
  const keyB64 = process.env.GNOSIS_PAY_PSE_KEY_B64;

  if (!appId || !certB64 || !keyB64) {
    return null;
  }

  try {
    const certPem = Buffer.from(certB64, 'base64').toString('utf8');
    const keyPem = Buffer.from(keyB64, 'base64').toString('utf8');
    return { appId, certPem, keyPem };
  } catch {
    appLogger.error('[PSE] Failed to decode PSE cert/key from base64');
    return null;
  }
}

export function isPseConfigured(): boolean {
  return loadPseConfig() !== null;
}

/**
 * Fetch a short-lived ephemeral token from the GP PSE API using mTLS.
 * The token is passed to the frontend to initialise @gnosispay/pse-sdk.
 */
export async function getEphemeralToken(gpJwt: string): Promise<string> {
  const config = loadPseConfig();
  if (!config) {
    throw new Error(
      'PSE not configured. Set GNOSIS_PAY_PSE_APP_ID, GNOSIS_PAY_PSE_CERT_B64, GNOSIS_PAY_PSE_KEY_B64.',
    );
  }

  // Node.js native fetch does not support mTLS client certs.
  // Use https.request directly with a custom Agent.
  const token = await new Promise<string>((resolve, reject) => {
    const agent = new https.Agent({
      cert: config.certPem,
      key: config.keyPem,
    });

    const req = https.request(
      PSE_API,
      {
        method: 'GET',
        agent,
        headers: {
          Authorization: `Bearer ${gpJwt}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`PSE API error ${res.statusCode}: ${body}`));
            return;
          }
          try {
            const parsed = JSON.parse(body) as { token?: string } | string;
            const t = typeof parsed === 'string' ? parsed : parsed.token;
            if (!t) {
              reject(new Error(`PSE API returned no token: ${body}`));
              return;
            }
            resolve(t);
          } catch {
            // Plain-text token
            resolve(body.trim());
          }
        });
      },
    );

    req.on('error', reject);
    req.end();
  });

  appLogger.info('[PSE] Ephemeral token fetched successfully');
  return token;
}
