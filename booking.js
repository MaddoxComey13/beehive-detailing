// Beehive Detailing — booking form logic
// Tier model: Quick / Bronze / Silver / Gold / Diamond. Gold and Diamond
// bundle certain add-ons in for free -- see CHECKBOX_ADDONS' includedFrom
// and RADIO_ADDONS' includedLevel below for exactly what's included where.

const PACKAGES = [
  { id: 'quick', label: 'Quick', price: 120, wash: 'Quick wash', badge: null, desc: 'A light, 90-minute refresh. Interior vacuum & wipe, exterior wash — no add-ons.' },
  { id: 'bronze', label: 'Bronze', price: 144, wash: null, badge: null, desc: 'A fast, thorough interior refresh — vacuumed, steamed, and smelling brand new.' },
  { id: 'silver', label: 'Silver', price: 184, wash: '2-step wash', badge: null, desc: 'Full inside-and-out detail, built your way. Add exactly what your car needs.' },
  { id: 'gold', label: 'Gold', price: 239, wash: '3-step wash', badge: 'Save $75', desc: 'The extras everyone adds anyway — tire shine, leather conditioning, carpet shampoo, bug and tar removal, and pet hair removal, all bundled in for $75 less than adding them separately.' },
  { id: 'diamond', label: 'Diamond', price: 279, wash: '3-step wash + hand wash and wax', badge: 'Save $180', desc: 'Bumper to bumper, nothing held back. Everything in Gold plus full pet hair removal, stain removal, engine bay cleaning, headliner cleaning and a deep-clean shampoo — $180 less than building it piece by piece.' },
];

// Quick includes exterior wash; Bronze is interior-only; Silver/Gold/Diamond
// have exterior wash. Exterior add-ons hidden for Bronze.
const EXTERIOR_PACKAGES = new Set(['quick', 'silver', 'gold', 'diamond']);

const VEHICLE_SIZE_DISCOUNT = { quick: 0, bronze: 0, silver: 0, gold: 0.10, diamond: 0.20 };

const VEHICLE_SIZES_BASE = [
  { id: 'standard', label: 'Standard', desc: 'Sedan, coupe, hatchback', price: 0 },
  { id: 'midsize', label: 'Midsize', desc: 'Crossover, wagon', price: 20 },
  { id: 'suv', label: 'SUV', desc: '3-row SUV, minivan', price: 30 },
  { id: 'truck', label: 'Truck', desc: 'Pickup, full-size SUV', price: 40 },
];

function vehiclePrice(sizeId, pkgId) {
  const base = VEHICLE_SIZES_BASE.find(v => v.id === sizeId).price;
  const discount = VEHICLE_SIZE_DISCOUNT[pkgId] || 0;
  return Math.round(base * (1 - discount));
}

// Checkbox add-ons: independent, stack freely. `scope: 'exterior'` items
// are hidden entirely for Bronze (interior-only). `includedFrom` lists
// package ids where this item is bundled in for free.
const CHECKBOX_ADDONS = [
  { id: 'stainRemoval', label: 'Stain removal', price: 30, scope: 'interior', includedFrom: ['diamond'] },
  { id: 'carpetShampoo', label: 'Carpet shampoo', price: 30, scope: 'interior', includedFrom: ['gold', 'diamond'] },
  { id: 'leatherConditioning', label: 'Leather conditioning', price: 25, scope: 'interior', includedFrom: ['gold', 'diamond'] },
  { id: 'headlinerCleaning', label: 'Headliner cleaning', price: 35, scope: 'interior', includedFrom: ['diamond'] },
  { id: 'tireShine', label: 'Tire shine', price: 20, scope: 'exterior', includedFrom: ['gold', 'diamond'] },
  { id: 'engineCleaning', label: 'Engine bay cleaning', price: 50, scope: 'exterior', includedFrom: ['diamond'] },
  { id: 'bugTarRemoval', label: 'Bug and tar removal', price: 25, scope: 'exterior', includedFrom: ['gold', 'diamond'] },
  { id: 'headlightRestoration', label: 'Headlight restoration (pair)', price: 40, scope: 'exterior', includedFrom: [] },
];

