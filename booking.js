// Beehive Detailing — booking form logic
// Pure client-side for now (Phase 3). Phase 4 will wire submitBooking() to the
// Netlify function that talks to Jobber.

const PACKAGES = [
  { id: 'interior', label: 'Interior Only', price: 144, desc: 'Full interior reset — vacuum, steam-clean, condition.' },
  { id: 'both', label: 'Interior + Exterior', price: 184, desc: 'Everything in Interior, plus a hand-wash exterior with sealant.' },
];

const VEHICLE_SIZES = [
  { id: 'standard', label: 'Standard', desc: 'Sedan, coupe, hatchback', price: 0 },
  { id: 'midsize', label: 'Midsize', desc: 'Crossover, wagon', price: 20 },
  { id: 'suv', label: 'SUV', desc: '3-row SUV, minivan', price: 30 },
  { id: 'truck', label: 'Truck', desc: 'Pickup, full-size SUV', price: 40 },
];

// Checkbox add-ons: independent, stack freely.
const CHECKBOX_ADDONS = [
  { id: 'stainRemoval', label: 'Stain removal', price: 30 },
  { id: 'carpetShampoo', label: 'Carpet shampoo', price: 30 },
  { id: 'tireShine', label: 'Tire shine', price: 20 },
  { id: 'leatherConditioning', label: 'Leather conditioning', price: 25 },
  { id: 'engineCleaning', label: 'Engine bay cleaning', price: 50 },
  { id: 'headlinerCleaning', label: 'Headliner cleaning', price: 35 },
  { id: 'bugTarRemoval', label: 'Bug & tar removal', price: 25 },
  { id: 'clayBarDecon', label: 'Clay bar paint decontamination', price: 40 },
  { id: 'headlightRestoration', label: 'Headlight restoration (pair)', price: 40 },
  { id: 'wheelIronDecon', label: 'Wheel & iron decontamination', price: 25 },
  { id: 'trunkCargoDetail', label: 'Trunk / cargo area detail', price: 20 },
];

// Radio add-ons: pick at most one option per group.
const RADIO_ADDONS = [
  {
    id: 'petHair',
    label: 'Pet hair removal',
    options: [
      { id: 'none', label: 'None', price: 0 },
      { id: 'medium', label: 'Medium', price: 30 },
      { id: 'heavy', label: 'Heavy', price: 60 },
    ],
  },
  {
    id: 'odorRemoval',
    label: 'Odor removal',
    options: [
      { id: 'none', label: 'None', price: 0 },
      { id: 'base', label: 'Standard', price: 45 },
      { id: 'smoke', label: 'Cigarette smoke', price: 60 },
    ],
  },
];

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
  const size = VEHICLE_SIZES.find(v => v.id === state.vehicleSize);
  if (size) total += size.price;

  const petHairOpt = RADIO_ADDONS[0].options.find(o => o.id === state.petHair);
  if (petHairOpt) total += petHairOpt.price;
  const odorOpt = RADIO_ADDONS[1].options.find(o => o.id === state.odorRemoval);
  if (odorOpt) total += odorOpt.price;

  CHECKBOX_ADDONS.forEach(a => {
    if (state.checkboxAddons.has(a.id)) total += a.price;
  });

  return total;
}

function selectedAddonSummary() {
  const lines = [];
  const petHairOpt = RADIO_ADDONS[0].options.find(o => o.id === state.petHair);
  if (petHairOpt && petHairOpt.id !== 'none') lines.push(`Pet hair removal (${petHairOpt.label}) +${money(petHairOpt.price)}`);
  const odorOpt = RADIO_ADDONS[1].options.find(o => o.id === state.odorRemoval);
  if (odorOpt && odorOpt.id !== 'none') lines.push(`Odor removal (${odorOpt.label}) +${money(odorOpt.price)}`);
  CHECKBOX_ADDONS.forEach(a => {
    if (state.checkboxAddons.has(a.id)) lines.push(`${a.label} +${money(a.price)}`);
  });
  return lines;
}

