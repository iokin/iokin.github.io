const toggler  = document.getElementById('menuToggler');
const closeBtn = document.getElementById('menuClose');
const menu     = document.getElementById('navbarNav');

function isMobile() { return window.innerWidth < 992; }

function openOverlay() {
  menu.classList.add('overlay-open');
  toggler.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeOverlay() {
  menu.classList.remove('overlay-open');
  toggler.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

toggler.addEventListener('click', () => {
  menu.classList.contains('overlay-open') ? closeOverlay() : openOverlay();
});

closeBtn.addEventListener('click', closeOverlay);

menu.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => { if (isMobile()) closeOverlay(); });
});

window.addEventListener('resize', () => {
  if (!isMobile()) closeOverlay();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeOverlay();
});
