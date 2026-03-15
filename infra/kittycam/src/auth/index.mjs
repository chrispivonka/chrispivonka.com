/**
 * Lambda@Edge Viewer Request handler for Google OAuth2 authentication.
 *
 * Three request paths:
 *   /oauth2/callback  — Complete OAuth flow, set session cookie
 *   /oauth2/sign_out  — Clear session cookie
 *   Everything else   — Validate session cookie or redirect to Google
 */

import { timingSafeEqual } from "node:crypto";
import { encrypt, decrypt, randomToken } from "./crypto.mjs";
import { buildAuthUrl, exchangeCode, generatePKCE, verifyIdToken } from "./oauth.mjs";
import {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  COOKIE_ENCRYPTION_KEY,
  COOKIE_ENCRYPTION_KEYS_PREVIOUS,
  ALLOWED_EMAILS,
  GOOGLE_JWKS,
  DOMAIN,
} from "./config.mjs";

const SESSION_COOKIE = "__Host-kc_session";
const PENDING_COOKIE = "__Secure-kc_pending";
const SESSION_MAX_AGE = 14400; // 4 hours
const PENDING_MAX_AGE = 300; // 5 minutes
const REDIRECT_URI = `https://${DOMAIN}/oauth2/callback`;

/**
 * Security headers applied to ALL Lambda-generated responses.
 *
 * CloudFront's Response Headers Policy only applies to responses from
 * the S3 origin — NOT to responses generated directly by Lambda@Edge
 * (redirects, 403s). We must inject these headers ourselves to ensure
 * every response the viewer sees is hardened.
 */
const SECURITY_HEADERS = {
  "strict-transport-security": [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ],
  "x-content-type-options": [
    { key: "X-Content-Type-Options", value: "nosniff" },
  ],
  "x-frame-options": [
    { key: "X-Frame-Options", value: "DENY" },
  ],
  "referrer-policy": [
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ],
  "content-security-policy": [
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    },
  ],
  "permissions-policy": [
    { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
  ],
  "cross-origin-opener-policy": [
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ],
  "x-robots-tag": [
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ],
};

/**
 * Timing-safe string comparison.
 * Prevents timing attacks that could leak the expected value byte-by-byte.
 */
function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * HTML-escape a string to prevent XSS in generated HTML responses.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Parse cookies from a CloudFront request header.
 */
function parseCookies(headers) {
  const cookies = {};
  if (!headers.cookie) return cookies;
  for (const header of headers.cookie) {
    for (const pair of header.value.split(";")) {
      const [name, ...rest] = pair.trim().split("=");
      if (name) cookies[name.trim()] = rest.join("=").trim();
    }
  }
  return cookies;
}

/**
 * Build a Set-Cookie header value.
 *
 * __Host- prefixed cookies: browser enforces Secure + Path=/ + no Domain.
 * __Secure- prefixed cookies: browser enforces Secure, allows Domain and custom Path.
 */
