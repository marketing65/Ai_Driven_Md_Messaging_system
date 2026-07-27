import rateLimit from 'express-rate-limit';

// 1. General Rate Limiter (prevents spamming overall server APIs)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes'
  }
});

// 2. Auth Endpoint Limiter (strict rate limits on login/OTP/reset password)
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 15, // Limit each IP to 15 authentication attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP, please try again in an hour'
  }
});

// 3. XSS Sanitization Helper
function sanitizeInput(val) {
  if (typeof val === 'string') {
    // Strip script tags and execution vectors but leave normal text intact
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script>...</script>
      .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers like onload="..."
      .replace(/on\w+='[^']*'/gi, '')
      .replace(/javascript:[^\s]*/gi, ''); // Remove javascript: URLs
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeInput);
  }
  if (val !== null && typeof val === 'object') {
    const sanitizedObj = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        sanitizedObj[key] = sanitizeInput(val[key]);
      }
    }
    return sanitizedObj;
  }
  return val;
}

export function xssSanitizer(req, res, next) {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.query) req.query = sanitizeInput(req.query);
  if (req.params) req.params = sanitizeInput(req.params);
  next();
}
