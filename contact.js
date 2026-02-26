/**
 * netlify/functions/contact.js
 * ─────────────────────────────────────────────────────────────────
 * Netlify Serverless Function — AgriNova Labs Contact Form
 *
 * Triggered by: POST /.netlify/functions/contact
 * (or via the /api/contact redirect defined in netlify.toml)
 *
 * What it does:
 *  1. Validates the incoming JSON payload
 *  2. Sends a notification email → oselu@agrinovalabs.site
 *  3. Sends an auto-reply → the person who submitted the form
 *  4. Returns JSON { success, message } to the front-end
 * ─────────────────────────────────────────────────────────────────
 */

const mailer    = require('./zoho/mailer');
const validator = require('./utils/validator');

// ── Simple in-memory rate limiter ─────────────────────────────────
// Netlify Function instances can be reused ("warm"), so this gives
// basic protection. For stricter limiting use Netlify Edge or Redis.
const RATE_WINDOW_MS  = 15 * 60 * 1000; // 15 minutes
const RATE_MAX        = 10;              // max submissions per IP
const ipLog           = new Map();

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = ipLog.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_WINDOW_MS) {
    // Window has expired — reset
    ipLog.set(ip, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= RATE_MAX) return true;

  entry.count++;
  ipLog.set(ip, entry);
  return false;
}

// ── Netlify Function handler ──────────────────────────────────────
exports.handler = async function (event) {

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return respond(405, { success: false, error: 'Method Not Allowed' });
  }

  // CORS headers — allow your front-end origin
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(allowedOrigin),
      body: '',
    };
  }

  // ── Rate limiting ────────────────────────────────────────────────
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return respond(429, {
      success: false,
      error:   'Too many submissions. Please wait 15 minutes and try again.',
    }, allowedOrigin);
  }

  // ── Parse body ───────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { success: false, error: 'Invalid JSON body.' }, allowedOrigin);
  }

  const {
    firstName = '',
    lastName  = '',
    email     = '',
    phone     = '',
    interest  = '',
    message   = '',
  } = body;

  // ── Validate ─────────────────────────────────────────────────────
  const errors = validator.validate({ firstName, email, message });
  if (errors.length > 0) {
    return respond(400, { success: false, errors }, allowedOrigin);
  }

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const subject  = `AgriNova Inquiry${interest ? ': ' + interest : ''} — from ${fullName}`;
  const fromAddr = process.env.ZOHO_FROM_EMAIL;

  // ── Send emails ──────────────────────────────────────────────────
  try {
    // 1️⃣  Notification to the AgriNova team
    await mailer.send({
      fromName:    'AgriNova Labs Website',
      fromAddress:  fromAddr,
      toAddress:   'oselu@agrinovalabs.site',
      subject,
      htmlBody:    teamEmailHtml({ fullName, email, phone, interest, message }),
      textBody:    teamEmailText({ fullName, email, phone, interest, message }),
    });

    // 2️⃣  Auto-reply to the person who submitted the form
    await mailer.send({
      fromName:    'AgriNova Labs',
      fromAddress:  fromAddr,
      toAddress:    email.trim(),
      subject:     `We received your message, ${firstName.trim()}! — AgriNova Labs`,
      htmlBody:    autoReplyHtml(firstName.trim()),
      textBody:    autoReplyText(firstName.trim()),
    });

    return respond(200, {
      success: true,
      message: `Thank you, ${firstName.trim()}! Your message has been sent. We'll be in touch within 24 hours.`,
    }, allowedOrigin);

  } catch (err) {
    console.error('[AgriNova] Function error:', err.message);
    return respond(500, {
      success: false,
      error:   'Failed to send your message. Please email us directly at oselu@agrinovalabs.site',
    }, allowedOrigin);
  }
};

// ── Helpers ───────────────────────────────────────────────────────

