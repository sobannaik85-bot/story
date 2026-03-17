// ==============================
// STORY CARD Component
// ==============================

import { isLoggedIn } from '../auth.js';

export function createStoryCard(story) {
  const chapterCount = story.chapters ? story.chapters.length : 0;
  const updatedDate = new Date(story.updatedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  const isNew = (Date.now() - new Date(story.updatedAt).getTime()) < 3 * 24 * 60 * 60 * 1000;
  const coverEmoji = getCoverEmoji(story.genre);

  return `
    <article class="story-card" id="story-card-${story.id}" data-story-id="${story.id}">
      ${isNew ? '<span class="new-badge">New</span>' : ''}
      ${story.coverImage
        ? `<img class="story-card-cover" src="${story.coverImage}" alt="${story.title}" />`
        : `<div class="story-card-cover-placeholder">${coverEmoji}</div>`
      }
      <div class="story-card-body">
        <span class="story-card-genre">${story.genre || 'General'}</span>
        <h3 class="story-card-title">${story.title}</h3>
        <p class="story-card-desc">${story.description}</p>
        <div class="story-card-meta">
          <span>📚 ${chapterCount} chapter${chapterCount !== 1 ? 's' : ''}</span>
          <span>${updatedDate}</span>
        </div>
      </div>
      ${isLoggedIn() ? `
        <div class="story-admin-actions">
          <button type="button" class="btn btn-secondary btn-sm admin-action-btn" data-admin-action="edit-story" data-story-id="${story.id}" aria-label="Edit story">✏️</button>
          <button type="button" class="btn btn-danger btn-sm admin-action-btn" data-admin-action="delete-story" data-story-id="${story.id}" aria-label="Delete story">🗑️</button>
        </div>
      ` : ''}
    </article>
  `;
}

function getCoverEmoji(genre) {
  const emojiMap = {
    'Fantasy': '🌙',
    'Sci-Fi': '🚀',
    'Romance': '💕',
    'Horror': '👻',
    'Mystery': '🔍',
    'Adventure': '⚔️',
    'Thriller': '🔥',
    'Comedy': '😄',
    'Drama': '🎭',
    'Action': '💥',
  };
  return emojiMap[genre] || '📖';
}
