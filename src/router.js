// ==============================
// ROUTER — Hash-based SPA routing
// ==============================

import { renderHome } from './pages/home.js';
import { renderStoryDetail } from './pages/storyDetail.js';
import { renderReader } from './pages/reader.js';
import { renderUpload } from './pages/upload.js';
import { renderNotifications } from './pages/notifications.js';
import { renderLogin } from './pages/login.js';
import { isLoggedIn } from './auth.js';

const routes = [
  { pattern: /^#\/$|^$|^#$/, handler: renderHome },
  { pattern: /^#\/story\/([^/]+)$/, handler: renderStoryDetail },
  { pattern: /^#\/story\/([^/]+)\/chapter\/(\d+)$/, handler: renderReader },
  { pattern: /^#\/upload$/, handler: renderUpload, requiresAuth: true },
  { pattern: /^#\/notifications$/, handler: renderNotifications },
  { pattern: /^#\/login$/, handler: renderLogin },
];

function matchRoute(hash) {
  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      // Auth gate: redirect to login if not authenticated
      if (route.requiresAuth && !isLoggedIn()) {
        return { handler: renderLogin, params: [] };
      }
      return { handler: route.handler, params: match.slice(1) };
    }
  }
  return { handler: renderHome, params: [] };
}

function handleRoute() {
  const hash = window.location.hash || '#/';
  const { handler, params } = matchRoute(hash);
  const main = document.getElementById('main-content');
  if (!main) return;

  // Fade out
  main.style.opacity = '0';
  main.style.transform = 'translateY(10px)';

  setTimeout(() => {
    handler(main, ...params);
    // Fade in
    requestAnimationFrame(() => {
      main.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      main.style.opacity = '1';
      main.style.transform = 'translateY(0)';
    });

    // Update active nav link
    updateActiveNav(hash);
    // Scroll to top
    window.scrollTo(0, 0);
  }, 150);
}

function updateActiveNav(hash) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href === hash || (href === '#/' && (hash === '' || hash === '#'))) {
      link.classList.add('active');
    }
  });
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('storyverse:data-ready', handleRoute);

  // Re-route on auth changes
  window.addEventListener('storyverse:auth-change', () => {
    // Re-render navbar
    import('./components/navbar.js').then(m => m.renderNavbar());
    handleRoute();
  });
  handleRoute();
}

export function navigate(path) {
  window.location.hash = path;
}
