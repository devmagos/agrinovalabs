/**
 * netlify/functions/zoho/auth.js
 * ─────────────────────────────────────────────────────────────────
 * Zoho OAuth2 token manager for Netlify serverless functions.
 *
 * NOTE: Netlify Functions are stateless — each invocation is a
 * fresh cold start, so in-memory token caching doesn't persist
 * between requests. Every cold-start will fetch a fresh token
 * using your ZOHO_REFRESH_TOKEN. This is fine — Zoho's token
 * endpoint is fast and refresh tokens don't expire unless revoked.
 * ─────────────────────────────────────────────────────────────────
 */

const axios = require('axios');

// Module-level cache — reused within the same warm Lambda instance
let _cachedToken  = null;
let _tokenExpiry  = null;

/**
 * Returns a valid Zoho OAuth2 access token.
 * Uses module-level cache when the function instance is warm.
 * Automatically fetches a new one via refresh token otherwise.
 *
 * @returns {Promise<string>} A valid Zoho access token
 */
async function getAccessToken() {
  const now = Date.now();

  // Reuse cached token if warm instance and token not yet expired (60s buffer)
  if (_cachedToken && _tokenExpiry && now < _tokenExpiry - 60_000) {
    return _cachedToken;
  }

  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });

  try {
    const { data } = await axios.post(
      `${accountsUrl}/oauth/v2/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (!data.access_token) {
      throw new Error(`Token refresh failed. Zoho response: ${JSON.stringify(data)}`);
    }

    _cachedToken = data.access_token;
    _tokenExpiry = now + (data.expires_in || 3600) * 1000;

    return _cachedToken;

  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[AgriNova] Zoho token refresh error:', detail);
    throw new Error(
      'Could not obtain Zoho access token. ' +
      'Check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in Netlify environment variables.'
    );
  }
}

module.exports = { getAccessToken };