// Radio add-ons: pick at most one option per group. `includedLevel` maps a
// package id to the option that's included free at that tier -- any option
// at or below that level is free; anything above it costs the difference.
// Odor removal is never included, even at Diamond -- it stays a distinct
// paid option at every tier.
const RADIO_ADDONS = [
  {
    id: 'petHair',
    label: 'Pet hair removal',
    scope: 'interior',
    options: [
      { id: 'none', label: 'None', price: 0 },
      { id: 'medium', label: 'Medium', price: 30 },
      { id: 'heavy', label: 'Heavy', price: 60 },
    ],
    includedLevel: { gold: 'medium', diamond: 'heavy' },
  },
  {
    id: 'odorRemoval',
    label: 'Odor removal',
    scope: 'interior',
    options: [
      { id: 'none', label: 'None', price: 0 },
      { id: 'base', label: 'Standard', price: 45 },
      { id: 'smoke', label: 'Cigarette smoke', price: 60 },
    ],
    includedLevel: {},
  },
];

function radioOptionPrice(group, optionId, pkgId) {
  const option = group.options.find(o => o.id === optionId);
  const includedId = group.includedLevel && group.includedLevel[pkgId];
  if (!includedId) return option.price;
  const includedOption = group.options.find(o => o.id === includedId);
  const optionIdx = group.options.findIndex(o => o.id === optionId);
  const includedIdx = group.options.findIndex(o => o.id === includedId);
  if (optionIdx <= includedIdx) return 0;
  return option.price - includedOption.price;
}

function checkboxAddonPrice(addon, pkgId) {
  return addon.includedFrom.includes(pkgId) ? 0 : addon.price;
}

const TIME_WINDOWS = [
  { id: 'morning', label: '10:00 AM – 12:00 PM' },
  { id: 'midday', label: '12:00 PM – 2:00 PM' },
  { id: 'afternoon', label: '2:00 PM – 4:00 PM' },
  { id: 'lateafternoon', label: '4:00 PM – 6:00 PM' },
];

const state = {
  step: 1,
  package: null,
  vehicleSize: null,
  petHair: 'none',
  odorRemoval: 'none',
  checkboxAddons: new Set(),
  date: '',
  timeWindow: '',
  address1: '',
  address2: '',
  city: 'Salt Lake City',
  zip: '',
  fullName: '',
  phone: '',
  email: '',
};

const TOTAL_STEPS = 6;

function money(n) {
  return `$${n.toFixed(0)}`;
}

function calcTotal() {
  let total = 0;
  const pkg = PACKAGES.find(p => p.id === state.package);
  if (pkg) total += pkg.price;
  if (state.package && state.vehicleSize) {
    total += vehiclePrice(state.vehicleSize, state.package);
  }

  RADIO_ADDONS.forEach(group => {
    total += radioOptionPrice(group, state[group.id], state.package);
  });

  CHECKBOX_ADDONS.forEach(a => {
    if (state.checkboxAddons.has(a.id)) total += checkboxAddonPrice(a, state.package);
  });

  return total;
}

function isIncludedCheckbox(addon) {
  return addon.includedFrom.includes(state.package);
}

function visibleCheckboxAddons() {
  const showExterior = EXTERIOR_PACKAGES.has(state.package);
  return CHECKBOX_ADDONS.filter(a => {
    if (a.scope === 'exterior' && !showExterior) return false;
    if (a.requiresVehicle && a.requiresVehicle !== state.vehicleSize) return false;
    return true;
  });
}

// Strip selections that are no longer visible/valid for the current
// package or vehicle size (e.g. an exterior add-on picked on Bronze, then
// switched to Interior Only; or truck bed detail picked on a truck, then
// switched to a different vehicle size) so nothing keeps silently
// charging for a hidden item.
function pruneInvalidSelections() {
  const showExterior = EXTERIOR_PACKAGES.has(state.package);
  CHECKBOX_ADDONS.forEach(a => {
    if (a.scope === 'exterior' && !showExterior) state.checkboxAddons.delete(a.id);
    if (a.requiresVehicle && a.requiresVehicle !== state.vehicleSize) state.checkboxAddons.delete(a.id);
  });
}

