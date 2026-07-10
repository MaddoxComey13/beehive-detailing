// Beehive Detailing — "Our Work" before/after gallery.
//
// Drop new photos into /media/gallery/ using this naming pattern:
//   01-before.jpg, 01-after.jpg   (matching numbers = a before/after pair)
//   02-before.jpg, 02-after.jpg
//   ...and so on.
// Optionally add a short video clip alongside a pair:
//   01-video.mp4
// No code changes needed -- this script checks for files up to MAX_ITEMS
// and only renders the ones that actually exist.

const GALLERY_DIR = 'media/gallery';
const MAX_ITEMS = 30;

function pad(n) {
  return String(n).padStart(2, '0');
}

function checkImageExists(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function checkFileExists(src) {
  try {
    const res = await fetch(src, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

function beforeAfterCard(n, hasVideo) {
  const before = `${GALLERY_DIR}/${pad(n)}-before.jpg`;
  const after = `${GALLERY_DIR}/${pad(n)}-after.jpg`;
  const wrap = document.createElement('div');
  wrap.className = 'rounded-3xl border border-ink/10 bg-paper-card p-4 sm:p-5';
  wrap.innerHTML = `
    <div class="relative w-full aspect-[4/3] rounded-2xl overflow-hidden select-none" data-slider="${n}">
      <img src="${after}" alt="After detail" loading="lazy" class="absolute inset-0 w-full h-full object-cover" />
      <div class="absolute inset-0 w-1/2 overflow-hidden" data-clip="${n}">
        <img src="${before}" alt="Before detail" loading="lazy" class="absolute inset-0 h-full object-cover" style="width:200%;max-width:none;" />
      </div>
      <div class="absolute top-0 bottom-0 w-0.5 bg-white" style="left:50%;" data-handle="${n}">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
          <svg class="w-4 h-4 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>
        </div>
      </div>
      <span class="absolute bottom-3 left-3 text-[10px] uppercase tracking-wider bg-ink/70 text-white px-2 py-1 rounded-full">Drag to compare</span>
    </div>
    <input type="range" min="0" max="100" value="50" class="w-full mt-4" aria-label="Drag to compare before and after" data-range="${n}" />
    ${hasVideo ? `<video src="${GALLERY_DIR}/${pad(n)}-video.mp4" controls preload="none" class="w-full mt-4 rounded-2xl" aria-label="Detail walkthrough video"></video>` : ''}
  `;
  return wrap;
}

function wireSlider(n) {
  const range = document.querySelector(`[data-range="${n}"]`);
  const clip = document.querySelector(`[data-clip="${n}"]`);
  const handle = document.querySelector(`[data-handle="${n}"]`);
  if (!range || !clip || !handle) return;
  range.addEventListener('input', () => {
    clip.style.width = `${range.value}%`;
    handle.style.left = `${range.value}%`;
  });
}

async function loadGallery() {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  if (!grid) return;

  const found = [];
  for (let n = 1; n <= MAX_ITEMS; n++) {
    const [beforeOk, afterOk] = await Promise.all([
      checkImageExists(`${GALLERY_DIR}/${pad(n)}-before.jpg`),
      checkImageExists(`${GALLERY_DIR}/${pad(n)}-after.jpg`),
    ]);
    if (beforeOk && afterOk) {
      const hasVideo = await checkFileExists(`${GALLERY_DIR}/${pad(n)}-video.mp4`);
      found.push({ n, hasVideo });
    }
  }

  if (!found.length) {
    empty.classList.remove('hidden');
    return;
  }

  found.forEach(({ n, hasVideo }) => grid.appendChild(beforeAfterCard(n, hasVideo)));
  found.forEach(({ n }) => wireSlider(n));
}

document.addEventListener('DOMContentLoaded', loadGallery);
