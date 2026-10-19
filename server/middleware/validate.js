/**
 * Input validation & sanitisation middleware.
 * Strips HTML tags from all string inputs to prevent stored XSS.
 */

const stripTags = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
};

const sanitiseObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      clean[key] = stripTags(value);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitiseObject(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
};

export const sanitiseInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitiseObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitiseObject(req.query);
  }
  next();
};

/** Email format validation */
export const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Password strength: min 8 chars, 1 uppercase, 1 number */
export const isStrongPassword = (password) =>
  password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