function selectedAddonSummary() {
  const lines = [];
  RADIO_ADDONS.forEach(group => {
    const selected = state[group.id];
    if (selected === 'none') return;
    const option = group.options.find(o => o.id === selected);
    const price = radioOptionPrice(group, selected, state.package);
    const includedId = group.includedLevel && group.includedLevel[state.package];
    const tag = price === 0 && includedId ? ' (included)' : '';
    lines.push(`${group.label} (${option.label})${tag}${price ? ` +${money(price)}` : ''}`);
  });
  visibleCheckboxAddons().forEach(a => {
    if (isIncludedCheckbox(a)) {
      lines.push(`${a.label} (included)`);
    } else if (state.checkboxAddons.has(a.id)) {
      lines.push(`${a.label} +${money(a.price)}`);
    }
  });
  return lines;
}

// Gold and Diamond carry their homepage brand treatment (gold surround /
// dark+red premium card) into the booking flow when selected, instead of
// the generic red-accent selection every other tier uses.
const PACKAGE_THEMES = {
  gold: { cardStyle: 'background:#FBF3DC;border-color:#B8860B;', titleColor: '#8A6A08', descColor: '#6B5308', washColor: '#8A6A08', badgeStyle: 'background:#B8860B;color:#fff;' },
  diamond: { cardStyle: 'background:#0F172A;border-color:#E24B4A;', titleColor: 'rgba(255,255,255,0.6)', descColor: 'rgba(255,255,255,0.65)', washColor: 'rgba(255,255,255,0.5)', textColor: '#fff', badgeStyle: 'background:#DC2626;color:#fff;' },
};

function renderPackages() {
  const el = document.getElementById('packageOptions');
  el.innerHTML = PACKAGES.map(p => {
    const selected = state.package === p.id;
    const themeAlways = PACKAGE_THEMES[p.id];
    const themeSelected = selected ? themeAlways : null;
    const wrapClasses = themeSelected ? 'border-2' : (selected ? 'border-accent bg-accent/5' : 'border-ink/10 hover:border-ink/30');
    const cardStyle = themeSelected ? `${themeSelected.cardStyle}${themeSelected.textColor ? `color:${themeSelected.textColor};` : ''}` : '';
    return `
    <button type="button" data-package="${p.id}"
      class="option-card text-left rounded-3xl border ${wrapClasses} p-6 sm:p-7 transition-colors relative"
      style="${cardStyle}">
      ${p.badge ? `<span class="absolute -top-3 left-6 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold" style="${themeAlways.badgeStyle}">${p.badge}</span>` : ''}
      <div class="flex items-center justify-between mb-2 mt-1">
        <span class="font-bold text-lg">${p.label}</span>
        <span class="text-2xl font-extrabold tracking-tight">${money(p.price)}</span>
      </div>
      ${p.wash ? `<div class="text-xs uppercase tracking-wider mb-2" style="${themeSelected ? `color:${themeSelected.washColor};` : 'color:rgb(15 23 42 / 0.4);'}">${p.wash}</div>` : ''}
      <p class="text-sm" style="${themeSelected ? `color:${themeSelected.descColor};` : 'color:rgb(15 23 42 / 0.6);'}">${p.desc}</p>
    </button>
  `;
  }).join('');
}

function renderVehicleSizes() {
  const el = document.getElementById('vehicleOptions');

  html = `<div class="space-y-6">
    <div class="text-sm uppercase tracking-wider text-ink/50 font-semibold">Pick your vehicle size:</div>
    <div class="grid grid-cols-2 gap-6 sm:gap-5">`;

  VEHICLE_SIZES_BASE.forEach(v => {
    const price = vehiclePrice(v.id, state.package);
    const discount = VEHICLE_SIZE_DISCOUNT[state.package] || 0;
    const isSelected = state.vehicleSize === v.id;
    const wrapClasses = isSelected ? 'border-2 border-accent bg-accent/5' : 'border border-ink/10 hover:border-ink/30';
    html += `
    <button type="button" class="vehicle-option option-card text-left rounded-3xl ${wrapClasses} p-7 sm:p-8 transition-all flex flex-col justify-between min-h-64" data-vehicle="${v.id}">
      <div>
        <span class="font-extrabold text-xl block">${v.label}</span>
        <p class="text-ink/60 text-sm mt-4">${v.desc}</p>
      </div>
      <div class="mt-6 pt-6 border-t border-ink/10">
        <div class="text-base font-bold text-ink/70 mb-2">${price === 0 ? 'Included' : '+' + money(price)}</div>
        ${discount > 0 && v.price > 0 ? `<p class="text-accent text-sm font-bold">${Math.round(discount * 100)}% discount</p>` : ''}
      </div>
    </button>`;
  });

  html += `</div></div>`;

  el.innerHTML = html;
}

