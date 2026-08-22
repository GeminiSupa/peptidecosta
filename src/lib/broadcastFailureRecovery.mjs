/**
 * Decide which broadcasts a batch-level exception may change.
 * Completed/requeued broadcasts stay untouched, the active one fails, and
 * later unattempted broadcasts return to pending for the next cron run.
 */
export function broadcastFailureRecovery(processingIds = [], settledIds = [], activeId = null) {
  const settled = new Set(settledIds || []);
  return {
    failedIds: activeId && !settled.has(activeId) ? [activeId] : [],
    requeueIds: (processingIds || []).filter((id) => id !== activeId && !settled.has(id)),
  };
}

