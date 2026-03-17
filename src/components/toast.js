// ==============================
// TOAST Component
// ==============================

export function showToast({ title, message, icon = '🔔' }) {
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
  `;

  container.appendChild(toast);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Listen for new chapter notifications and show toast
window.addEventListener('storyverse:notification', (e) => {
  const { title, message, type, storyTitle, chapterTitle, chapterNumber, icon } = e.detail;

  const toastTitle = title || (type === 'announcement' ? 'StoryVerse Announcement' : 'New Chapter Released! 🎉');
  const toastMessage = message || `Chapter ${chapterNumber}: "${chapterTitle}" added to ${storyTitle}`;
  showToast({
    title: toastTitle,
    message: toastMessage,
    icon: icon || (type === 'announcement' ? '📣' : '📖'),
  });
});
