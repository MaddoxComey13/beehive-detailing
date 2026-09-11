// Stripe webhook. Stripe calls this after a gift is paid for. On
// checkout.session.completed we mint a unique gift code, store it in Netlify
// Blobs, and email the recipient. Idempotent: a retried event for the same
// session returns the code already issued rather than minting a second one.
//
// Configure in Stripe: add an endpoint pointing at
//   https://<your-site>/.netlify/functions/gift-webhook
// listening for `checkout.session.completed`, and put its signing secret in
// STRIPE_WEBHOOK_SECRET.

import {
  verifyStripeSignature, generateUniqueCode, saveGift, sendRecipientEmail,
  codeForSession, linkSession, giftPackage, requireEnv,
} from './lib/gift.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Raw body is required for signature verification — read as text, do not parse first.
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
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response('ignored', { status: 200 }); // ack unrelated events
  }

  const session = event.data.object;
  const meta = session.metadata || {};
  if (meta.kind !== 'gift') return new Response('ignored', { status: 200 });

  try {
    // Idempotency: if we already minted a code for this session, stop here.
    const existing = await codeForSession(session.id);
    if (existing) return new Response(JSON.stringify({ ok: true, code: existing }), { status: 200 });

    const pkg = giftPackage(meta.packageId);
    const code = await generateUniqueCode();
    const gift = {
      code,
      status: 'active',
      packageId: meta.packageId,
      packageLabel: meta.packageLabel || pkg?.label || 'Detail',
      amountCents: session.amount_total ?? pkg?.priceCents ?? null,
      buyerName: meta.buyerName || '',
      buyerEmail: meta.buyerEmail || session.customer_email || '',
      recipientName: meta.recipientName || '',
      recipientEmail: meta.recipientEmail || '',
      message: meta.message || '',
      stripeSessionId: session.id,
      createdAt: new Date().toISOString(),
      redeemedAt: null,
      redemption: null,
    };

    await saveGift(gift);
    await linkSession(session.id, code);

    try {
      await sendRecipientEmail({ gift });
      gift.recipientEmailedAt = new Date().toISOString();
      await saveGift(gift);
    } catch (mailErr) {
      // Payment already succeeded and the code is stored — don't fail the
      // webhook over email. Log it so we can resend by hand if needed.
      console.error('Recipient email failed for', code, mailErr);
    }

    return new Response(JSON.stringify({ ok: true, code }), { status: 200 });
  } catch (err) {
    console.error('gift-webhook processing failed:', err);
    // 500 tells Stripe to retry the event later.
    return new Response('processing error', { status: 500 });
  }
};
