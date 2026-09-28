// Shared gift-card helper: package catalog, code storage (Netlify Blobs),
// Stripe Checkout, Stripe webhook signature verification, and the recipient
// email (Resend). Mirrors lib/jobber.mjs's style: plain fetch, no SDKs, so
// the only dependency is @netlify/blobs (already in package.json).
//
// Model: a gift buys ONE named package at its standard-vehicle price. At
// redemption that package's base price is prepaid; the recipient pays only
// for a larger vehicle or extra add-ons. One code, one redemption.

import { getStore } from '@netlify/blobs';
import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';

// ---- Package catalog (server-authoritative prices, in cents) --------------
// Prices MUST match booking.js / create-booking.mjs. Only these tiers are
// sold as gifts (Quick/Bronze are cheap enough that few gift them).
export const GIFT_PACKAGES = {
  silver:  { id: 'silver',  label: 'Silver Detail',  priceCents: 18400, blurb: 'Full inside-and-out detail, built their way.' },
  gold:    { id: 'gold',    label: 'Gold Detail',    priceCents: 23900, blurb: 'The extras everyone adds anyway, all bundled in.' },
  diamond: { id: 'diamond', label: 'Diamond Detail', priceCents: 27900, blurb: 'Bumper to bumper, nothing held back.' },
};

export function giftPackage(id) {
  return GIFT_PACKAGES[id] || null;
}

// ---- Config ---------------------------------------------------------------
// Netlify injects URL (the site's canonical URL) at runtime. Fall back to the
// live domain so links in emails are never broken in local/dev.
export function siteUrl() {
  return (process.env.URL || process.env.SITE_URL || 'https://beehivedetailingco.com').replace(/\/$/, '');
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// ---- Code storage (Netlify Blobs) -----------------------------------------
const GIFT_STORE = 'gift-codes';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L

function giftStore() {
  return getStore(GIFT_STORE);
}

// Human-friendly, hard-to-typo code like GIFT-8K3M-Q7W2.
function randomCode() {
  const block = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `GIFT-${block()}-${block()}`;
}

// Generate a code that isn't already taken (collisions are astronomically
// unlikely, but check anyway since a duplicate would overwrite a real gift).
export async function generateUniqueCode() {
  const store = giftStore();
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const existing = await store.get(code, { type: 'json' });
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique gift code after several tries.');
}

export async function saveGift(record) {
  await giftStore().setJSON(record.code, record);
  return record;
}

export async function getGift(code) {
  if (!code) return null;
  return giftStore().get(String(code).trim().toUpperCase(), { type: 'json' });
}

// Idempotency for the webhook: one Stripe checkout session should only ever
// mint one code, even if Stripe retries the event. We key a small marker by
// session id so a retry returns the code already issued instead of a new one.
export async function codeForSession(sessionId) {
  const marker = await giftStore().get(`session:${sessionId}`, { type: 'json' });
  return marker?.code || null;
}

export async function linkSession(sessionId, code) {
  await giftStore().setJSON(`session:${sessionId}`, { code });
}

// Atomically-ish redeem: returns { ok, gift, error }. Blobs has no locks, so
// this is best-effort — fine at this volume (one operator, low concurrency).
export async function redeemGift(code, redemption) {
  const gift = await getGift(code);
  if (!gift) return { ok: false, error: 'That gift code was not found.' };
  if (gift.status === 'redeemed') return { ok: false, error: 'That gift code has already been used.' };
  if (gift.status !== 'active') return { ok: false, error: 'That gift code is not active.' };
  gift.status = 'redeemed';
  gift.redeemedAt = new Date().toISOString();
  gift.redemption = redemption || null;
  await saveGift(gift);
  return { ok: true, gift };
}

// ---- Stripe (via REST, form-encoded) --------------------------------------
function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      formEncode(value, field, out);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') formEncode(item, `${field}[${i}]`, out);
        else out.append(`${field}[${i}]`, String(item));
      });
    } else {
      out.append(field, String(value));
    }
  }
  return out;
}

export async function createCheckoutSession(pkg, { buyerEmail, metadata }) {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  const body = formEncode({
    mode: 'payment',
    // {CHECKOUT_SESSION_ID} is substituted by Stripe on redirect so the success
    // page can finalize the gift server-side (retrieve session -> issue code +
    // email) without depending on the webhook.
    success_url: `${siteUrl()}/gift.html?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/gift.html?status=cancel`,
    customer_email: buyerEmail,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: pkg.priceCents,
        product_data: { name: `${pkg.label} — Gift Card`, description: 'Beehive Detailing prepaid gift' },
      },
    }],
    // Stripe metadata values are strings, max 500 chars each.
    metadata,
    payment_intent_data: { metadata },
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe error: ${json.error?.message || res.status}`);
  return json; // has .url to redirect the buyer to
}

// Retrieve a Checkout Session by id (to finalize a gift from the success page).
export async function retrieveCheckoutSession(sessionId) {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { 'Authorization': `Bearer ${secret}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe error: ${json.error?.message || res.status}`);
  return json;
}

// List recent Checkout Sessions (used to recover a paid gift whose redirect
// didn't carry a session_id). Newest first.
export async function listRecentSessions(limit = 5) {
  const secret = requireEnv('STRIPE_SECRET_KEY');
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${secret}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe error: ${json.error?.message || res.status}`);
  return json.data || [];
}

