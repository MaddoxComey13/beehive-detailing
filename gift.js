// Beehive Detailing — gift purchase page.
// Buyer picks a named package + fills in from/to details, then we create a
// Stripe Checkout Session server-side and redirect to Stripe's hosted page.
// Prices here are for display only; create-gift-checkout.mjs is the source of
// truth for what's actually charged.

const GIFT_PACKAGES = [
  { id: 'silver',  label: 'Silver Detail',  price: 184, desc: 'Full inside-and-out detail, built their way.' },
  { id: 'gold',    label: 'Gold Detail',    price: 239, desc: 'The extras everyone adds anyway — tire shine, leather conditioning, carpet shampoo & more, all bundled in.', badge: 'Most gifted' },
  { id: 'diamond', label: 'Diamond Detail', price: 279, desc: 'Bumper to bumper, nothing held back. The full premium treatment.', badge: 'Best' },
];

const state = { package: null };

function money(n) { return `$${n.toFixed(0)}`; }

// Gold/Diamond carry the same premium card treatment as the rest of the site.
const THEMES = {
  gold:    { style: 'background:#FBF3DC;border-color:#B8860B;', badge: 'background:#B8860B;color:#fff;' },
  diamond: { style: 'background:#0F172A;border-color:#E24B4A;color:#fff;', badge: 'background:#DC2626;color:#fff;' },
};

function renderPackages() {
  const el = document.getElementById('giftPackages');
  el.innerHTML = GIFT_PACKAGES.map(p => {
    const selected = state.package === p.id;
    const theme = THEMES[p.id];
    const themed = selected && theme;
    const wrap = themed ? 'border-2' : (selected ? 'border-accent bg-accent/5' : 'border-ink/10 hover:border-ink/30');
    const style = themed ? theme.style : '';
    const descColor = themed && p.id === 'diamond' ? 'rgba(255,255,255,0.65)' : (themed ? '#6B5308' : 'rgb(15 23 42 / 0.6)');
    return `
    <button type="button" data-package="${p.id}"
      class="option-card text-left rounded-3xl border ${wrap} p-6 sm:p-7 transition-colors relative" style="${style}">
      ${p.badge ? `<span class="absolute -top-3 left-6 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold" style="${theme ? theme.badge : 'background:#DC2626;color:#fff;'}">${p.badge}</span>` : ''}
      <div class="flex items-center justify-between mb-2 mt-1">
        <span class="font-bold text-lg">${p.label}</span>
        <span class="text-2xl font-extrabold tracking-tight">${money(p.price)}</span>
      </div>
      <p class="text-sm" style="color:${descColor};">${p.desc}</p>
    </button>`;
  }).join('');
}

function selectedPackage() { return GIFT_PACKAGES.find(p => p.id === state.package) || null; }

function updateBar() {
  const pkg = selectedPackage();
  document.getElementById('giftTotal').textContent = pkg ? money(pkg.price) : '$—';
  document.getElementById('checkoutBtn').disabled = !pkg;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readForm() {
  return {
    package: state.package,
    buyerName: document.getElementById('buyerName').value.trim(),
    buyerEmail: document.getElementById('buyerEmail').value.trim(),
    recipientName: document.getElementById('recipientName').value.trim(),
    recipientEmail: document.getElementById('recipientEmail').value.trim(),
    message: document.getElementById('giftMessage').value.trim(),
  };
}

function validate(f) {
  if (!f.package) return 'Please choose a gift package.';
  if (!f.buyerName || !EMAIL_RE.test(f.buyerEmail)) return 'Enter your name and a valid email.';
  if (!f.recipientName || !EMAIL_RE.test(f.recipientEmail)) return "Enter the recipient's name and a valid email.";
  return null;
}

async function startCheckout() {
  const btn = document.getElementById('checkoutBtn');
  const form = readForm();
  const err = validate(form);
  if (err) { alert(err); return; }

  btn.disabled = true;
  btn.textContent = 'Redirecting…';
  try {
    const res = await fetch('/.netlify/functions/create-gift-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok || !data.ok || !data.url) {
      throw new Error(data.error || `Server returned ${res.status}`);
    }
    window.location.href = data.url; // Stripe hosted checkout
  } catch (e) {
    console.error('Gift checkout failed:', e);
    alert(`Couldn't start checkout: ${e.message}\n\nPlease try again or contact us.`);
    btn.disabled = false;
    btn.textContent = 'Continue to secure checkout →';
  }
}

function init() {
  // Post-Stripe redirect banners.
  const status = new URLSearchParams(window.location.search).get('status');
  if (status === 'cancel') document.getElementById('cancelBanner').classList.remove('hidden');
  if (status === 'success') {
    document.getElementById('successBanner').classList.remove('hidden');
    // Finalize server-side (issue code + email the recipient) using the
    // session id Stripe appended to the success URL. No webhook needed.
    const sid = new URLSearchParams(window.location.search).get('session_id');
    if (sid) {
      fetch('/.netlify/functions/finalize-gift?session_id=' + encodeURIComponent(sid)).catch(() => {});
    }
  }

  // Preselect from ?pkg= (lets homepage/gift buttons deep-link a tier).
  const pkgParam = new URLSearchParams(window.location.search).get('pkg');
  if (GIFT_PACKAGES.some(p => p.id === pkgParam)) state.package = pkgParam;

  renderPackages();
  updateBar();

  document.getElementById('giftPackages').addEventListener('click', e => {
    const btn = e.target.closest('[data-package]');
    if (!btn) return;
    state.package = btn.dataset.package;
    renderPackages();
    updateBar();
  });

  document.getElementById('checkoutBtn').addEventListener('click', startCheckout);
}

document.addEventListener('DOMContentLoaded', init);
