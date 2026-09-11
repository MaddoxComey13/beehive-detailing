// TEMPORARY diagnostic endpoint — REMOVE after go-live testing.
// Guarded by a fixed token so it isn't publicly enumerable. Lists the most
// recent gift records so we can see whether the webhook fired, stored a code,
// and sent the recipient email — without needing Netlify log access.

import { getStore } from '@netlify/blobs';

const TOKEN = 'dbg-9f3k2m-remove-me';

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('key') !== TOKEN) {
    return new Response('nope', { status: 404 });
  }

  const env = {
    hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasResendKey: !!process.env.RESEND_API_KEY,
    giftFrom: process.env.GIFT_FROM_EMAIL || '(default) gifts@beehivedetailingco.com',
    siteUrl: process.env.URL || process.env.SITE_URL || null,
  };

  let gifts = [];
  try {
    const store = getStore('gift-codes');
    const listing = await store.list();
    const keys = (listing.blobs || []).map(b => b.key).filter(k => !k.startsWith('session:'));
    for (const key of keys.slice(-10)) {
      const g = await store.get(key, { type: 'json' });
      if (!g) continue;
      gifts.push({
        code: g.code,
        status: g.status,
        packageId: g.packageId,
        recipientEmail: g.recipientEmail,
        createdAt: g.createdAt,
        recipientEmailedAt: g.recipientEmailedAt || null,
      });
    }
  } catch (err) {
    return json({ ok: false, env, error: String(err && err.message || err) });
  }

  return json({ ok: true, env, giftCount: gifts.length, gifts });
};

function json(data) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}
