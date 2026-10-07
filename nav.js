// Shared site navigation — injected into <header id="site-nav"></header> on
// every marketing page so the Services dropdown and the mobile menu stay
// consistent and are edited in one place. Footer links remain in each page's
// static HTML for SEO; this nav is a navigational convenience.

(function () {
  const PHONE_TEL = '+13853916106';
  const PHONE = '(385) 391-6106';

  const SERVICES = [
    ['mobile-detailing.html', 'Mobile detailing'],
    ['interior-detailing.html', 'Interior detailing'],
    ['exterior-detailing.html', 'Exterior detailing'],
    ['ceramic-coating.html', 'Ceramic coating'],
    ['paint-correction.html', 'Paint correction'],
    ['polish.html', 'Polish'],
    ['pet-hair-removal.html', 'Pet hair removal'],
    ['odor-removal.html', 'Odor removal'],
  ];

  // On the homepage, #how / #reviews are same-page anchors; elsewhere they
  // point back to the homepage sections.
  const onHome = /(^|\/)(index\.html)?$/.test(location.pathname);
  const howHref = (onHome ? '' : 'index.html') + '#how';
  const revHref = (onHome ? '' : 'index.html') + '#reviews';

  const dropdownItems = SERVICES.map(
    ([href, label]) => `<a href="${href}" class="block px-4 py-2.5 hover:bg-ink/5 transition-colors">${label}</a>`
  ).join('');

  const mobileServices = SERVICES.map(
    ([href, label]) => `<a href="${href}" class="block py-2 text-ink/70 hover:text-accent transition-colors">${label}</a>`
  ).join('');

  const html = `
  <div class="fixed top-4 left-4 right-4 z-50">
    <div class="mx-auto max-w-6xl rounded-2xl bg-white/90 backdrop-blur-md border border-ink/5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <nav class="flex items-center justify-between px-5 sm:px-6 py-3">
        <a href="index.html" class="flex items-center gap-2.5 cursor-pointer">
          <img src="logo.png" alt="Beehive Detailing logo" class="w-8 h-8 object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';" />
          <span class="hidden w-2.5 h-2.5 rounded-full bg-accent"></span>
          <span class="font-bold tracking-tight text-[15px]">BEEHIVE</span>
          <span class="text-ink/40 text-[15px] tracking-tight hidden sm:inline">Detailing</span>
        </a>

        <!-- Desktop links -->
        <div class="hidden md:flex items-center gap-8 text-sm text-ink/70">
          <div class="relative group">
            <a href="mobile-detailing.html" class="hover:text-ink transition-colors cursor-pointer inline-flex items-center gap-1">
              Services
              <svg class="w-3 h-3 opacity-60 transition-transform group-hover:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </a>
            <div class="absolute left-1/2 -translate-x-1/2 top-full pt-3 hidden group-hover:block z-50">
              <div class="bg-white rounded-2xl border border-ink/10 shadow-[0_8px_30px_rgba(15,23,42,0.12)] py-2 w-56">${dropdownItems}</div>
            </div>
          </div>
          <a href="${howHref}" class="hover:text-ink transition-colors cursor-pointer">How it works</a>
          <a href="${revHref}" class="hover:text-ink transition-colors cursor-pointer">Reviews</a>
          <a href="gift.html" class="hover:text-ink transition-colors cursor-pointer">Gift cards</a>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <a href="tel:${PHONE_TEL}" class="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-ink/70 hover:text-accent transition-colors cursor-pointer">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            ${PHONE}
          </a>
          <a href="booking.html" class="group inline-flex items-center gap-2 bg-ink text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-accent transition-colors cursor-pointer">
            Book now
            <svg class="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
          <!-- Mobile hamburger -->
          <button id="navToggle" type="button" aria-label="Open menu" aria-expanded="false" class="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full border border-ink/15 text-ink hover:bg-ink/5 transition-colors cursor-pointer">
            <svg id="navIconOpen" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            <svg id="navIconClose" class="w-5 h-5 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </nav>

      <!-- Mobile menu panel -->
      <div id="navMobile" class="md:hidden hidden border-t border-ink/10 px-5 pt-3 pb-5">
        <div class="text-xs uppercase tracking-wider text-ink/40 mb-1">Services</div>
        <div class="grid text-sm">${mobileServices}</div>
        <div class="grid text-sm border-t border-ink/10 mt-3 pt-3">
          <a href="${howHref}" class="block py-2 text-ink/70 hover:text-accent transition-colors">How it works</a>
          <a href="${revHref}" class="block py-2 text-ink/70 hover:text-accent transition-colors">Reviews</a>
          <a href="gift.html" class="block py-2 text-ink/70 hover:text-accent transition-colors">Gift cards</a>
          <a href="tel:${PHONE_TEL}" class="block py-2 text-ink/70 hover:text-accent transition-colors">Call ${PHONE}</a>
        </div>
        <a href="booking.html" class="mt-3 inline-flex w-full items-center justify-center gap-2 bg-accent text-white px-5 py-3 rounded-full text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer">Book a detail</a>
      </div>
    </div>
  </div>`;

  function mount() {
    const host = document.getElementById('site-nav');
    if (!host) return;
    host.innerHTML = html;

    const btn = document.getElementById('navToggle');
    const panel = document.getElementById('navMobile');
    const iconOpen = document.getElementById('navIconOpen');
    const iconClose = document.getElementById('navIconClose');
    if (btn && panel) {
      btn.addEventListener('click', () => {
        const open = panel.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', String(open));
        if (iconOpen) iconOpen.classList.toggle('hidden', open);
        if (iconClose) iconClose.classList.toggle('hidden', !open);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
