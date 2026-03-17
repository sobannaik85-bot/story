// ==============================
// HOME PAGE
// ==============================

import { getAllStories, deleteStory, refreshStoriesFromCloud } from '../store.js';
import { createStoryCard } from '../components/storyCard.js';
import { isLoggedIn } from '../auth.js';
import { showToast } from '../components/toast.js';

export function renderHome(container) {
  refreshStoriesFromCloud().then((changed) => {
    if (changed) {
      renderHome(container);
    }
  }).catch((error) => {
    console.warn('Home refresh from cloud failed:', error);
  });

  const stories = getAllStories();

  container.innerHTML = `
    <section class="hero">
      <div class="hero-badge">✨ Your Story Universe</div>
      <h1>Read & Share Stories<br /><span class="gradient-text">Chapter by Chapter</span></h1>
      <p>Upload your stories, organize them into chapters, and share your creative world with readers everywhere.</p>
      <div class="hero-actions">
        ${isLoggedIn() ? `
          <a href="#/upload" class="btn btn-primary" id="hero-start-writing">
            ✍️ Start Writing
          </a>
        ` : ''}
        <a href="#/" class="btn ${isLoggedIn() ? 'btn-secondary' : 'btn-primary'}" id="hero-browse" onclick="document.getElementById('story-section').scrollIntoView({behavior:'smooth'}); return false;">
          📚 Browse Stories
        </a>
      </div>
    </section>

    <div class="search-bar-container">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="search-input" placeholder="Search stories by title or genre..." />
      </div>
    </div>

    <section id="story-section">
      <div class="section-header">
        <h2>📚 All Stories</h2>
        <span class="story-count" id="story-count">${stories.length} stor${stories.length !== 1 ? 'ies' : 'y'}</span>
      </div>
      <div class="story-grid" id="story-grid">
        ${stories.length > 0
          ? stories.map(s => createStoryCard(s)).join('')
          : `<div class="empty-state">
               <div class="empty-state-icon">📝</div>
               <h3>No stories yet</h3>
               <p>Be the first to upload a story!</p>
             </div>`
        }
      </div>
    </section>
  `;

  const grid = document.getElementById('story-grid');
  const count = document.getElementById('story-count');

  function renderGrid(items) {
    if (items.length > 0) {
      grid.innerHTML = items.map(s => createStoryCard(s)).join('');
    } else {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>No stories found</h3>
          <p>Try a different search term</p>
        </div>
      `;
    }
    count.textContent = `${items.length} stor${items.length !== 1 ? 'ies' : 'y'}`;
  }

  // Search functionality
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = stories.filter(s =>
      s.title.toLowerCase().includes(query) ||
      (s.genre && s.genre.toLowerCase().includes(query)) ||
      s.description.toLowerCase().includes(query)
    );
    renderGrid(filtered);
  });

  // Story card + admin action handling (single delegated listener)
  grid.addEventListener('click', async (e) => {
    const editButton = e.target.closest('[data-admin-action="edit-story"]');
    if (editButton) {
      e.preventDefault();
      e.stopPropagation();
      const storyId = editButton.dataset.storyId;
      if (!storyId) return;
      const modals = await import('../modals.js');
      modals.showEditStoryModal(storyId, {
        onSaved: () => renderHome(container),
      });
      return;
    }

    const deleteButton = e.target.closest('[data-admin-action="delete-story"]');
    if (deleteButton) {
      e.preventDefault();
      e.stopPropagation();
      const storyId = deleteButton.dataset.storyId;
      if (!storyId) return;
      if (confirm('Are you sure you want to delete this story? This cannot be undone.')) {
        deleteStory(storyId);
        showToast({ title: 'Deleted', message: 'Story has been removed.', icon: '🗑️' });
        renderHome(container);
      }
      return;
    }

    const card = e.target.closest('.story-card[data-story-id]');
    if (card) {
      window.location.hash = `#/story/${card.dataset.storyId}`;
    }
  });
}
