// Called by booking.js to check a gift code before booking. Read-only: it
// never marks the code redeemed (that happens server-side in create-booking
// when the request is actually submitted). Returns the package the code is
// good for so the booking page can lock to it and show a PREPAID badge.

import { getGift } from './lib/gift.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) return json({ ok: false, error: 'No code provided.' }, 400);

  try {
    const gift = await getGift(code);
    if (!gift) return json({ ok: false, error: 'That gift code was not found.' }, 404);
    if (gift.status === 'redeemed') return json({ ok: false, error: 'That gift code has already been used.' }, 409);
    if (gift.status !== 'active') return json({ ok: false, error: 'That gift code is not active.' }, 409);

    return json({
      ok: true,
      code: gift.code,
      packageId: gift.packageId,
      packageLabel: gift.packageLabel,
      buyerName: gift.buyerName || null,
    });
  } catch (err) {
    console.error('validate-gift failed:', err);
    return json({ ok: false, error: 'Could not check that code right now.' }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
