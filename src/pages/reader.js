// ==============================
// READER PAGE
// ==============================

import { getStory, getChapter, refreshStoriesFromCloud } from '../store.js';

export function renderReader(container, storyId, chapterNum) {
  refreshStoriesFromCloud().then((changed) => {
    if (changed) {
      renderReader(container, storyId, chapterNum);
    }
  }).catch((error) => {
    console.warn('Reader refresh from cloud failed:', error);
  });

  const story = getStory(storyId);
  const chapter = getChapter(storyId, chapterNum);

  if (!story || !chapter) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">😕</div>
        <h3>Chapter not found</h3>
        <p><a href="#/">Back to Home</a></p>
      </div>
    `;
    return;
  }

  const chNum = parseInt(chapterNum);
  const orderedChapters = [...story.chapters].sort((a, b) => a.number - b.number);
  const currentIndex = orderedChapters.findIndex(c => c.number === chNum);
  const prevChapter = currentIndex > 0 ? orderedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < orderedChapters.length - 1
    ? orderedChapters[currentIndex + 1]
    : null;

  container.innerHTML = `
    <div class="reader">
      <div class="reader-progress-bar" id="reading-progress" style="width:0%"></div>

      <div class="reader-nav">
        <a href="#/story/${storyId}" class="reader-nav-back" id="reader-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          ${story.title}
        </a>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="reader-title">Chapter ${chapter.number}: ${chapter.title}</span>
          <button class="btn btn-secondary btn-sm" id="btn-download-chapter" title="Download this chapter">
            ⬇️ Download
          </button>
        </div>
      </div>

      <div class="reader-content ${chapter.contentType === 'images' ? 'image-mode' : 'text-mode'}" id="reader-content">
        ${chapter.contentType === 'images'
          ? chapter.images.map((img, i) => `<img src="${img}" alt="Page ${i + 1}" />`).join('')
          : formatTextContent(chapter.content)
        }
      </div>

      <div class="reader-bottom-nav">
        ${prevChapter
          ? `<a href="#/story/${storyId}/chapter/${prevChapter.number}" class="btn btn-secondary btn-sm" id="btn-prev-chapter">
               ← Chapter ${prevChapter.number}
             </a>`
          : '<div></div>'
        }
        ${nextChapter
          ? `<a href="#/story/${storyId}/chapter/${nextChapter.number}" class="btn btn-primary btn-sm" id="btn-next-chapter">
               Chapter ${nextChapter.number} →
             </a>`
          : `<a href="#/story/${storyId}" class="btn btn-secondary btn-sm" id="btn-back-to-story">
               Back to Story
             </a>`
        }
      </div>
    </div>
  `;

  // Download button
  document.getElementById('btn-download-chapter').addEventListener('click', () => {
    downloadChapter(story, chapter);
  });

  // Reading progress bar
  setupProgressBar();
}

function formatTextContent(text) {
  if (!text) return '<p>No content available.</p>';

  return text
    .split(/\n\n+/)
    .filter(p => p.trim())
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function setupProgressBar() {
  const progressBar = document.getElementById('reading-progress');
  if (!progressBar) return;

  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = `${Math.min(progress, 100)}%`;
  }

  window.addEventListener('scroll', updateProgress);
  updateProgress();

  // Clean up when navigating away
  const cleanup = () => {
    window.removeEventListener('scroll', updateProgress);
    window.removeEventListener('hashchange', cleanup);
  };
  window.addEventListener('hashchange', cleanup);
}

function downloadChapter(story, chapter) {
  if (chapter.contentType === 'text') {
    // Download as .txt file
    const text = `${story.title}\nChapter ${chapter.number}: ${chapter.title}\n${'='.repeat(50)}\n\n${chapter.content}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${story.title} - Chapter ${chapter.number} - ${chapter.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (chapter.contentType === 'images' && chapter.images.length > 0) {
    // Download images individually
    chapter.images.forEach((imgData, i) => {
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `${story.title} - Ch${chapter.number} - Page ${i + 1}.png`;
      a.click();
    });
  }
}