function setCookie(name, value, { maxAge, path = "/" }) {
  const isHostPrefixed = name.startsWith("__Host-");
  const parts = [
    `${name}=${value}`,
    // __Host- cookies must NOT have a Domain attribute — the browser
    // rejects them if one is present. This scopes the cookie to the
    // exact origin only (no subdomains), enforced by the browser itself.
    ...(isHostPrefixed ? [] : [`Domain=${DOMAIN}`]),
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  return parts.join("; ");
}

/**
 * Build a cookie-clearing header value.
 */
function clearCookie(name, path = "/") {
  const isHostPrefixed = name.startsWith("__Host-");
  const domain = isHostPrefixed ? "" : `Domain=${DOMAIN}; `;
  return `${name}=; ${domain}Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Return a 302 redirect response with full security headers.
 */
function redirect(location, extraHeaders = {}) {
  return {
    status: "302",
    statusDescription: "Found",
    headers: {
      ...SECURITY_HEADERS,
      location: [{ key: "Location", value: location }],
      "cache-control": [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      pragma: [{ key: "Pragma", value: "no-cache" }],
      ...extraHeaders,
    },
  };
}

/**
 * Return a forbidden response with full security headers.
 */
function forbidden(message = "Access denied") {
  return {
    status: "403",
    statusDescription: "Forbidden",
    headers: {
      ...SECURITY_HEADERS,
      "content-type": [{ key: "Content-Type", value: "text/html; charset=utf-8" }],
      "cache-control": [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      pragma: [{ key: "Pragma", value: "no-cache" }],
    },
    body: `<!doctype html><html><head><title>403</title></head><body><h1>${escapeHtml(message)}</h1><p>Your email is not authorized to view this page.</p><p><a href="/oauth2/sign_out">Try a different account</a></p></body></html>`,
  };
}

/**
 * Handle the OAuth callback: exchange code, verify token, set session cookie.
 */
async function handleCallback(request) {
  const cookies = parseCookies(request.headers);
  const pendingValue = cookies[PENDING_COOKIE];

  if (!pendingValue) return redirect("/");

  const pending = decrypt(pendingValue, COOKIE_ENCRYPTION_KEY, COOKIE_ENCRYPTION_KEYS_PREVIOUS);
  if (!pending || !pending.state || !pending.nonce || !pending.codeVerifier) {
    return redirect("/");
  }

  // Parse query string
  const params = new URLSearchParams(request.querystring);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  // Handle OAuth errors from Google
  if (error) return redirect("/");

  // Verify state matches (CSRF protection, timing-safe)
  if (!code || !state || !safeCompare(state, pending.state)) return redirect("/");

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCode({
      code,
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
      codeVerifier: pending.codeVerifier,
    });

    if (!tokenResponse.id_token) return forbidden("Authentication failed");

    // Verify the id_token (RSA signature + claims)
    const verified = verifyIdToken(tokenResponse.id_token, {
      clientId: OAUTH_CLIENT_ID,
      nonce: pending.nonce,
      jwks: GOOGLE_JWKS,
    });

    if (!verified) return forbidden("Authentication failed");

    // Check email against allowlist
    if (!ALLOWED_EMAILS.includes(verified.email)) {
      return forbidden();
    }

    // Create session cookie
    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
      email: verified.email,
      iat: now,
      exp: now + SESSION_MAX_AGE,
    };
    const sessionValue = encrypt(sessionPayload, COOKIE_ENCRYPTION_KEY);

    return redirect("/", {
      "set-cookie": [
        { key: "Set-Cookie", value: setCookie(SESSION_COOKIE, sessionValue, { maxAge: SESSION_MAX_AGE }) },
        { key: "Set-Cookie", value: clearCookie(PENDING_COOKIE, "/oauth2/callback") },
      ],
    });
  } catch {
    return forbidden("Authentication failed");
  }
}

/**
 * Handle sign out: clear session cookie.
 */
function handleSignOut() {
  return redirect("/", {
    "set-cookie": [
      { key: "Set-Cookie", value: clearCookie(SESSION_COOKIE) },
    ],
  });
}

/**
 * Handle a regular request: validate session or redirect to Google OAuth.
 */
function handleRequest(request) {
  const cookies = parseCookies(request.headers);
  const sessionValue = cookies[SESSION_COOKIE];

  if (sessionValue) {
    const session = decrypt(sessionValue, COOKIE_ENCRYPTION_KEY, COOKIE_ENCRYPTION_KEYS_PREVIOUS);
    if (session && session.exp && session.exp > Math.floor(Date.now() / 1000)) {
      // Valid session — pass through to S3 origin
      return request;
    }
  }

  // No valid session — redirect to Google OAuth
  const state = randomToken(32);
  const nonce = randomToken(32);
  const { codeVerifier, codeChallenge } = generatePKCE();

  const pendingPayload = { state, nonce, codeVerifier };
  const pendingValue = encrypt(pendingPayload, COOKIE_ENCRYPTION_KEY);

  const authUrl = buildAuthUrl({
    clientId: OAUTH_CLIENT_ID,
    redirectUri: REDIRECT_URI,
    state,
    nonce,
    codeChallenge,
  });

  return redirect(authUrl, {
    "set-cookie": [
      {
        key: "Set-Cookie",
        value: setCookie(PENDING_COOKIE, pendingValue, {
          maxAge: PENDING_MAX_AGE,
          path: "/oauth2/callback",
        }),
      },
    ],
  });
}

/**
 * Lambda@Edge Viewer Request handler.
 */
export async function handler(event) {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  if (uri === "/oauth2/callback") {
    return handleCallback(request);
  }

  if (uri === "/oauth2/sign_out") {
    return handleSignOut();
  }

  return handleRequest(request);
}
