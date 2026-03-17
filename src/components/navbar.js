// ==============================
// NAVBAR Component
// ==============================

import { READ_ONLY_MODE } from '../config.js';
import { getUnreadCount } from '../store.js';
import { isLoggedIn, logout } from '../auth.js';

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

export function renderNavbar() {
  const navbar = document.getElementById('navbar');
  const loggedIn = isLoggedIn();

  if (READ_ONLY_MODE) {
    navbar.innerHTML = `
      <a href="#/" class="nav-logo">
        <div class="nav-logo-icon">📖</div>
        StoryVerse
      </a>
      <div class="nav-links">
        <a href="#/" class="nav-link active" id="nav-home">
          ${ICONS.home}
          <span>Read</span>
        </a>
      </div>
    `;
    return;
  }

  navbar.innerHTML = `
    <a href="#/" class="nav-logo">
      <div class="nav-logo-icon">📖</div>
      StoryVerse
    </a>
    <div class="nav-links">
      <a href="#/" class="nav-link active" id="nav-home">
        ${ICONS.home}
        <span>Home</span>
      </a>
      <a href="#/notifications" class="nav-link notification-btn" id="nav-notifications">
        ${ICONS.bell}
        <span class="notification-badge" id="notification-badge" style="display:none">0</span>
      </a>
      ${loggedIn ? `
        <a href="#/upload" class="nav-link" id="nav-upload">
          ${ICONS.upload}
          <span>Upload</span>
        </a>
        <button class="nav-link" id="nav-logout">
          ${ICONS.logout}
          <span>Logout</span>
        </button>
      ` : `
        <a href="#/login" class="nav-link" id="nav-login">
          ${ICONS.login}
          <span>Admin</span>
        </a>
      `}
    </div>
  `;

  if (loggedIn) {
    updateBadge();
    document.getElementById('nav-logout').addEventListener('click', () => {
      logout();
      window.location.hash = '#/';
    });
  }

  // Listen for notification events
  window.addEventListener('storyverse:notification', updateBadge);
  window.addEventListener('storyverse:notification-update', updateBadge);
}

function updateBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;
  const count = getUnreadCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}
