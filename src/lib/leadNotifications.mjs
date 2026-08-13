const emailKey = (value) => String(value || '').trim().toLowerCase();

export function mergeLeadEmailRecipients({ assignedAgentEmail = '', backup = [], fallback = [] } = {}) {
  const values = [assignedAgentEmail, ...backup, ...fallback]
    .map((value) => String(value || '').trim())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  return values.filter((value, index) => values.findIndex((candidate) => emailKey(candidate) === emailKey(value)) === index);
}

export function responseDeadline(now, minutes = 15) {
  const safeMinutes = Math.min(1440, Math.max(5, Number(minutes) || 15));
  return new Date(new Date(now).getTime() + safeMinutes * 60 * 1000).toISOString();
}

