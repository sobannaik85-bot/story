// ==============================
// MODALS
// ==============================

import { getStory, getChapterById, updateStory, updateChapter, syncStoriesNow } from './store.js';
import { showToast } from './components/toast.js';
import { compressImage } from './utils/imageCompressor.js';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createModalShell(title, bodyHtml) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head">
        <h2>${escapeHtml(title)}</h2>
        <button type="button" class="btn btn-secondary btn-sm modal-close-btn" data-modal-close aria-label="Close">✕</button>
      </div>
      ${bodyHtml}
    </div>
  `;

  const close = () => {
    document.removeEventListener('keydown', handleEscape);
    modal.remove();
  };

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      close();
    }
  };

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-modal-close]')) {
      close();
    }
  });

  document.addEventListener('keydown', handleEscape);
  document.body.appendChild(modal);

  return { modal, close };
}

export function showEditStoryModal(storyId, options = {}) {
  const story = getStory(storyId);
  if (!story) return;

  const genres = ['Fantasy', 'Sci-Fi', 'Romance', 'Horror', 'Mystery', 'Adventure', 'Thriller', 'Comedy', 'Drama', 'Action'];
  const { modal, close } = createModalShell('Edit Story', `
    <form class="modal-form" data-edit-story-form>
      <div class="form-group">
        <label for="edit-story-title">Title</label>
        <input type="text" id="edit-story-title" value="${escapeHtml(story.title)}" required />
      </div>
      <div class="form-group">
        <label for="edit-story-desc">Description</label>
        <textarea id="edit-story-desc" required>${escapeHtml(story.description)}</textarea>
      </div>
      <div class="form-group">
        <label for="edit-story-genre">Genre</label>
        <select id="edit-story-genre">
          ${genres.map(g => `<option value="${g}" ${g === story.genre ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Changes</button>
      </div>
    </form>
  `);

  const form = modal.querySelector('[data-edit-story-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = modal.querySelector('#edit-story-title').value.trim();
    const desc = modal.querySelector('#edit-story-desc').value.trim();
    const genre = modal.querySelector('#edit-story-genre').value;

    if (!title || !desc) {
      showToast({ title: 'Missing Fields', message: 'Title and description are required.', icon: '⚠️' });
      return;
    }

    try {
      updateStory(storyId, { title, description: desc, genre });
      await syncStoriesNow({
        force: true,
        verifyStoryId: storyId,
      });

      showToast({ title: 'Success', message: 'Story updated successfully.', icon: '✅' });
      close();

      if (typeof options.onSaved === 'function') {
        options.onSaved();
      }
    } catch (error) {
      showToast({
        title: 'Could not update story',
        message: error?.message || 'Story update was not confirmed by the database.',
        icon: '⚠️',
      });
    }
  });
}

