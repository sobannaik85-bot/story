// ==============================
// UPLOAD PAGE
// ==============================

import { getAllStories, createStory, addChapter, syncStoriesNow } from '../store.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';
import { compressImage } from '../utils/imageCompressor.js';
import { sendPushAnnouncement } from '../utils/pushNotifications.js';

export function renderUpload(container) {
  const stories = getAllStories();

  container.innerHTML = `
    <div class="upload-page">
      <h1>✍️ Create & Upload</h1>
      <p class="page-subtitle">Add new stories or upload chapters to existing ones.</p>

      <div class="upload-tabs">
        <button class="upload-tab active" id="tab-new-story" data-tab="new-story">New Story</button>
        <button class="upload-tab" id="tab-add-chapter" data-tab="add-chapter">Add Chapter</button>
      </div>

      <!-- New Story Form -->
      <div class="form-card" id="form-new-story">
        <form id="new-story-form">
          <div class="form-group">
            <label for="story-title">Story Title *</label>
            <input type="text" id="story-title" placeholder="Enter your story title..." required />
          </div>

          <div class="form-group">
            <label for="story-description">Description *</label>
            <textarea id="story-description" placeholder="Write a compelling description for your story..." required></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="story-genre">Genre</label>
              <select id="story-genre">
                <option value="Fantasy">Fantasy</option>
                <option value="Sci-Fi">Sci-Fi</option>
                <option value="Romance">Romance</option>
                <option value="Horror">Horror</option>
                <option value="Mystery">Mystery</option>
                <option value="Adventure">Adventure</option>
                <option value="Thriller">Thriller</option>
                <option value="Comedy">Comedy</option>
                <option value="Drama">Drama</option>
                <option value="Action">Action</option>
              </select>
            </div>
            <div class="form-group">
              <label>Cover Image (optional)</label>
              <div class="file-upload-area" id="cover-upload-area">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <p>Click to upload cover image</p>
                <p class="file-name" id="cover-file-name"></p>
              </div>
              <input type="file" id="cover-file-input" accept="image/*" style="display:none" />
            </div>
          </div>

          <button type="submit" class="btn btn-primary" id="btn-create-story">🚀 Create Story</button>
        </form>
      </div>

      <!-- Add Chapter Form -->
      <div class="form-card" id="form-add-chapter" style="display:none">
        <form id="add-chapter-form">
          <div class="form-group">
            <label for="chapter-story-select">Select Story *</label>
            <select id="chapter-story-select" required>
              <option value="">-- Select a story --</option>
              ${stories.map(s => `<option value="${s.id}">${s.title}</option>`).join('')}
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="chapter-title">Chapter Title *</label>
              <input type="text" id="chapter-title" placeholder="e.g., The Beginning" required />
            </div>
            <div class="form-group">
              <label for="chapter-number">Chapter Number *</label>
              <input type="number" id="chapter-number" min="1" placeholder="1" required />
            </div>
          </div>

          <div class="form-group">
            <label for="chapter-content-type">Content Type</label>
            <select id="chapter-content-type">
              <option value="text">Text (Written Chapter)</option>
              <option value="images">Images (Manga/Comic Style)</option>
            </select>
          </div>

          <!-- Text Content -->
          <div class="form-group" id="text-content-group">
            <label for="chapter-text-content">Chapter Content *</label>
            <textarea id="chapter-text-content" placeholder="Write your chapter content here... Use blank lines to separate paragraphs." style="min-height:250px"></textarea>
          </div>

          <!-- Image Content -->
          <div class="form-group" id="image-content-group" style="display:none">
            <label>Upload Chapter Pages *</label>
            <div class="file-upload-area" id="chapter-images-area">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p>Click to upload chapter images (select multiple)</p>
              <p class="file-name" id="chapter-images-names"></p>
            </div>
            <div class="chapter-image-order-list" id="chapter-images-preview"></div>
            <input type="file" id="chapter-images-input" accept="image/*" multiple style="display:none" />
          </div>

          <div class="form-group checkbox-group" style="display: flex; align-items: center; gap: 8px; margin-top: 10px; margin-bottom: 20px;">
            <input type="checkbox" id="send-real-notification" checked />
            <label for="send-real-notification" style="margin-bottom: 0;">Send real push notification to subscribed readers</label>
          </div>

          <button type="submit" class="btn btn-primary" id="btn-add-chapter-submit">📤 Upload Chapter</button>
        </form>
      </div>
    </div>
  `;

  const tabNewStory = document.getElementById('tab-new-story');
  const tabAddChapter = document.getElementById('tab-add-chapter');
  const formNewStory = document.getElementById('form-new-story');
  const formAddChapter = document.getElementById('form-add-chapter');

  function activateTab(tabName) {
    const isNewStory = tabName === 'new-story';
    tabNewStory.classList.toggle('active', isNewStory);
    tabAddChapter.classList.toggle('active', !isNewStory);
    formNewStory.style.display = isNewStory ? 'block' : 'none';
    formAddChapter.style.display = isNewStory ? 'none' : 'block';
  }

  // --- Tab switching ---
  tabNewStory.addEventListener('click', () => activateTab('new-story'));
  tabAddChapter.addEventListener('click', () => activateTab('add-chapter'));

  // --- Content type switching ---
  const contentTypeSelect = document.getElementById('chapter-content-type');
  contentTypeSelect.addEventListener('change', () => {
    const isText = contentTypeSelect.value === 'text';
    document.getElementById('text-content-group').style.display = isText ? 'block' : 'none';
    document.getElementById('image-content-group').style.display = isText ? 'none' : 'block';
  });

  // --- Cover image upload ---
  let coverImageData = null;
  const coverArea = document.getElementById('cover-upload-area');
  const coverInput = document.getElementById('cover-file-input');
  const coverName = document.getElementById('cover-file-name');

  coverArea.addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        coverImageData = await compressImage(file, 600, 0.8);
        coverName.textContent = `✅ ${file.name} ready`;
      } catch {
        showToast({ title: 'Error', message: 'Failed to process cover image.', icon: '❌' });
      }
    }
  });

  // --- Chapter images upload ---
  let chapterImagesData = [];
  let imageOrderId = 0;
  const imagesArea = document.getElementById('chapter-images-area');
  const imagesInput = document.getElementById('chapter-images-input');
  const imagesNames = document.getElementById('chapter-images-names');
  const imagesPreview = document.getElementById('chapter-images-preview');

  imagesArea.addEventListener('click', () => imagesInput.click());
  imagesInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let failedCount = 0;
    for (const file of files) {
      try {
        const compressed = await compressImage(file, 1000, 0.75);
        chapterImagesData.push({
          id: `chapter-image-${Date.now()}-${imageOrderId++}`,
          url: compressed,
          name: file.name,
        });
      } catch {
        failedCount += 1;
      }
    }

    if (failedCount > 0) {
      showToast({
        title: 'Some images failed',
        message: `${failedCount} image${failedCount > 1 ? 's' : ''} could not be processed.`,
        icon: '⚠️',
      });
    }

    imagesInput.value = '';
    renderChapterImagesPreview();
  });

  function renderChapterImagesPreview() {
    if (chapterImagesData.length === 0) {
      imagesNames.textContent = '';
      imagesPreview.innerHTML = '';
      return;
    }

    imagesNames.textContent = `${chapterImagesData.length} image${chapterImagesData.length > 1 ? 's' : ''} ready`;

    let html = '';
    chapterImagesData.forEach((img, index) => {
      html += `
        <div class="chapter-image-order-item" data-index="${index}">
          <div class="chapter-image-order-preview">
            <span class="chapter-image-order-index">${index + 1}</span>
            <img src="${img.url}" alt="Page ${index + 1}" />
            <span class="chapter-image-order-name">${img.name || `Page ${index + 1}`}</span>
          </div>
          <div class="chapter-image-order-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-index="${index}" data-action="up">↑</button>
            <button type="button" class="btn btn-secondary btn-sm" data-index="${index}" data-action="down">↓</button>
            <button type="button" class="btn btn-danger btn-sm" data-index="${index}" data-action="remove">Remove</button>
          </div>
        </div>
      `;
    });
    imagesPreview.innerHTML = html;
  }

  imagesPreview.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('button[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-action');
    const idx = parseInt(actionBtn.getAttribute('data-index'), 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= chapterImagesData.length) return;

    if (action === 'remove') {
      chapterImagesData.splice(idx, 1);
    } else if (action === 'up' && idx > 0) {
      [chapterImagesData[idx - 1], chapterImagesData[idx]] = [chapterImagesData[idx], chapterImagesData[idx - 1]];
    } else if (action === 'down' && idx < chapterImagesData.length - 1) {
      [chapterImagesData[idx + 1], chapterImagesData[idx]] = [chapterImagesData[idx], chapterImagesData[idx + 1]];
    }

    renderChapterImagesPreview();
  });

  // --- New Story form submit ---
  document.getElementById('new-story-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('story-title').value.trim();
    const description = document.getElementById('story-description').value.trim();
    const genre = document.getElementById('story-genre').value;

    if (!title || !description) {
      showToast({ title: 'Missing Fields', message: 'Story title and description are required.', icon: '⚠️' });
      return;
    }

    try {
      const story = createStory({
        title,
        description,
        genre,
        coverImage: coverImageData,
      });

      await syncStoriesNow({
        force: true,
        verifyStoryId: story.id,
      });

      showToast({
        title: 'Story Created! 🎉',
        message: `"${story.title}" is now live.`,
        icon: '📖',
      });

      // Navigate to the story
      navigate(`/story/${story.id}`);
    } catch (error) {
      if (error?.name === 'QuotaExceededError') {
        showToast({ title: 'Storage Full', message: 'You have reached your browser storage limit. Try deleting some stories or using smaller images.', icon: '⚠️' });
      } else {
        showToast({ title: 'Error', message: 'Could not create story.', icon: '❌' });
      }
    }
  });

  // --- Add Chapter form submit ---
  document.getElementById('add-chapter-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const storyId = document.getElementById('chapter-story-select').value;
    const title = document.getElementById('chapter-title').value.trim();
    const number = document.getElementById('chapter-number').value;
    const contentType = document.getElementById('chapter-content-type').value;
    const textContent = document.getElementById('chapter-text-content').value;
    const sendRealNotification = document.getElementById('send-real-notification').checked;

    if (!storyId || !title || !number) {
      showToast({ title: 'Missing Fields', message: 'Story, chapter title, and number are required.', icon: '⚠️' });
      return;
    }

    if (contentType === 'text' && !textContent.trim()) {
      showToast({ title: 'Missing Content', message: 'Please write some chapter content.', icon: '⚠️' });
      return;
    }

    if (contentType === 'images' && chapterImagesData.length === 0) {
      showToast({ title: 'Missing Images', message: 'Please upload at least one image.', icon: '⚠️' });
      return;
    }

    try {
      const chapter = addChapter(storyId, {
        title,
        number,
        contentType,
        content: textContent,
        images: chapterImagesData.map(img => img.url), // map to array of base64 strings
      });

      if (chapter) {
        await syncStoriesNow({
          force: true,
          verifyStoryId: storyId,
          verifyChapterNumber: chapter.number,
        });

        if (sendRealNotification) {
          const story = getAllStories().find(s => s.id === storyId);
          const pushResult = await sendPushAnnouncement({
            title: 'New Chapter Available!',
            message: `Chapter ${number}: ${title} has been added to ${story ? story.title : 'a story'}.`,
            url: `#/story/${storyId}/chapter/${chapter.number}`,
          });

          if (!pushResult.ok) {
            showToast({
              title: 'Chapter Saved, Push Not Sent',
              message: pushResult.message,
              icon: '⚠️',
            });
          }
        }

        showToast({
          title: 'Chapter Uploaded! 🎉',
          message: `Chapter ${chapter.number} is now available to readers.`,
          icon: '📚',
        });

        // Reset form
        document.getElementById('add-chapter-form').reset();
        chapterImagesData = [];
        imagesInput.value = '';
        renderChapterImagesPreview();

        // Navigate to story detail
        navigate(`/story/${storyId}`);
      }
    } catch (error) {
      if (error?.name === 'QuotaExceededError') {
        showToast({ title: 'Storage Full', message: 'Could not save chapter. You have reached your browser storage limit.', icon: '⚠️' });
      } else {
        showToast({
          title: 'Error',
          message: error?.message || 'Could not save chapter.',
          icon: '❌',
        });
      }
    }
  });

  // --- Auto-fill chapter number ---
  const storySelect = document.getElementById('chapter-story-select');

  function fillNextChapterNumber(storyId) {
    if (storyId) {
      const story = getAllStories().find(s => s.id === storyId);
      if (story) {
        const nextNum = story.chapters.length > 0
          ? Math.max(...story.chapters.map(c => c.number)) + 1
          : 1;
        document.getElementById('chapter-number').value = nextNum;
      }
    }
  }

  storySelect.addEventListener('change', (e) => {
    fillNextChapterNumber(e.target.value);
  });

  // If arriving from a specific story detail page, preselect story for fast chapter upload.
  const presetStoryId = localStorage.getItem('storyverse_upload_story');
  if (presetStoryId && stories.some(s => s.id === presetStoryId)) {
    activateTab('add-chapter');
    storySelect.value = presetStoryId;
    fillNextChapterNumber(presetStoryId);
    localStorage.removeItem('storyverse_upload_story');
  }
}
