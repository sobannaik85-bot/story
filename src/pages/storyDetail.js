// ==============================
// STORY DETAIL PAGE
// ==============================

import { getStory, deleteStory, deleteChapter, refreshStoriesFromCloud } from '../store.js';
import { isLoggedIn } from '../auth.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

export function renderStoryDetail(container, storyId) {
  refreshStoriesFromCloud().then((changed) => {
    if (changed) {
      renderStoryDetail(container, storyId);
    }
  }).catch((error) => {
    console.warn('Story detail refresh from cloud failed:', error);
  });

  const story = getStory(storyId);

  if (!story) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">😕</div>
        <h3>Story not found</h3>
        <p><a href="#/">Back to Home</a></p>
      </div>
    `;
    return;
  }

  const coverEmoji = getCoverEmoji(story.genre);
  const chapterCount = story.chapters.length;
  const createdDate = new Date(story.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
  const updatedDate = new Date(story.updatedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });

  // Find first unread or first chapter for "Continue Reading"
  const firstChapter = story.chapters.length > 0 ? story.chapters[0] : null;
  const adminView = isLoggedIn();

  container.innerHTML = `
    <div class="story-detail">
      <div class="story-detail-header">
        ${story.coverImage
          ? `<img class="story-detail-cover" src="${story.coverImage}" alt="${story.title}" />`
          : `<div class="story-detail-cover-placeholder">${coverEmoji}</div>`
        }
        <div class="story-detail-info">
          <span class="story-detail-genre">${story.genre || 'General'}</span>
          <h1>${story.title}</h1>
          <p class="story-detail-desc">${story.description}</p>
          <div class="story-detail-stats">
            <div class="stat-item">
              <span class="stat-value">${chapterCount}</span>
              <span class="stat-label">Chapters</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${createdDate.split(',')[0]}</span>
              <span class="stat-label">Created</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">${updatedDate.split(',')[0]}</span>
              <span class="stat-label">Updated</span>
            </div>
          </div>
          <div class="story-detail-actions">
            ${firstChapter
              ? `<a href="#/story/${story.id}/chapter/${firstChapter.number}" class="btn btn-primary" id="btn-start-reading">
                   ▶ Start Reading
                 </a>`
              : ''
            }
            ${adminView ? `
              <a href="#/upload" class="btn btn-secondary" id="btn-add-chapter">
                ✍️ Add Chapter
              </a>
              <button type="button" class="btn btn-secondary admin-btn-edit-detail" style="margin-left: auto;">✏️ Edit Story</button>
              <button type="button" class="btn btn-danger admin-btn-delete-detail">🗑️ Delete Story</button>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="chapter-list-header">
        <h2>📖 Chapters</h2>
        <span class="story-count">${chapterCount} chapter${chapterCount !== 1 ? 's' : ''}</span>
      </div>

      <div class="chapter-list" id="chapter-list">
        ${chapterCount > 0
          ? story.chapters.map(ch => {
              const chDate = new Date(ch.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric'
              });
              const isRecent = (Date.now() - new Date(ch.createdAt).getTime()) < 3 * 24 * 60 * 60 * 1000;
              return `
                <div class="chapter-item" id="chapter-${ch.number}" data-chapter-number="${ch.number}">
                  <div class="chapter-item-left">
                    <div class="chapter-number">${ch.number}</div>
                    <div>
                      <div class="chapter-title">${ch.title}</div>
                      <div class="chapter-date">${chDate} · ${ch.contentType === 'images' ? '🖼️ Image' : '📝 Text'}</div>
                    </div>
                  </div>
                  <div class="chapter-item-actions" style="display:flex;align-items:center;gap:8px;">
                    ${isRecent ? '<span class="chapter-new-badge">New</span>' : ''}
                    ${adminView ? `
                      <button type="button" class="btn btn-secondary btn-sm" data-admin-action="edit-chapter" data-chapter-id="${ch.id}">✏️ Edit</button>
                      <button type="button" class="btn btn-danger btn-sm" data-admin-action="delete-chapter" data-chapter-id="${ch.id}">🗑️ Delete</button>
                    ` : ''}
                    <button type="button" class="btn btn-secondary btn-sm" data-admin-action="read-chapter" data-chapter-number="${ch.number}">Read →</button>
                  </div>
                </div>
              `;
            }).join('')
          : `<div class="empty-state">
               <div class="empty-state-icon">📝</div>
               <h3>No chapters yet</h3>
               <p>Check back soon for new chapters!</p>
             </div>`
        }
      </div>
    </div>
  `;

  // Admin story events
  if (adminView) {
    const editBtn = container.querySelector('.admin-btn-edit-detail');
    const deleteBtn = container.querySelector('.admin-btn-delete-detail');
    const addChapterBtn = container.querySelector('#btn-add-chapter');

    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        const modals = await import('../modals.js');
        modals.showEditStoryModal(story.id, {
          onSaved: () => renderStoryDetail(container, story.id),
        });
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this entire story?')) {
          deleteStory(story.id);
          showToast({ title: 'Deleted', message: 'Story removed.', icon: '🗑️' });
          navigate('/');
        }
      });
    }

    if (addChapterBtn) {
      addChapterBtn.addEventListener('click', () => {
        localStorage.setItem('storyverse_upload_story', story.id);
      });
    }
  }

  // Chapter events
  const chapterList = container.querySelector('#chapter-list');
  chapterList.addEventListener('click', async (e) => {
    const readButton = e.target.closest('[data-admin-action="read-chapter"]');
    if (readButton) {
      const chapterNumber = readButton.dataset.chapterNumber;
      navigate(`/story/${story.id}/chapter/${chapterNumber}`);
      return;
    }

    const chapterRow = e.target.closest('.chapter-item[data-chapter-number]');
    if (!e.target.closest('button') && chapterRow) {
      navigate(`/story/${story.id}/chapter/${chapterRow.dataset.chapterNumber}`);
      return;
    }

    if (!adminView) return;

    const editChapterBtn = e.target.closest('[data-admin-action="edit-chapter"]');
    if (editChapterBtn) {
      const chapterId = editChapterBtn.dataset.chapterId;
      const modals = await import('../modals.js');
      modals.showEditChapterModal(story.id, chapterId, {
        onSaved: () => renderStoryDetail(container, story.id),
      });
      return;
    }

    const deleteChapterBtn = e.target.closest('[data-admin-action="delete-chapter"]');
    if (deleteChapterBtn) {
      const chapterId = deleteChapterBtn.dataset.chapterId;
      if (confirm('Delete this chapter?')) {
        deleteChapter(story.id, chapterId);
        showToast({ title: 'Deleted', message: 'Chapter removed.', icon: '🗑️' });
        renderStoryDetail(container, story.id);
      }
    }
  });
}

function getCoverEmoji(genre) {
  const emojiMap = {
    'Fantasy': '🌙', 'Sci-Fi': '🚀', 'Romance': '💕',
    'Horror': '👻', 'Mystery': '🔍', 'Adventure': '⚔️',
    'Thriller': '🔥', 'Comedy': '😄', 'Drama': '🎭', 'Action': '💥',
  };
  return emojiMap[genre] || '📖';
}
