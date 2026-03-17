import { READ_ONLY_MODE } from './config.js';

// ==============================
// AUTH — Admin authentication
// ==============================

const AUTH_KEY = 'storyverse_auth';

// Hardcoded admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'soban';

export function isLoggedIn() {
  if (READ_ONLY_MODE) {
    return false;
  }

  try {
    const session = JSON.parse(localStorage.getItem(AUTH_KEY));
    return session && session.loggedIn === true;
  } catch {
    return false;
  }
}

export function login(username, password) {
  if (READ_ONLY_MODE) {
    return { success: false, error: 'This site is in read-only mode.' };
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ loggedIn: true, user: 'admin' }));
    window.dispatchEvent(new Event('storyverse:auth-change'));
    return { success: true };
  }
  return { success: false, error: 'Invalid username or password' };
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new Event('storyverse:auth-change'));
}

export function getAdminPassword() {
  return ADMIN_PASSWORD;
}