function renderAddons() {
  const radioEl = document.getElementById('radioAddons');
  const visibleRadioGroups = RADIO_ADDONS.filter(g => g.scope !== 'exterior' || EXTERIOR_PACKAGES.has(state.package));
  radioEl.innerHTML = visibleRadioGroups.map(group => {
    const includedId = group.includedLevel && group.includedLevel[state.package];
    return `
    <div class="mb-6">
      <div class="text-sm font-semibold mb-3">${group.label}${includedId ? ' <span class="text-accent font-normal">(partly included)</span>' : ''}</div>
      <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="${group.label}">
        ${group.options.map(o => {
          const price = radioOptionPrice(group, o.id, state.package);
          const isFree = price === 0 && o.id !== 'none';
          return `
          <button type="button" data-radio-group="${group.id}" data-radio-value="${o.id}"
            class="option-pill rounded-full border px-3 py-2.5 text-sm font-medium transition-colors ${state[group.id] === o.id ? 'border-accent bg-accent text-white' : 'border-ink/15 hover:border-ink/30'}">
            ${o.label}${isFree ? ' ✓' : price ? ` +${money(price)}` : ''}
          </button>
        `;
        }).join('')}
      </div>
    </div>
  `;
  }).join('');

  function checkboxCard(a) {
    const included = isIncludedCheckbox(a);
    if (included) {
      return `
      <div class="flex items-center justify-between rounded-xl border border-accent bg-accent/5 px-4 py-3 text-left">
        <span class="font-medium text-xs">${a.label}</span>
        <span class="text-xs font-bold text-accent">Included</span>
      </div>
    `;
    }
    return `
    <button type="button" data-checkbox-addon="${a.id}"
      class="option-card flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${state.checkboxAddons.has(a.id) ? 'border-accent bg-accent/5' : 'border-ink/10 hover:border-ink/30'}">
      <span class="font-medium text-xs">${a.label}</span>
      <span class="text-xs font-bold text-ink/70">+${money(a.price)}</span>
    </button>
  `;
  }

  const visible = visibleCheckboxAddons();
  const interiorAddons = visible.filter(a => a.scope === 'interior');
  const exteriorAddons = visible.filter(a => a.scope === 'exterior');
  const checkEl = document.getElementById('checkboxAddons');
  checkEl.innerHTML = `
    ${interiorAddons.length ? `
      <div class="text-xs font-semibold text-ink/50 uppercase tracking-wider mb-2">Interior extras</div>
      <div class="grid grid-cols-2 gap-2 mb-5">${interiorAddons.map(checkboxCard).join('')}</div>
    ` : ''}
    ${exteriorAddons.length ? `
      <div class="text-xs font-semibold text-ink/50 uppercase tracking-wider mb-2">Exterior extras</div>
      <div class="grid grid-cols-2 gap-2">${exteriorAddons.map(checkboxCard).join('')}</div>
    ` : ''}
  `;
}

function renderTimeWindows() {
  const el = document.getElementById('timeOptions');
  el.innerHTML = TIME_WINDOWS.map(t => `
    <button type="button" data-time="${t.id}"
      class="option-pill rounded-full border px-4 py-3 text-sm font-medium transition-colors ${state.timeWindow === t.id ? 'border-accent bg-accent text-white' : 'border-ink/15 hover:border-ink/30'}">
      ${t.label}
    </button>
  `).join('');
}