export function showEditChapterModal(storyId, chapterId, options = {}) {
  const story = getStory(storyId);
  const chapter = getChapterById(storyId, chapterId);
  if (!story || !chapter) return;

  const isImageChapter = chapter.contentType === 'images';
  let imageItems = (chapter.images || []).map((url, index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    url,
  }));

  const { modal, close } = createModalShell(`Edit Chapter ${chapter.number}`, `
    <form class="modal-form" data-edit-chapter-form>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-chapter-title">Chapter Title</label>
          <input type="text" id="edit-chapter-title" value="${escapeHtml(chapter.title)}" required />
        </div>
        <div class="form-group">
          <label for="edit-chapter-number">Chapter Number</label>
          <input type="number" id="edit-chapter-number" min="1" value="${chapter.number}" required />
        </div>
      </div>

      ${isImageChapter ? `
        <div class="form-group">
          <label>Add More Images</label>
          <div class="file-upload-area modal-upload-area" data-open-images>
            <p>Click to add more images to this chapter</p>
          </div>
          <input type="file" data-images-input accept="image/*" multiple style="display:none" />
        </div>
        <div class="form-group">
          <label>Arrange Chapter Images</label>
          <div class="chapter-image-order-list" data-image-order-list></div>
        </div>
      ` : `
        <div class="form-group">
          <label for="edit-chapter-content">Chapter Content</label>
          <textarea id="edit-chapter-content" style="min-height:220px" required>${escapeHtml(chapter.content || '')}</textarea>
        </div>
      `}

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Chapter</button>
      </div>
    </form>
  `);

  const form = modal.querySelector('[data-edit-chapter-form]');

  function renderImageOrderList() {
    const list = modal.querySelector('[data-image-order-list]');
    if (!list) return;

    if (imageItems.length === 0) {
      list.innerHTML = '<p class="empty-image-order">No images in this chapter yet.</p>';
      return;
    }

    list.innerHTML = imageItems.map((item, index) => `
      <div class="chapter-image-order-item" data-image-id="${item.id}">
        <div class="chapter-image-order-preview">
          <span class="chapter-image-order-index">${index + 1}</span>
          <img src="${item.url}" alt="Page ${index + 1}" />
        </div>
        <div class="chapter-image-order-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-image-action="up" data-image-id="${item.id}">↑</button>
          <button type="button" class="btn btn-secondary btn-sm" data-image-action="down" data-image-id="${item.id}">↓</button>
          <button type="button" class="btn btn-danger btn-sm" data-image-action="remove" data-image-id="${item.id}">Remove</button>
        </div>
      </div>
    `).join('');
  }

  if (isImageChapter) {
    const openImagesBtn = modal.querySelector('[data-open-images]');
    const imagesInput = modal.querySelector('[data-images-input]');
    const imageList = modal.querySelector('[data-image-order-list]');

    openImagesBtn.addEventListener('click', () => imagesInput.click());

    imagesInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      for (const file of files) {
        try {
          const compressed = await compressImage(file, 1000, 0.75);
          imageItems.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            url: compressed,
          });
        } catch {
          showToast({ title: 'Image Error', message: `Could not process ${file.name}.`, icon: '⚠️' });
        }
      }

      imagesInput.value = '';
      renderImageOrderList();
    });

    imageList.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-image-action]');
      if (!actionBtn) return;

      const action = actionBtn.dataset.imageAction;
      const imageId = actionBtn.dataset.imageId;
      const index = imageItems.findIndex(item => item.id === imageId);
      if (index === -1) return;

      if (action === 'remove') {
        imageItems.splice(index, 1);
      } else if (action === 'up' && index > 0) {
        [imageItems[index - 1], imageItems[index]] = [imageItems[index], imageItems[index - 1]];
      } else if (action === 'down' && index < imageItems.length - 1) {
        [imageItems[index], imageItems[index + 1]] = [imageItems[index + 1], imageItems[index]];
      }

      renderImageOrderList();
    });

    renderImageOrderList();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = modal.querySelector('#edit-chapter-title').value.trim();
    const number = modal.querySelector('#edit-chapter-number').value;
    if (!title || !number) {
      showToast({ title: 'Missing Fields', message: 'Title and chapter number are required.', icon: '⚠️' });
      return;
    }

    const updates = {
      title,
      number,
    };

    if (isImageChapter) {
      if (imageItems.length === 0) {
        showToast({ title: 'Missing Images', message: 'Please keep at least one image.', icon: '⚠️' });
        return;
      }
      updates.contentType = 'images';
      updates.images = imageItems.map(item => item.url);
      updates.content = '';
    } else {
      const content = modal.querySelector('#edit-chapter-content').value.trim();
      if (!content) {
        showToast({ title: 'Missing Content', message: 'Please add chapter content.', icon: '⚠️' });
        return;
      }
      updates.contentType = 'text';
      updates.content = content;
      updates.images = [];
    }

    try {
      updateChapter(storyId, chapterId, updates);
      await syncStoriesNow({
        force: true,
        verifyStoryId: storyId,
        verifyChapterNumber: Number(number),
      });

      showToast({ title: 'Saved', message: `Chapter ${number} updated successfully.`, icon: '✅' });
      close();
      if (typeof options.onSaved === 'function') {
        options.onSaved();
      }
    } catch (error) {
      showToast({
        title: 'Could not update chapter',
        message: error?.message || 'Please review chapter data and try again.',
        icon: '⚠️',
      });
    }
  });
}
