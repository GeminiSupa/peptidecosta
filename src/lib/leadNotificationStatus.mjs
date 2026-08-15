const copy = (value) => String(value || '').trim();

export function summarizeLeadNotificationJob(job) {
  if (!job) {
    return {
      tone: 'unknown',
      label: 'Not tracked',
      detail: 'No delivery record exists for this enquiry.',
      sent: 0,
      failed: 0,
      total: 0,
      retryable: false,
    };
  }
  const deliveries = Array.isArray(job.lead_notification_deliveries)
    ? job.lead_notification_deliveries
    : [];
  const sent = deliveries.filter((entry) => ['sent', 'delivered', 'read'].includes(entry.status)).length;
  const failed = deliveries.filter((entry) => entry.status === 'failed').length;
  const total = deliveries.length;
  const status = copy(job.status).toLowerCase();

  if (status === 'delivered') {
    return {
      tone: 'success',
      label: `Alerts accepted ${sent}/${total}`,
      detail: 'Email/WhatsApp providers accepted every configured alert.',
      sent, failed, total, retryable: false,
    };
  }
  if (status === 'failed') {
    return {
      tone: 'danger',
      label: 'Alerts failed',
      detail: copy(job.last_error) || 'No configured alert could be delivered.',
      sent, failed, total, retryable: true,
    };
  }
  if (status === 'partial') {
    return {
      tone: 'warning',
      label: `Alerts partial ${sent}/${Math.max(total, sent + failed)}`,
      detail: copy(job.last_error) || 'Some recipients were accepted and failed recipients will be retried.',
      sent, failed, total, retryable: true,
    };
  }
  return {
    tone: 'pending',
    label: status === 'processing' ? 'Sending alerts…' : 'Alerts queued',
    detail: copy(job.last_error) || 'The delivery worker will retry automatically.',
    sent, failed, total, retryable: false,
  };
}

export function leadNotificationRecipientSummary(job) {
  const deliveries = Array.isArray(job?.lead_notification_deliveries)
    ? job.lead_notification_deliveries
    : [];
  return deliveries
    .map((entry) => `${entry.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} ${entry.destination}: ${entry.status}`)
    .join('\n');
}
