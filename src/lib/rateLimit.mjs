const rateCache = new Map();

/**
 * Basic in-memory rate limiter
 * @param {string} key - The unique identifier (e.g. IP or visitor ID)
 * @param {number} limit - Max allowed requests in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} True if the request is allowed, false if rate limited
 */
export function rateLimit(key, limit, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  
  // Cleanup old entries randomly ~10% of the time to avoid memory leaks
  if (Math.random() < 0.1) {
    for (const [k, v] of rateCache.entries()) {
      if (now > v.resetTime) {
        rateCache.delete(k);
      }
    }
  }

  const record = rateCache.get(key) || { count: 0, resetTime: now + windowMs };
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count += 1;
  }
  
  rateCache.set(key, record);
  
  return record.count <= limit;
}
