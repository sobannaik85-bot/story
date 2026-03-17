// ==============================
// LOGIN PAGE
// ==============================

import { READ_ONLY_MODE } from '../config.js';
import { login } from '../auth.js';
import { navigate } from '../router.js';

export function renderLogin(container) {
  if (READ_ONLY_MODE) {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-header">
            <div class="login-icon">📚</div>
            <h1>Read-Only Site</h1>
            <p>This StoryVerse deployment is for reading only.</p>
          </div>
          <p class="login-footer">Admin upload and login are disabled to keep hosting simple and free.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <div class="login-icon">🔐</div>
          <h1>Admin Login</h1>
          <p>Sign in to manage your stories and chapters.</p>
        </div>
        <form id="login-form">
          <div class="form-group">
            <label for="login-username">Username</label>
            <input type="text" id="login-username" placeholder="Enter username" required autocomplete="username" />
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" placeholder="Enter password" required autocomplete="current-password" />
          </div>
          <div class="login-error" id="login-error" style="display:none"></div>
          <button type="submit" class="btn btn-primary" id="btn-login" style="width:100%;justify-content:center;">
            🚀 Sign In
          </button>
        </form>
        <p class="login-footer">Only administrators can create and manage content.<br/>Readers don't need an account.</p>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    const result = login(username, password);
    if (result.success) {
      navigate('/upload');
    } else {
      errorEl.textContent = result.error;
      errorEl.style.display = 'block';
      // Shake animation
      const card = document.querySelector('.login-card');
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 500);
    }
  });
}
