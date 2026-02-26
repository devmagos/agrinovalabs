/**
 * netlify/functions/utils/validator.js
 * ─────────────────────────────────────────────────────────────────
 * Server-side validation for contact form fields.
 * Returns an array of error strings. Empty array = all valid.
 * ─────────────────────────────────────────────────────────────────
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {{ firstName: string, email: string, message: string }} fields
 * @returns {string[]} Error messages. Empty = valid.
 */
function validate({ firstName, email, message }) {
  const errors = [];

  if (!firstName || String(firstName).trim().length < 2) {
    errors.push('First name must be at least 2 characters.');
  }
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    errors.push('A valid email address is required.');
  }
  if (!message || String(message).trim().length < 10) {
    errors.push('Message must be at least 10 characters.');
  }
  if (message && String(message).trim().length > 5000) {
    errors.push('Message must not exceed 5,000 characters.');
  }

  return errors;
}

module.exports = { validate };
