// Finalizes a gift right after Stripe redirects to the success page — no
// webhook required. gift.js calls this with the session_id Stripe puts in the
// success URL. We retrieve the session server-side (secret key), confirm it's
// paid, then idempotently issue the code + email the recipient.
//
// Admin recovery: calling with ?key=<token> and no session_id finds the most
// recent PAID gift session and finalizes it — used to recover a payment whose
// redirect didn't carry a session_id. (Guarded; remove the token after launch.)

import { retrieveCheckoutSession, listRecentSessions, issueGiftForSession } from './lib/gift.mjs';

const ADMIN_TOKEN = 'dbg-9f3k2m-remove-me';

export default async (req) => {
  const url = new URL(req.url);
  let sessionId = url.searchParams.get('session_id');

  try {
    // Admin recovery path: no session_id but valid token -> find latest paid gift.
    if (!sessionId && url.searchParams.get('key') === ADMIN_TOKEN) {
      const sessions = await listRecentSessions(10);
      const paidGift = sessions.find(s => s.metadata?.kind === 'gift' && s.payment_status === 'paid');
      if (!paidGift) return json({ ok: false, error: 'No recent paid gift session found.' }, 404);
      const result = await issueGiftForSession(paidGift);
      return json({ recovered: true, sessionId: paidGift.id, ...result });
    }

    if (!sessionId) return json({ ok: false, error: 'Missing session_id.' }, 400);

    const session = await retrieveCheckoutSession(sessionId);
    const result = await issueGiftForSession(session);
    if (!result.ok) return json({ ok: false, error: result.reason || 'Could not finalize.' }, 409);
    // Only return the code to the buyer's own success page, not the recipient's;
    // the recipient gets it by email. We return a minimal confirmation.
    return json({ ok: true, issued: !result.alreadyIssued, emailed: result.emailed });
  } catch (err) {
    console.error('finalize-gift failed:', err);
    return json({ ok: false, error: 'Could not finalize the gift.' }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
