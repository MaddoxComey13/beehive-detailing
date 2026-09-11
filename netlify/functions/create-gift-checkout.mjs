// Called by gift.js when the buyer clicks "Continue to secure checkout".
// Validates the selected package + the buyer/recipient details, then creates
// a Stripe Checkout Session and returns its hosted URL to redirect to.
//
// Pricing is server-authoritative: we look the package up in our own catalog
// and never trust an amount sent by the browser.

import { giftPackage, createCheckoutSession } from './lib/gift.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSG_MAX = 400; // keep under Stripe's 500-char metadata limit

function clean(s, max = 200) {
  return String(s || '').trim().slice(0, max);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const pkg = giftPackage(body.package);
  if (!pkg) return json({ ok: false, error: 'Please choose a gift package.' }, 400);

  const buyerName = clean(body.buyerName);
  const buyerEmail = clean(body.buyerEmail);
  const recipientName = clean(body.recipientName);
  const recipientEmail = clean(body.recipientEmail);
  const message = clean(body.message, MSG_MAX);

  if (!buyerName || !EMAIL_RE.test(buyerEmail)) {
    return json({ ok: false, error: 'Please enter your name and a valid email.' }, 400);
  }
  if (!recipientName || !EMAIL_RE.test(recipientEmail)) {
    return json({ ok: false, error: "Please enter the recipient's name and a valid email." }, 400);
  }

  try {
    const session = await createCheckoutSession(pkg, {
      buyerEmail,
      metadata: {
        kind: 'gift',
        packageId: pkg.id,
        packageLabel: pkg.label,
        buyerName,
        buyerEmail,
        recipientName,
        recipientEmail,
        message,
      },
    });
    return json({ ok: true, url: session.url });
  } catch (err) {
    console.error('create-gift-checkout failed:', err);
    // TEMP DEBUG: surface the real error to diagnose go-live issue. Revert.
    return json({ ok: false, error: 'Could not start checkout. Please try again or contact us.', detail: String(err && err.message || err) }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
