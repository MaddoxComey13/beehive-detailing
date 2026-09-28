// Stripe webhook (backup path). The primary path is finalize-gift, called from
// the success page. This webhook also issues the gift on
// checkout.session.completed, so a gift is delivered even if the buyer closes
// the tab before the redirect. Both paths share issueGiftForSession, which is
// idempotent (one code per session), so they never double-issue.
//
// Configure in Stripe: endpoint https://<your-site>/.netlify/functions/gift-webhook
// listening for `checkout.session.completed`, with STRIPE_WEBHOOK_SECRET set.

import { verifyStripeSignature, issueGiftForSession, requireEnv } from './lib/gift.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Raw body is required for signature verification — read as text, don't parse first.
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');

  let secret;
  try {
    secret = requireEnv('STRIPE_WEBHOOK_SECRET');
  } catch (err) {
    console.error(err);
    return new Response('Webhook not configured', { status: 500 });
  }

  if (!verifyStripeSignature(raw, sig, secret)) {
    return new Response('Invalid signature', { status: 400 });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }

  if (event.type !== 'checkout.session.completed') return new Response('ignored', { status: 200 });

  try {
    const result = await issueGiftForSession(event.data.object);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err) {
    console.error('gift-webhook processing failed:', err);
    return new Response('processing error', { status: 500 }); // 500 => Stripe retries
  }
};
