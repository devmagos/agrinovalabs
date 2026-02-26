/**
 * netlify/functions/zoho/mailer.js
 * ─────────────────────────────────────────────────────────────────
 * Sends emails via the Zoho Mail REST API.
 *
 * Zoho Mail API reference:
 * https://www.zoho.com/mail/help/api/post-send-an-email.html
 * ─────────────────────────────────────────────────────────────────
 */

const axios             = require('axios');
const { getAccessToken } = require('./auth');

/**
 * Send an email through Zoho Mail.
 *
 * @param {Object} opts
 * @param {string} opts.fromName     Sender display name
 * @param {string} opts.fromAddress  Verified Zoho sender address
 * @param {string} opts.toAddress    Recipient email
 * @param {string} opts.subject      Subject line
 * @param {string} opts.htmlBody     HTML email body
 * @param {string} [opts.textBody]   Plain-text fallback
 */
async function send({ fromName, fromAddress, toAddress, subject, htmlBody, textBody }) {

  const accessToken = await getAccessToken();
  const accountId   = process.env.ZOHO_ACCOUNT_ID;

  if (!accountId) {
    throw new Error('ZOHO_ACCOUNT_ID is not set in Netlify environment variables.');
  }

  const endpoint = `https://mail.zoho.com/api/accounts/${accountId}/messages`;

  const payload = {
    fromAddress: `${fromName} <${fromAddress}>`,
    toAddress,
    subject,
    content:    htmlBody,
    mailFormat: 'html',
    ...(textBody && { altText: textBody }),
  };

  try {
    const { data, status } = await axios.post(endpoint, payload, {
      headers: {
        Authorization:  `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout — important for serverless
    });

    // Zoho returns 200 + a messageId on success
    if (status === 200 && data?.data?.messageId) {
      console.log(`[AgriNova] ✅ Email sent → ${toAddress} (id: ${data.data.messageId})`);
      return { success: true, messageId: data.data.messageId };
    }

    throw new Error(`Unexpected Zoho response: ${JSON.stringify(data)}`);

  } catch (err) {
    const zohoError = err.response?.data;

    if (zohoError) {
      const code = zohoError?.data?.errorCode || zohoError?.status?.code;

      if (code === 'INVALID_OAUTHTOKEN') {
        throw new Error('Zoho token is invalid. Check ZOHO_REFRESH_TOKEN in Netlify env vars.');
      }
      if (code === 'INVALID_ACCOUNT') {
        throw new Error('ZOHO_ACCOUNT_ID is wrong. Re-check it in Zoho Mail API settings.');
      }
      if (code === 'QUOTA_EXCEEDED') {
        throw new Error('Zoho Mail daily sending quota exceeded.');
      }

      console.error('[AgriNova] Zoho API error:', JSON.stringify(zohoError));
      throw new Error(`Zoho Mail API error: ${JSON.stringify(zohoError)}`);
    }

    console.error('[AgriNova] Network error sending email:', err.message);
    throw err;
  }
}

module.exports = { send };
