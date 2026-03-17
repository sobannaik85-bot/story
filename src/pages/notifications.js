// ==============================
// NOTIFICATIONS PAGE
// ==============================

import { getAllNotifications, markNotificationRead, markAllRead, clearAllNotifications } from '../store.js';
import { isLoggedIn } from '../auth.js';
import { showToast } from '../components/toast.js';
import { getPushState, sendLocalTestNotification, sendPushAnnouncement, subscribeToPush, unsubscribeFromPush } from '../utils/pushNotifications.js';

export function renderNotifications(container) {
  const notifications = getAllNotifications();
  const adminView = isLoggedIn();

  container.innerHTML = `
    <div class="notifications-page">
      <h1>🔔 Notifications</h1>
      <p class="page-subtitle">Stay updated with new chapters and releases.</p>

      <section class="notification-permission-card">
        <div>
          <h2>Real Browser Notifications</h2>
          <p>Allow notifications once on this browser and you can receive custom alerts from the admin even when the site is not open.</p>
        </div>
        <div class="notification-status-pill" id="push-status-pill">Checking browser support...</div>
        <div class="notification-permission-actions">
          <button class="btn btn-primary btn-sm" id="btn-enable-push">Enable Notifications</button>
          <button class="btn btn-secondary btn-sm" id="btn-test-push">Send Test</button>
          <button class="btn btn-secondary btn-sm" id="btn-disable-push">Disable</button>
        </div>
        <p class="notification-permission-help" id="push-status-help"></p>
      </section>

      ${adminView ? `
        <section class="notification-admin-card">
          <h2>Send Custom Notification</h2>
          <p class="page-subtitle">Write your own announcement and send it to every subscribed reader.</p>
          <form id="admin-push-form">
            <div class="form-group">
              <label for="admin-push-title">Title</label>
              <input type="text" id="admin-push-title" placeholder="New event, update, or chapter drop..." maxlength="60" required />
            </div>
            <div class="form-group">
              <label for="admin-push-message">Message</label>
              <textarea id="admin-push-message" placeholder="What do you want readers to know?" required></textarea>
            </div>
            <div class="form-group">
              <label for="admin-push-url">Open this link when clicked</label>
              <input type="text" id="admin-push-url" value="#/notifications" placeholder="#/story/story-id/chapter/1" />
            </div>
            <div class="notification-permission-actions">
              <button type="submit" class="btn btn-primary">Send Custom Push</button>
            </div>
          </form>
        </section>
      ` : ''}

      ${notifications.length > 0 ? `
        <div class="notifications-toolbar">
          <button class="btn btn-secondary btn-sm" id="btn-mark-all-read">✓ Mark All Read</button>
          <button class="btn btn-danger btn-sm" id="btn-clear-all">🗑️ Clear All</button>
        </div>
      ` : ''}

      <div class="notification-list" id="notification-list">
        ${notifications.length > 0
          ? notifications.map(n => renderNotificationItem(n)).join('')
          : `<div class="empty-state">
               <div class="empty-state-icon">🔔</div>
               <h3>No notifications yet</h3>
               <p>When new chapters are uploaded, you'll see them here.</p>
             </div>`
        }
      </div>
    </div>
  `;

  const pushStatusPill = document.getElementById('push-status-pill');
  const pushStatusHelp = document.getElementById('push-status-help');
  const enablePushButton = document.getElementById('btn-enable-push');
  const disablePushButton = document.getElementById('btn-disable-push');
  const testPushButton = document.getElementById('btn-test-push');

  function setPushStatus(state) {
    if (!state.supported) {
      pushStatusPill.textContent = 'Push not supported';
      pushStatusPill.className = 'notification-status-pill status-off';
      pushStatusHelp.textContent = 'This browser does not support service-worker push notifications.';
      enablePushButton.disabled = true;
      disablePushButton.disabled = true;
      testPushButton.disabled = true;
      return;
    }

    if (state.permission === 'denied') {
      pushStatusPill.textContent = 'Permission denied';
      pushStatusPill.className = 'notification-status-pill status-off';
      pushStatusHelp.textContent = 'Notifications are blocked in this browser. Re-enable them in browser site settings if you want alerts again.';
      enablePushButton.disabled = true;
      disablePushButton.disabled = false;
      testPushButton.disabled = true;
      return;
    }

    if (state.subscribed) {
      pushStatusPill.textContent = 'Subscribed';
      pushStatusPill.className = 'notification-status-pill status-on';
      pushStatusHelp.textContent = 'This browser is ready to receive admin announcements and chapter alerts.';
      enablePushButton.disabled = true;
      disablePushButton.disabled = false;
      testPushButton.disabled = false;
      return;
    }

    pushStatusPill.textContent = state.permission === 'granted' ? 'Permission granted' : 'Not enabled yet';
    pushStatusPill.className = 'notification-status-pill status-pending';
    pushStatusHelp.textContent = state.permission === 'granted'
      ? 'Permission is already granted. Click Enable Notifications to complete the subscription for this browser.'
      : 'Click Enable Notifications to grant permission once and subscribe this browser.';
    enablePushButton.disabled = false;
    disablePushButton.disabled = true;
    testPushButton.disabled = true;
  }

  async function refreshPushState() {
    const state = await getPushState();
    setPushStatus(state);
  }

  enablePushButton.addEventListener('click', async () => {
    try {
      const result = await subscribeToPush();
      showToast({
        title: result.ok ? 'Notifications Enabled' : 'Notifications Not Enabled',
        message: result.message,
        icon: result.ok ? '✅' : '⚠️',
      });
      if (result.ok) {
        await sendLocalTestNotification();
      }
    } catch (error) {
      showToast({ title: 'Push Setup Failed', message: error?.message || 'Could not enable notifications.', icon: '❌' });
    }
    refreshPushState();
  });

  disablePushButton.addEventListener('click', async () => {
    const result = await unsubscribeFromPush();
    showToast({ title: result.ok ? 'Notifications Disabled' : 'Action Failed', message: result.message, icon: result.ok ? '🔕' : '⚠️' });
    refreshPushState();
  });

  testPushButton.addEventListener('click', async () => {
    const result = await sendLocalTestNotification();
    showToast({ title: result.ok ? 'Test Sent' : 'Test Failed', message: result.message, icon: result.ok ? '🧪' : '⚠️' });
  });

  if (adminView) {
    document.getElementById('admin-push-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('admin-push-title').value.trim();
      const message = document.getElementById('admin-push-message').value.trim();
      const url = document.getElementById('admin-push-url').value.trim() || '#/notifications';

      if (!title || !message) {
        showToast({ title: 'Missing Fields', message: 'Title and message are required.', icon: '⚠️' });
        return;
      }

      const result = await sendPushAnnouncement({ title, message, url });
      if (result.ok) {
        showToast({
          title: 'Custom Push Sent',
          message: result.message === 'Push notification sent.'
            ? `Delivered to ${result.sent} subscriber${result.sent !== 1 ? 's' : ''}.`
            : result.message,
          icon: '📣',
        });
        document.getElementById('admin-push-form').reset();
      } else {
        showToast({ title: 'Push Failed', message: result.message, icon: '❌' });
      }
    });
  }

  // Event listeners
  if (notifications.length > 0) {
    document.getElementById('btn-mark-all-read').addEventListener('click', () => {
      markAllRead();
      renderNotifications(container);
    });

    document.getElementById('btn-clear-all').addEventListener('click', () => {
      clearAllNotifications();
      renderNotifications(container);
    });

    // Click individual notifications
    container.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        markNotificationRead(id);
        const targetUrl = item.dataset.url;
        if (targetUrl) {
          if (targetUrl.startsWith('#')) {
            window.location.hash = targetUrl;
          } else if (targetUrl.includes('#/')) {
            window.location.hash = targetUrl.slice(targetUrl.indexOf('#'));
          } else {
            window.location.href = targetUrl;
          }
        }
      });
    });
  }

  refreshPushState();
}

function renderNotificationItem(notification) {
  const timeAgo = getTimeAgo(new Date(notification.createdAt));
  const fallbackUrl = notification.storyId && notification.chapterNumber
    ? `#/story/${notification.storyId}/chapter/${notification.chapterNumber}`
    : '#/notifications';
  const targetUrl = notification.url || fallbackUrl;
  const icon = notification.icon || (notification.type === 'announcement' ? '📣' : '📖');

  return `
    <div class="notification-item ${notification.read ? '' : 'unread'}"
         data-id="${notification.id}"
         data-url="${targetUrl}">
      <div class="notification-icon">${icon}</div>
      <div class="notification-content">
        <div class="notification-text"><strong>${notification.title || 'Notification'}</strong></div>
        <div class="notification-message">${notification.message || 'You have a new notification.'}</div>
        <div class="notification-time">${timeAgo}</div>
      </div>
      ${notification.read ? '' : '<div class="notification-dot"></div>'}
    </div>
  `;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
