export const RESERVATION_TTL_MS = 45_000;
export const RESEND_WINDOW_MS = 120_000;

export const decideBeginSignup = (row, now = Date.now()) => {
  if (!row) return { action: 'mint_and_reserve' };
  if (row.status === 'active') return { action: 'already_subscribed' };
  if (row.lastConfirmationSentAt && now - row.lastConfirmationSentAt < RESEND_WINDOW_MS) {
    return { action: 'signup_rate_limited' };
  }
  if (
    row.sendState === 'reserved' &&
    row.reservedAt &&
    now - row.reservedAt < RESERVATION_TTL_MS
  ) {
    return { action: 'signup_in_flight' };
  }
  return { action: 'mint_and_reserve' };
};

export const applyBeginSignup = (row, now = Date.now()) => {
  const decision = decideBeginSignup(row, now);
  if (decision.action !== 'mint_and_reserve') return { decision, row };
  return {
    decision,
    row: {
      ...(row || {}),
      status: 'pending',
      sendState: 'reserved',
      reservedAt: now,
      lastConfirmationSentAt: row?.lastConfirmationSentAt ?? null,
      tokenGeneration: (row?.tokenGeneration || 0) + 1
    }
  };
};

export const applySesFailure = (row) => ({
  ...row,
  sendState: 'idle',
  reservedAt: null
});

export const applySesSuccess = (row, now = Date.now()) => ({
  ...row,
  sendState: 'sent',
  reservedAt: null,
  lastConfirmationSentAt: now
});
