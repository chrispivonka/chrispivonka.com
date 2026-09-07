/**
 * Google OAuth2 helpers with PKCE support.
 *
 * Uses only Node.js built-in modules — zero external dependencies.
 */

import { createHash, createPublicKey, createVerify, randomBytes } from "node:crypto";
import https from "node:https";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Base64url encode a buffer (no padding).
 */
function base64urlEncode(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate PKCE code verifier and challenge (S256).
 *
 * @returns {{ codeVerifier: string, codeChallenge: string }}
 */
export function generatePKCE() {
  const verifierBytes = randomBytes(32);
  const codeVerifier = base64urlEncode(verifierBytes);
  const codeChallenge = base64urlEncode(
    createHash("sha256").update(codeVerifier).digest()
  );
  return { codeVerifier, codeChallenge };
}

/**
 * Build the Google OAuth2 authorization URL.
 *
 * @param {object} params
 * @param {string} params.clientId - Google OAuth client ID
 * @param {string} params.redirectUri - Callback URL
 * @param {string} params.state - CSRF state token
 * @param {string} params.nonce - Replay protection nonce
 * @param {string} params.codeChallenge - PKCE S256 challenge
 * @returns {string} Full authorization URL
 */
export function buildAuthUrl({ clientId, redirectUri, state, nonce, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens via Google's token endpoint.
 *
 * @param {object} params
 * @param {string} params.code - Authorization code from callback
 * @param {string} params.clientId - Google OAuth client ID
 * @param {string} params.clientSecret - Google OAuth client secret
 * @param {string} params.redirectUri - Callback URL (must match authorize request)
 * @param {string} params.codeVerifier - PKCE code verifier
 * @returns {Promise<object>} Token response (includes id_token, access_token, etc.)
 */
const TOKEN_EXCHANGE_TIMEOUT_MS = 4000; // Leave headroom under Lambda's 5s limit
const MAX_RESPONSE_BYTES = 65536; // 64KB — Google's token response is ~2KB

export function exchangeCode({ code, clientId, clientSecret, redirectUri, codeVerifier }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      GOOGLE_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: TOKEN_EXCHANGE_TIMEOUT_MS,
      },
      (res) => {
        let data = "";
        let bytes = 0;

        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            req.destroy();
            reject(new Error("Token response exceeded size limit"));
            return;
          }
          data += chunk;
        });

        res.on("error", (err) => reject(new Error(`Token response error: ${err.message}`)));

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== 200) {
              reject(new Error(`Token exchange failed: ${parsed.error || res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch (err) {
            reject(new Error(`Failed to parse token response: ${err.message}`));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Token exchange timed out"));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Verify the RSA-RS256 signature on a JWT using a JWK.
 *
 * @param {string} token - Full JWT string (header.payload.signature)
 * @param {object} jwk - JWK with n (modulus) and e (exponent)
 * @returns {boolean} True if signature is valid
 */
function verifyJwtSignature(token, jwk) {
  const parts = token.split(".");
  const signedContent = `${parts[0]}.${parts[1]}`;

  // Convert JWK to PEM-format public key
  const publicKey = createPublicKey({
    key: {
      kty: "RSA",
      n: jwk.n,
      e: jwk.e,
    },
    format: "jwk",
  });

  // Base64url decode the signature
  let sig = parts[2].replace(/-/g, "+").replace(/_/g, "/");
  while (sig.length % 4 !== 0) sig += "=";
  const signatureBuffer = Buffer.from(sig, "base64");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(signedContent);
  return verifier.verify(publicKey, signatureBuffer);
}

/**
 * Decode and verify a Google id_token (JWT) with full signature verification.
 *
 * Verifies:
 *   1. RSA-RS256 signature against Google's JWKS (baked in at build time)
 *   2. iss (issuer)
 *   3. aud (audience / client ID)
 *   4. exp (expiration with clock skew tolerance)
 *   5. nonce (replay protection)
 *   6. email + email_verified
 *
 * @param {string} idToken - JWT string
 * @param {object} params
 * @param {string} params.clientId - Expected audience
 * @param {string} params.nonce - Expected nonce
 * @param {Array<object>} params.jwks - Google's JWKS keys (baked in at build time)
 * @returns {{ email: string }|null} Verified claims or null
 */
export function verifyIdToken(idToken, { clientId, nonce, jwks }) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;

    // Decode header to get key ID (kid)
    const header = JSON.parse(
      Buffer.from(parts[0], "base64").toString("utf8")
    );

    // Must be RS256
    if (header.alg !== "RS256") return null;

    // Find the matching key from Google's JWKS
    const matchingKey = jwks.find((k) => k.kid === header.kid);
    if (!matchingKey) return null;

    // Verify the RSA signature
    if (!verifyJwtSignature(idToken, matchingKey)) return null;

    // Decode and verify claims
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf8")
    );

    // Verify issuer
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
      return null;
    }

    // Verify audience
    if (payload.aud !== clientId) return null;

    // Verify expiration (with 30s clock skew tolerance)
    if (payload.exp < Math.floor(Date.now() / 1000) - 30) return null;

    // Verify nonce
    if (payload.nonce !== nonce) return null;

    // Verify email is present and verified
    if (!payload.email || !payload.email_verified) return null;

    return { email: payload.email.toLowerCase() };
  } catch {
    return null;
  }
}