// Idempotently turn a PAID gift checkout session into a stored code + email.
// Safe to call multiple times (webhook and/or success page) — one code per
// session, guaranteed by the session->code link.
export async function issueGiftForSession(session) {
  if (!session || (session.metadata && session.metadata.kind !== 'gift')) {
    return { ok: false, reason: 'not-a-gift' };
  }
  if (session.payment_status && session.payment_status !== 'paid') {
    return { ok: false, reason: `not-paid:${session.payment_status}` };
  }
  const existing = await codeForSession(session.id);
  if (existing) {
    const g = await getGift(existing);
    return { ok: true, code: existing, alreadyIssued: true, emailed: !!(g && g.recipientEmailedAt) };
  }
  const meta = session.metadata || {};
  const pkg = giftPackage(meta.packageId);
  const code = await generateUniqueCode();
  const gift = {
    code, status: 'active',
    packageId: meta.packageId,
    packageLabel: meta.packageLabel || pkg?.label || 'Detail',
    amountCents: session.amount_total ?? pkg?.priceCents ?? null,
    buyerName: meta.buyerName || '',
    buyerEmail: meta.buyerEmail || session.customer_email || session.customer_details?.email || '',
    recipientName: meta.recipientName || '',
    recipientEmail: meta.recipientEmail || '',
    message: meta.message || '',
    stripeSessionId: session.id,
    createdAt: new Date().toISOString(),
    redeemedAt: null, redemption: null,
  };
  await saveGift(gift);
  await linkSession(session.id, code);
  let emailed = false, emailErr = null;
  try {
    await sendRecipientEmail({ gift });
    gift.recipientEmailedAt = new Date().toISOString();
    await saveGift(gift);
    emailed = true;
  } catch (e) {
    emailErr = String(e && e.message || e);
  }
  return { ok: true, code, alreadyIssued: false, emailed, emailErr };
}

// Verify a Stripe webhook signature without the SDK.
// Header format: "t=<unix>,v1=<hex hmac of `${t}.${rawBody}`>".
export function verifyStripeSignature(rawBody, sigHeader, secret, toleranceSec = 300) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => p.split('=').map(s => s.trim()))
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  // Reject stale timestamps (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- Recipient email (Resend) ---------------------------------------------
export async function sendRecipientEmail({ gift }) {
  const apiKey = requireEnv('RESEND_API_KEY');
  const from = process.env.GIFT_FROM_EMAIL || 'gifts@beehivedetailingco.com';
  const bookingUrl = `${siteUrl()}/booking.html?gift=${encodeURIComponent(gift.code)}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Beehive Detailing <${from}>`,
      to: [gift.recipientEmail],
      reply_to: process.env.GIFT_REPLY_TO || from,
      subject: `${gift.buyerName || 'Someone'} sent you a detail 🎁`,
      html: recipientEmailHtml({ gift, bookingUrl }),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error (${res.status}): ${text}`);
  }
  return res.json();
}

function recipientEmailHtml({ gift, bookingUrl }) {
  const msg = (gift.message || '').trim();
  return `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e6eaf0;">
        <tr><td style="background:#0F172A;padding:24px 32px;text-align:center;">
          <img src="${siteUrl()}/logo.png" alt="Beehive Detailing" width="44" height="44" style="display:inline-block;vertical-align:middle;object-fit:contain;" />
          <span style="font-size:20px;font-weight:800;letter-spacing:1px;color:#fff;vertical-align:middle;margin-left:10px;">BEEHIVE</span>
          <span style="font-size:20px;font-weight:400;letter-spacing:0.5px;color:rgba(255,255,255,0.55);vertical-align:middle;">&nbsp;Detailing</span>
        </td></tr>
        <tr><td style="padding:34px 32px 8px;text-align:center;">
          <div style="font-size:13px;text-transform:uppercase;letter-spacing:2px;color:#64748b;">You've been gifted</div>
          <div style="font-size:30px;font-weight:900;letter-spacing:-0.5px;margin:8px 0 6px;">A ${gift.packageLabel}</div>
          <div style="font-size:15px;color:#475569;">from ${gift.buyerName || 'a friend'}</div>
        </td></tr>
        ${msg ? `<tr><td style="padding:14px 32px;">
          <div style="background:#FBF3DC;border-radius:14px;padding:16px 18px;font-size:15px;line-height:1.55;color:#6B5308;font-style:italic;">&ldquo;${escapeHtml(msg)}&rdquo;</div>
        </td></tr>` : ''}
        <tr><td style="padding:18px 32px 6px;text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#64748b;margin-bottom:8px;">Your gift code</div>
          <div style="display:inline-block;border:2px dashed #B8860B;border-radius:12px;padding:14px 22px;font-size:24px;font-weight:800;letter-spacing:2px;color:#0F172A;">${gift.code}</div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;text-align:center;">
          <a href="${bookingUrl}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 34px;border-radius:999px;">Book your detail →</a>
        </td></tr>
        <tr><td style="padding:14px 32px 32px;text-align:center;">
          <div style="font-size:13px;color:#64748b;line-height:1.6;">We come to you anywhere in Salt Lake City &amp; the Wasatch Front. Your code is applied automatically when you book with the link above. Covers a standard vehicle; larger vehicles or extra add-ons are billed at booking.</div>
        </td></tr>
      </table>
      <div style="max-width:480px;margin-top:16px;font-size:11px;color:#94a3b8;text-align:center;">Beehive Detailing · Salt Lake City, UT</div>
    </td></tr>
  </table>
  </body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