function renderPackages() {
  const el = document.getElementById('packageOptions');
  el.innerHTML = PACKAGES.map(p => `
    <button type="button" data-package="${p.id}"
      class="option-card text-left rounded-3xl border p-6 sm:p-7 transition-colors ${state.package === p.id ? 'border-accent bg-accent/5' : 'border-ink/10 hover:border-ink/30'}">
      <div class="flex items-center justify-between mb-2">
        <span class="font-bold text-lg">${p.label}</span>
        <span class="text-2xl font-extrabold tracking-tight">${money(p.price)}</span>
      </div>
      <p class="text-ink/60 text-sm">${p.desc}</p>
    </button>
  `).join('');
}

function renderVehicleSizes() {
  const el = document.getElementById('vehicleOptions');
  el.innerHTML = VEHICLE_SIZES.map(v => `
    <button type="button" data-vehicle="${v.id}"
      class="option-card text-left rounded-3xl border p-6 sm:p-7 transition-colors ${state.vehicleSize === v.id ? 'border-accent bg-accent/5' : 'border-ink/10 hover:border-ink/30'}">
      <div class="flex items-center justify-between mb-2">
        <span class="font-bold text-lg">${v.label}</span>
        <span class="text-lg font-bold tracking-tight text-ink/70">${v.price === 0 ? 'Included' : '+' + money(v.price)}</span>
      </div>
      <p class="text-ink/60 text-sm">${v.desc}</p>
    </button>
  `).join('');
}

function renderAddons() {
  const radioEl = document.getElementById('radioAddons');
  radioEl.innerHTML = RADIO_ADDONS.map(group => `
    <div class="mb-6">
      <div class="text-sm font-semibold mb-3">${group.label}</div>
      <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="${group.label}">
        ${group.options.map(o => `
          <button type="button" data-radio-group="${group.id}" data-radio-value="${o.id}"
            class="option-pill rounded-full border px-3 py-2.5 text-sm font-medium transition-colors ${state[group.id] === o.id ? 'border-accent bg-accent text-white' : 'border-ink/15 hover:border-ink/30'}">
            ${o.label}${o.price ? ` +${money(o.price)}` : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');

  const checkEl = document.getElementById('checkboxAddons');
  checkEl.innerHTML = CHECKBOX_ADDONS.map(a => `
    <button type="button" data-checkbox-addon="${a.id}"
      class="option-card flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${state.checkboxAddons.has(a.id) ? 'border-accent bg-accent/5' : 'border-ink/10 hover:border-ink/30'}">
      <span class="font-medium text-sm">${a.label}</span>
      <span class="text-sm font-bold text-ink/70">+${money(a.price)}</span>
    </button>
  `).join('');
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
  const size = VEHICLE_SIZES.find(v => v.id === state.vehicleSize);
  const addonLines = selectedAddonSummary();
  const timeLabel = TIME_WINDOWS.find(t => t.id === state.timeWindow)?.label || '';
  const dateLabel = state.date ? new Date(state.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  document.getElementById('reviewContent').innerHTML = `
    <div class="space-y-5">
      <div class="flex justify-between items-baseline">
        <span class="text-ink/60 text-sm">Package</span>
        <span class="font-semibold">${pkg?.label || '—'}</span>
      </div>
      <div class="flex justify-between items-baseline">
        <span class="text-ink/60 text-sm">Vehicle size</span>
        <span class="font-semibold">${size?.label || '—'}</span>
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
      if (!state.vehicleSize) { alert('Pick your vehicle size to continue.'); return false; }
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

// Phase 4 will replace this with a real fetch() to the Netlify function.
async function submitBooking(payload) {
  console.log('Booking payload (not yet sent to Jobber):', payload);
  return { ok: true, mock: true };
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
  if (pkgParam === 'interior') state.package = 'interior';
  if (pkgParam === 'both') state.package = 'both';

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
    renderPackages();
    updateTotalBar();
  });

  document.getElementById('vehicleOptions').addEventListener('click', e => {
    const btn = e.target.closest('[data-vehicle]');
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
      alert('Something went wrong sending your request. Please call/text us instead.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & send request';
    }
  });

  updateTotalBar();
  showStep(1);
}

document.addEventListener('DOMContentLoaded', init);
