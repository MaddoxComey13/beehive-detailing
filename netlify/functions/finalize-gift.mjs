// Finalizes a gift right after Stripe redirects to the success page — no
// webhook required. gift.js calls this with the session_id Stripe puts in the
// success URL. We retrieve the session server-side (secret key), confirm it's
// paid, then idempotently issue the code + email the recipient.

import { retrieveCheckoutSession, issueGiftForSession } from './lib/gift.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) return json({ ok: false, error: 'Missing session_id.' }, 400);

  try {
    const session = await retrieveCheckoutSession(sessionId);
    const result = await issueGiftForSession(session);
    if (!result.ok) return json({ ok: false, error: result.reason || 'Could not finalize.' }, 409);
    // The recipient gets the code by email; the buyer's success page only needs
    // a confirmation, so we return no code/PII here.
    return json({ ok: true, issued: !result.alreadyIssued, emailed: result.emailed });
  } catch (err) {
    console.error('finalize-gift failed:', err);
    return json({ ok: false, error: 'Could not finalize the gift.' }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