function renderReview() {
  const pkg = PACKAGES.find(p => p.id === state.package);
  const size = VEHICLE_SIZES_BASE.find(v => v.id === state.vehicleSize);
  const addonLines = selectedAddonSummary();
  const timeLabel = TIME_WINDOWS.find(t => t.id === state.timeWindow)?.label || '';
  const dateLabel = state.date ? new Date(state.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  const sizePrice = vehiclePrice(state.vehicleSize, state.package);

  document.getElementById('reviewContent').innerHTML = `
    <div class="space-y-5">
      <div class="flex justify-between items-baseline">
        <span class="text-ink/60 text-sm">Package</span>
        <span class="font-semibold">${pkg?.label || '—'}</span>
      </div>
      <div class="flex justify-between items-baseline">
        <span class="text-ink/60 text-sm">Vehicle size</span>
        <span class="font-semibold">${size?.label || '—'}${sizePrice ? ` (+${money(sizePrice)})` : ''}</span>
      </div>
      ${addonLines.length ? `
        <div class="border-t border-ink/10 pt-4">
          <span class="text-ink/60 text-sm block mb-2">Add-ons</span>
          <ul class="space-y-1.5 text-sm font-medium">
            ${addonLines.map(l => `<li>${l}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="border-t border-ink/10 pt-4 flex justify-between items-baseline">
        <span class="text-ink/60 text-sm">Arrival window</span>
        <span class="font-semibold text-right">${dateLabel}<br/><span class="text-ink/60 text-sm font-normal">${timeLabel}</span></span>
      </div>
      <div class="border-t border-ink/10 pt-4 flex justify-between items-baseline">
        <span class="text-ink/60 text-sm">Service address</span>
        <span class="font-semibold text-right">${state.address1}${state.address2 ? ', ' + state.address2 : ''}<br/>${state.city}, UT ${state.zip}</span>
      </div>
      <div class="border-t border-ink/10 pt-4 flex justify-between items-baseline">
        <span class="text-ink/60 text-sm">Contact</span>
        <span class="font-semibold text-right">${state.fullName}<br/><span class="text-ink/60 text-sm font-normal">${state.phone} · ${state.email}</span></span>
      </div>
      <div class="border-t border-ink/10 pt-5 flex justify-between items-baseline">
        <span class="font-bold text-lg">Total</span>
        <span class="font-extrabold text-2xl">${money(calcTotal())}</span>
      </div>
    </div>
  `;
}

function updateTotalBar() {
  document.getElementById('runningTotal').textContent = money(calcTotal());
}

function updateProgress() {
  document.querySelectorAll('[data-progress-dot]').forEach(dot => {
    const stepNum = Number(dot.dataset.progressDot);
    dot.classList.toggle('bg-accent', stepNum <= state.step);
    dot.classList.toggle('bg-ink/15', stepNum > state.step);
  });
  document.getElementById('stepLabel').textContent = `Step ${state.step} of ${TOTAL_STEPS}`;
}

function showStep(n) {
  state.step = n;
  document.querySelectorAll('[data-step]').forEach(section => {
    section.classList.toggle('hidden', Number(section.dataset.step) !== n);
  });
  document.getElementById('backBtn').classList.toggle('invisible', n === 1);
  const continueBtn = document.getElementById('continueBtn');
  continueBtn.classList.toggle('hidden', n === TOTAL_STEPS);
  document.getElementById('submitBtn').classList.toggle('hidden', n !== TOTAL_STEPS);

  if (n === TOTAL_STEPS) renderReview();
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(n) {
  switch (n) {
    case 1:
      if (!state.package) { alert('Pick a package to continue.'); return false; }
      return true;
    case 2:
      if (!state.vehicleSize) { alert('Select a vehicle size to continue.'); return false; }
      return true;
    case 3:
      return true; // add-ons are optional
    case 4:
      if (!state.date || !state.timeWindow) { alert('Pick a date and arrival window to continue.'); return false; }
      return true;
    case 5: {
      const required = ['address1', 'city', 'zip', 'fullName', 'phone', 'email'];
      for (const field of required) {
        if (!state[field]) { alert('Please fill in all required fields.'); return false; }
      }
      return true;
    }
    default:
      return true;
  }
}

function readStep5Inputs() {
  state.address1 = document.getElementById('address1').value.trim();
  state.address2 = document.getElementById('address2').value.trim();
  state.city = document.getElementById('city').value.trim();
  state.zip = document.getElementById('zip').value.trim();
  state.fullName = document.getElementById('fullName').value.trim();
  state.phone = document.getElementById('phone').value.trim();
  state.email = document.getElementById('email').value.trim();
}

async function submitBooking(payload) {
  try {
    const res = await fetch('/.netlify/functions/create-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.error('Booking submission failed:', data);
      return { ok: false, error: data.error || `Server returned ${res.status}` };
    }
    return data;
  } catch (err) {
    console.error('Booking submission failed:', err);
    return { ok: false, error: err.message };
  }
}

function buildPayload() {
  return {
    package: state.package,
    vehicleSize: state.vehicleSize,
    addons: {
      petHair: state.petHair,
      odorRemoval: state.odorRemoval,
      checkbox: Array.from(state.checkboxAddons),
    },
    date: state.date,
    timeWindow: state.timeWindow,
    address: {
      line1: state.address1,
      line2: state.address2,
      city: state.city,
      state: 'UT',
      zip: state.zip,
    },
    contact: {
      fullName: state.fullName,
      phone: state.phone,
      email: state.email,
    },
    total: calcTotal(),
  };
}

function init() {
  // Preselect package from ?pkg= query param, mirroring the homepage links.
  const params = new URLSearchParams(window.location.search);
  const pkgParam = params.get('pkg');
  if (PACKAGES.some(p => p.id === pkgParam)) state.package = pkgParam;

  renderPackages();
  renderVehicleSizes();
  renderAddons();
  renderTimeWindows();

  const dateInput = document.getElementById('dateInput');
  const today = new Date();
  const minDate = new Date(today.getTime() + 24 * 60 * 60 * 1000); // earliest tomorrow
  const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  dateInput.min = minDate.toISOString().split('T')[0];
  dateInput.max = maxDate.toISOString().split('T')[0];
  dateInput.addEventListener('change', () => { state.date = dateInput.value; });

  document.getElementById('packageOptions').addEventListener('click', e => {
    const btn = e.target.closest('[data-package]');
    if (!btn) return;
    state.package = btn.dataset.package;
    pruneInvalidSelections();
    renderPackages();
    renderVehicleSizes();
    renderAddons();
    updateTotalBar();
  });

  document.getElementById('vehicleOptions').addEventListener('click', e => {
    const btn = e.target.closest('.vehicle-option');
    if (!btn) return;
    state.vehicleSize = btn.dataset.vehicle;
    renderVehicleSizes();
    updateTotalBar();
  });

  document.getElementById('radioAddons').addEventListener('click', e => {
    const btn = e.target.closest('[data-radio-group]');
    if (!btn) return;
    state[btn.dataset.radioGroup] = btn.dataset.radioValue;
    renderAddons();
    updateTotalBar();
  });

  document.getElementById('checkboxAddons').addEventListener('click', e => {
    const btn = e.target.closest('[data-checkbox-addon]');
    if (!btn) return;
    const id = btn.dataset.checkboxAddon;
    if (state.checkboxAddons.has(id)) state.checkboxAddons.delete(id);
    else state.checkboxAddons.add(id);
    renderAddons();
    updateTotalBar();
  });

  document.getElementById('timeOptions').addEventListener('click', e => {
    const btn = e.target.closest('[data-time]');
    if (!btn) return;
    state.timeWindow = btn.dataset.time;
    renderTimeWindows();
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    if (state.step > 1) showStep(state.step - 1);
  });

  document.getElementById('continueBtn').addEventListener('click', () => {
    if (state.step === 5) readStep5Inputs();
    if (!validateStep(state.step)) return;
    if (state.step < TOTAL_STEPS) showStep(state.step + 1);
  });

  document.getElementById('submitBtn').addEventListener('click', async () => {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    const payload = buildPayload();
    const result = await submitBooking(payload);
    if (result.ok) {
      document.getElementById('formWizard').classList.add('hidden');
      document.getElementById('successPanel').classList.remove('hidden');
    } else {
      alert(`Something went wrong sending your request: ${result.error || 'unknown error'}\n\nPlease call/text us instead.`);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & send request';
    }
  });

  updateTotalBar();
  showStep(1);
}

document.addEventListener('DOMContentLoaded', init);