function respond(statusCode, body, origin = '*') {
  return {
    statusCode,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  };
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Email Templates ───────────────────────────────────────────────

function teamEmailHtml({ fullName, email, phone, interest, message }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/>
<style>
  body{margin:0;padding:0;background:#f0faf2;font-family:Arial,sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid rgba(76,175,80,.2);box-shadow:0 4px 24px rgba(45,122,58,.08);}
  .hdr{background:linear-gradient(135deg,#2d7a3a,#4caf58);padding:30px 40px;text-align:center;}
  .hdr h1{color:#fff;font-size:1.35rem;margin:0;letter-spacing:-.01em;}
  .hdr p{color:rgba(255,255,255,.8);margin:6px 0 0;font-size:.83rem;}
  .bdy{padding:34px 40px;}
  .bdy h2{color:#2d7a3a;font-size:1rem;margin:0 0 22px;}
  .row{margin-bottom:16px;}
  .lbl{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#5a8a62;margin-bottom:3px;}
  .val{color:#1e3d24;font-size:.92rem;line-height:1.6;margin:0;}
  .msgbox{background:#f0faf2;border-left:4px solid #4caf58;border-radius:0 10px 10px 0;padding:14px 18px;margin-top:6px;}
  .msgbox p{margin:0;color:#1e3d24;font-size:.89rem;line-height:1.75;white-space:pre-wrap;}
  hr{border:none;border-top:1px solid rgba(76,175,80,.15);margin:22px 0;}
  .ftr{background:#d4f0d8;padding:16px 40px;text-align:center;font-size:.73rem;color:#5a8a62;}
  .ftr a{color:#2d7a3a;text-decoration:none;font-weight:600;}
  .badge{display:inline-block;background:rgba(76,175,80,.12);border:1px solid rgba(76,175,80,.25);color:#2d7a3a;padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:600;margin-left:6px;vertical-align:middle;}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>🌿 AgriNova Labs</h1>
    <p>New contact form submission from agrinovaai.com</p>
  </div>
  <div class="bdy">
    <h2>📬 You have a new message <span class="badge">via Netlify + Zoho</span></h2>
    <div class="row"><div class="lbl">Full Name</div><p class="val">${esc(fullName)}</p></div>
    <div class="row"><div class="lbl">Reply-To Email</div><p class="val"><a href="mailto:${esc(email)}" style="color:#4caf58;">${esc(email)}</a></p></div>
    <div class="row"><div class="lbl">Phone Number</div><p class="val">${esc(phone || 'Not provided')}</p></div>
    <div class="row"><div class="lbl">Area of Interest</div><p class="val">${esc(interest || 'Not specified')}</p></div>
    <hr/>
    <div class="row">
      <div class="lbl">Message</div>
      <div class="msgbox"><p>${esc(message)}</p></div>
    </div>
  </div>
  <div class="ftr">
    Sent via <a href="https://agrinovaai.com">agrinovaai.com</a> &middot; Netlify Functions &middot; Zoho Mail &middot;
    Reply directly to <a href="mailto:${esc(email)}">${esc(email)}</a>
  </div>
</div>
</body>
</html>`;
}

function teamEmailText({ fullName, email, phone, interest, message }) {
  return `NEW CONTACT FORM SUBMISSION — AgriNova Labs
=============================================
Full Name  : ${fullName}
Email      : ${email}
Phone      : ${phone || 'Not provided'}
Interest   : ${interest || 'Not specified'}

MESSAGE:
--------
${message}

---------------------------------------------
Sent via agrinovaai.com | Netlify + Zoho Mail
Reply directly to: ${email}
`;
}

function autoReplyHtml(firstName) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/>
<style>
  body{margin:0;padding:0;background:#f0faf2;font-family:Arial,sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid rgba(76,175,80,.2);}
  .hdr{background:linear-gradient(135deg,#2d7a3a,#4caf58);padding:30px 40px;text-align:center;}
  .hdr h1{color:#fff;font-size:1.35rem;margin:0;}
  .hdr p{color:rgba(255,255,255,.8);margin:7px 0 0;font-size:.83rem;}
  .bdy{padding:34px 40px;color:#1e3d24;line-height:1.8;font-size:.93rem;}
  .bdy h2{color:#2d7a3a;margin:0 0 16px;}
  .box{background:#f0faf2;border-radius:12px;padding:16px 20px;margin:20px 0;font-size:.86rem;color:#5a8a62;line-height:1.75;}
  .box a{color:#2d7a3a;font-weight:600;text-decoration:none;}
  .cta{display:inline-block;background:#2d7a3a;color:#fff;padding:12px 26px;border-radius:50px;text-decoration:none;font-weight:700;font-size:.88rem;margin-top:6px;}
  .ftr{background:#d4f0d8;padding:16px 40px;text-align:center;font-size:.73rem;color:#5a8a62;}
  .ftr a{color:#2d7a3a;text-decoration:none;font-weight:600;}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>🌿 AgriNova Labs</h1>
    <p>AI-Powered Precision Farming · agrinovaai.com</p>
  </div>
  <div class="bdy">
    <h2>Hi ${esc(firstName)}, we got your message! 👋</h2>
    <p>Thank you for reaching out to <strong>AgriNova Labs</strong>. Our team has received your message and will respond within <strong>24 business hours</strong>.</p>
    <div class="box">
      📞 <strong>Need urgent help?</strong> Call us: <strong>+234 706 234 5678</strong><br/>
      📧 <strong>Email:</strong> <a href="mailto:oselu@agrinovalabs.site">oselu@agrinovalabs.site</a><br/>
      🕐 <strong>Hours:</strong> Monday – Friday, 8:00 AM – 6:00 PM WAT
    </div>
    <p>In the meantime, explore what we're building for African agriculture:</p>
    <a href="https://agrinovaai.com" class="cta">Visit AgriNova Labs →</a>
    <p style="margin-top:28px;">Warm regards,<br/><strong>The AgriNova Labs Team 🌾</strong></p>
  </div>
  <div class="ftr">
    © 2025 AgriNova Labs &middot; Awoyaya, Lagos State, Nigeria &middot;
    <a href="https://agrinovaai.com">agrinovaai.com</a>
  </div>
</div>
</body>
</html>`;
}

function autoReplyText(firstName) {
  return `Hi ${firstName},

Thank you for reaching out to AgriNova Labs!

We've received your message and will reply within 24 business hours.

NEED HELP SOONER?
  📞 Call   : +234 706 234 5678
  📧 Email  : oselu@agrinovalabs.site
  🕐 Hours  : Mon–Fri, 8:00 AM – 6:00 PM WAT

Explore our platform: https://agrinovaai.com

Warm regards,
The AgriNova Labs Team 🌾
Awoyaya, Lagos State, Nigeria
`;
}
