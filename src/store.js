import { READ_ONLY_MODE, STATIC_STORIES_URL } from './config.js';

// ==============================
// STORE — localStorage persistence
// ==============================

const STORIES_KEY = 'storyverse_stories';
const STORIES_DELETED_KEY = 'storyverse_deleted_story_ids';
const NOTIFICATIONS_KEY = 'storyverse_notifications';
const LOCAL_STORIES_ENDPOINT = '/.netlify/functions/stories-data';
const PRIMARY_STORIES_ENDPOINT = String(import.meta.env.VITE_STORIES_API_ENDPOINT || '').trim();
const STORIES_SYNC_DEBOUNCE_MS = 1200;
const STORIES_REFRESH_MIN_INTERVAL_MS = 300000;
const STORIES_LAST_SYNC_AT_KEY = 'storyverse_last_sync_at';
const READ_ONLY_ERROR_MESSAGE = 'This site is in read-only mode.';

let isStoreInitializing = false;
let storiesSyncTimer = null;
let storiesMemoryCache = [];
let forceFullStoriesSync = false;
let activeStoriesRefreshPromise = null;
let lastStoriesRefreshAt = 0;

// --- Helpers ---
function getItem(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(parsed)) {
      if (key === STORIES_KEY) {
        storiesMemoryCache = parsed;
      }
      return parsed;
    }

    if (key === STORIES_KEY) {
      return [...storiesMemoryCache];
    }
    return [];
  } catch {
    if (key === STORIES_KEY) {
      return [...storiesMemoryCache];
    }
    return [];
  }
}

function setItem(key, data) {
  if (key === STORIES_KEY) {
    storiesMemoryCache = Array.isArray(data) ? data : [];
  }

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn(`Failed to persist ${key} in local storage:`, error);
  }

  // Keep stories/chapters consistent across devices via Netlify Functions.
  if (key === STORIES_KEY && !isStoreInitializing) {
    scheduleStoriesCloudSync();
  }
}

function getLastStoriesSyncAt() {
  const value = Number(localStorage.getItem(STORIES_LAST_SYNC_AT_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function setLastStoriesSyncAt(timestamp) {
  try {
    localStorage.setItem(STORIES_LAST_SYNC_AT_KEY, String(timestamp));
  } catch (error) {
    console.warn('Failed to persist last stories sync timestamp:', error);
  }
}

function getStoriesEndpointCandidates() {
  const candidates = [];

  if (PRIMARY_STORIES_ENDPOINT) {
    candidates.push(PRIMARY_STORIES_ENDPOINT);
  }

  if (!candidates.includes(LOCAL_STORIES_ENDPOINT)) {
    candidates.push(LOCAL_STORIES_ENDPOINT);
  }

  return candidates;
}

function withNoCacheQuery(endpoint) {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}ts=${Date.now()}`;
}

async function requestStoriesApi(method, options = {}) {
  const { body = null, noCache = false } = options;
  const endpoints = getStoriesEndpointCandidates();
  let lastError = null;

  for (const endpoint of endpoints) {
    const url = noCache ? withNoCacheQuery(endpoint) : endpoint;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(noCache ? { cache: 'no-store' } : {}),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (response.ok) {
        return { response, endpoint };
      }

      lastError = new Error(`Stories API ${method} failed on ${endpoint} with status ${response.status}.`);
      console.warn(lastError.message);
    } catch (error) {
      lastError = error;
      console.warn(`Stories API ${method} failed on ${endpoint}:`, error);
    }
  }

  throw lastError || new Error(`Stories API ${method} failed on all endpoints.`);
}

async function fetchStoriesFromStaticFile() {
  try {
    const response = await fetch(withNoCacheQuery(STATIC_STORIES_URL), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return Array.isArray(data?.stories) ? data.stories : null;
  } catch (error) {
    console.warn('Static stories fetch failed:', error);
    return null;
  }
}

function getDeletedStoryIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORIES_DELETED_KEY));
    if (!Array.isArray(parsed)) return [];

    return Array.from(new Set(
      parsed
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ));
  } catch {
    return [];
  }
}

function setDeletedStoryIds(ids) {
  try {
    const normalized = Array.from(new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ));

    if (normalized.length === 0) {
      localStorage.removeItem(STORIES_DELETED_KEY);
      return;
    }

    localStorage.setItem(STORIES_DELETED_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('Failed to persist deleted story IDs:', error);
  }
}

function addDeletedStoryId(storyId) {
  const nextIds = getDeletedStoryIds();
  nextIds.push(storyId);
  setDeletedStoryIds(nextIds);
}

function clearDeletedStoryIds(storyIds) {
  if (!Array.isArray(storyIds) || storyIds.length === 0) return;

  const removeSet = new Set(storyIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (removeSet.size === 0) return;

  const nextIds = getDeletedStoryIds().filter((id) => !removeSet.has(id));
  setDeletedStoryIds(nextIds);
}

function filterDeletedStories(stories) {
  const deletedStoryIds = getDeletedStoryIds();
  if (deletedStoryIds.length === 0) {
    return stories;
  }

  const deletedSet = new Set(deletedStoryIds);
  return stories.filter((story) => !deletedSet.has(story?.id));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function scheduleStoriesCloudSync(options = {}) {
  if (READ_ONLY_MODE) {
    return;
  }

  if (options.force) {
    forceFullStoriesSync = true;
  }

  if (storiesSyncTimer) {
    clearTimeout(storiesSyncTimer);
  }

  storiesSyncTimer = setTimeout(() => {
    syncStoriesToCloud();
  }, STORIES_SYNC_DEBOUNCE_MS);
}

async function syncStoriesToCloud(options = {}) {
  if (READ_ONLY_MODE || isStoreInitializing) return { ok: true, skipped: true };

  const shouldForceSync = Boolean(options.force) || forceFullStoriesSync;
  forceFullStoriesSync = false;

  try {
    const stories = getItem(STORIES_KEY);
    const deletedStoryIds = getDeletedStoryIds();
    const lastSyncAt = getLastStoriesSyncAt();
    const storiesToSync = shouldForceSync
      ? stories
      : stories.filter((story) => getTimeValue(story?.updatedAt || story?.createdAt) > lastSyncAt);

    if (storiesToSync.length === 0 && deletedStoryIds.length === 0) {
      return { ok: true, skipped: true };
    }

    const { response } = await requestStoriesApi('POST', {
      body: { stories: storiesToSync, deletedStoryIds },
    });

    let payload = null;

    try {
      payload = await response.json();
      if (Array.isArray(payload?.clearedDeletedStoryIds) && payload.clearedDeletedStoryIds.length > 0) {
        clearDeletedStoryIds(payload.clearedDeletedStoryIds);
      }
    } catch {
      // Ignore non-JSON success payloads.
    }

    setLastStoriesSyncAt(Date.now());
    return { ok: true, skipped: false, payload };
  } catch (error) {
    console.warn('Story sync to cloud failed:', error);
    if (shouldForceSync) {
      forceFullStoriesSync = true;
    }
    return { ok: false, skipped: false, error };
  }
}

async function fetchStoriesFromCloud() {
  if (READ_ONLY_MODE) {
    return fetchStoriesFromStaticFile();
  }

  try {
    const { response } = await requestStoriesApi('GET', { noCache: true });

    const data = await response.json();
    return Array.isArray(data?.stories) ? data.stories : null;
  } catch (error) {
    console.warn('Story fetch from cloud failed:', error);
    return null;
  }
}

function getTimeValue(value) {
  const timestamp = Date.parse(value || '');
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getChapterKey(chapter, fallbackIndex) {
  const chapterNumber = Number(chapter?.number);
  if (Number.isFinite(chapterNumber)) {
    return `num:${chapterNumber}`;
  }

  if (chapter?.id) {
    return `id:${chapter.id}`;
  }

  return `fallback:${fallbackIndex}`;
}

function mergeChapters(localChapters = [], cloudChapters = []) {
  const mergedByKey = new Map();
  const allChapters = [...cloudChapters, ...localChapters];

  allChapters.forEach((chapter, index) => {
    const key = getChapterKey(chapter, index);
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, chapter);
      return;
    }

    const existingTime = getTimeValue(existing.updatedAt || existing.createdAt);
    const nextTime = getTimeValue(chapter.updatedAt || chapter.createdAt);
    mergedByKey.set(key, nextTime >= existingTime ? chapter : existing);
  });

  return Array.from(mergedByKey.values()).sort((a, b) => {
    const aNum = Number(a?.number);
    const bNum = Number(b?.number);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return aNum - bNum;
    }

    const aTime = getTimeValue(a?.createdAt);
    const bTime = getTimeValue(b?.createdAt);
    return aTime - bTime;
  });
}

function mergeStoryRecord(existingStory, incomingStory) {
  const existingTime = getTimeValue(existingStory.updatedAt || existingStory.createdAt);
  const incomingTime = getTimeValue(incomingStory.updatedAt || incomingStory.createdAt);

  const newer = incomingTime >= existingTime ? incomingStory : existingStory;
  const older = newer === existingStory ? incomingStory : existingStory;

  const createdAt = older.createdAt || newer.createdAt || new Date().toISOString();
  const mergedUpdatedAt = new Date(Math.max(existingTime, incomingTime, getTimeValue(createdAt)) || Date.now()).toISOString();

  return {
    ...older,
    ...newer,
    chapters: mergeChapters(existingStory.chapters || [], incomingStory.chapters || []),
    createdAt,
    updatedAt: mergedUpdatedAt,
  };
}

function mergeStories(localStories = [], cloudStories = []) {
  const mergedById = new Map();
  const allStories = [...cloudStories, ...localStories];

  allStories.forEach((story, index) => {
    const key = story?.id || `legacy-${index}`;
    const existing = mergedById.get(key);
    if (!existing) {
      mergedById.set(key, story);
      return;
    }

    mergedById.set(key, mergeStoryRecord(existing, story));
  });

  return Array.from(mergedById.values()).sort((a, b) => {
    const aTime = getTimeValue(a.updatedAt || a.createdAt);
    const bTime = getTimeValue(b.updatedAt || b.createdAt);
    return bTime - aTime;
  });
}

export async function refreshStoriesFromCloud(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && !activeStoriesRefreshPromise && now - lastStoriesRefreshAt < STORIES_REFRESH_MIN_INTERVAL_MS) {
    return false;
  }

  if (activeStoriesRefreshPromise) {
    return activeStoriesRefreshPromise;
  }

  lastStoriesRefreshAt = now;

  activeStoriesRefreshPromise = (async () => {
  const cloudStories = await fetchStoriesFromCloud();
  if (!Array.isArray(cloudStories)) {
    return false;
  }

  const localStories = getItem(STORIES_KEY);
  const mergedStories = filterDeletedStories(mergeStories(localStories, cloudStories));

  const localSerialized = JSON.stringify(localStories);
  const mergedSerialized = JSON.stringify(mergedStories);
  if (localSerialized === mergedSerialized) {
    storiesMemoryCache = mergedStories;
    return false;
  }

  storiesMemoryCache = mergedStories;
  try {
    localStorage.setItem(STORIES_KEY, mergedSerialized);
    localStorage.setItem('storyverse_seeded', 'true');
  } catch (error) {
    console.warn('Failed to persist cloud-refreshed stories locally:', error);
  }
  return true;
  })();

  try {
    return await activeStoriesRefreshPromise;
  } finally {
    activeStoriesRefreshPromise = null;
  }
}

export async function syncStoriesNow(options = {}) {
  if (READ_ONLY_MODE) {
    return { ok: true, skipped: true };
  }

  if (storiesSyncTimer) {
    clearTimeout(storiesSyncTimer);
    storiesSyncTimer = null;
  }

  const result = await syncStoriesToCloud({ force: options.force });
  if (!result?.ok && !result?.skipped) {
    throw result.error || new Error('Story sync failed.');
  }

  if (options.verifyStoryId) {
    const cloudStories = await fetchStoriesFromCloud();
    if (!Array.isArray(cloudStories)) {
      throw new Error('Could not verify saved story in cloud data.');
    }

    const savedStory = cloudStories.find((story) => story.id === options.verifyStoryId);
    if (!savedStory) {
      throw new Error('Saved story was not found in the database.');
    }

    if (options.verifyChapterNumber !== undefined && options.verifyChapterNumber !== null) {
      const chapterNumber = Number(options.verifyChapterNumber);
      const chapterExists = savedStory.chapters?.some(
        (chapter) => Number(chapter?.number) === chapterNumber,
      );

      if (!chapterExists) {
        throw new Error(`Chapter ${chapterNumber} was not found in the database after upload.`);
      }
    }

    await refreshStoriesFromCloud({ force: true });
  }

  return result;
}

export async function initializeStoreData() {
  if (READ_ONLY_MODE) {
    const staticStories = await fetchStoriesFromStaticFile();
    if (Array.isArray(staticStories)) {
      setItem(STORIES_KEY, staticStories);
      try {
        localStorage.setItem('storyverse_seeded', 'true');
      } catch {
        // Ignore persistence failures in read-only mode.
      }
      return;
    }

    const existingStories = getItem(STORIES_KEY);
    if (existingStories.length > 0) {
      storiesMemoryCache = existingStories;
    }
    return;
  }

  let shouldSyncAfterInit = getDeletedStoryIds().length > 0;
  let shouldForceSyncAfterInit = shouldSyncAfterInit;
  isStoreInitializing = true;

  try {
    const cloudStories = await fetchStoriesFromCloud();
    const localStories = getItem(STORIES_KEY);
    const hasLocalStories = localStories.length > 0;

    if (Array.isArray(cloudStories)) {
      const hasCloudStories = cloudStories.length > 0;

      if (hasCloudStories && hasLocalStories) {
        const mergedStories = filterDeletedStories(mergeStories(localStories, cloudStories));
        setItem(STORIES_KEY, mergedStories);
        localStorage.setItem('storyverse_seeded', 'true');
        shouldSyncAfterInit = true;
        return;
      }

      if (hasCloudStories) {
        setItem(STORIES_KEY, filterDeletedStories(cloudStories));
        localStorage.setItem('storyverse_seeded', 'true');
        return;
      }

      if (hasLocalStories) {
        shouldSyncAfterInit = true;
        shouldForceSyncAfterInit = true;
        return;
      }

      if (!localStorage.getItem('storyverse_seeded')) {
        seedDemoData();
        shouldSyncAfterInit = true;
        shouldForceSyncAfterInit = true;
      }

      return;
    }

    if (hasLocalStories) return;

    if (!localStorage.getItem('storyverse_seeded')) {
      seedDemoData();
      shouldSyncAfterInit = true;
      shouldForceSyncAfterInit = true;
    }
  } finally {
    isStoreInitializing = false;

    if (shouldSyncAfterInit) {
      scheduleStoriesCloudSync({ force: shouldForceSyncAfterInit });
    }
  }
}

// --- Stories ---
export function getAllStories() {
  return filterDeletedStories(getItem(STORIES_KEY));
}

export function getStory(id) {
  return getAllStories().find(s => s.id === id) || null;
}

export function createStory({ title, description, genre, coverImage }) {
  if (READ_ONLY_MODE) {
    throw new Error(READ_ONLY_ERROR_MESSAGE);
  }

  const stories = getAllStories();
  const story = {
    id: generateId(),
    title,
    description,
    genre,
    coverImage: coverImage || null,
    chapters: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  stories.unshift(story);
  forceFullStoriesSync = true;
  setItem(STORIES_KEY, stories);
  return story;
}

export function updateStory(id, updates) {
  if (READ_ONLY_MODE) {
    throw new Error(READ_ONLY_ERROR_MESSAGE);
  }

  const stories = getAllStories();
  const index = stories.findIndex(s => s.id === id);
  if (index !== -1) {
    stories[index] = { ...stories[index], ...updates, updatedAt: new Date().toISOString() };
    forceFullStoriesSync = true;
    setItem(STORIES_KEY, stories);
    return stories[index];
  }
  return null;
}

export function deleteStory(id) {
  if (READ_ONLY_MODE) {
    throw new Error(READ_ONLY_ERROR_MESSAGE);
  }

  addDeletedStoryId(id);
  const stories = getAllStories().filter(s => s.id !== id);
  forceFullStoriesSync = true;
  setItem(STORIES_KEY, stories);
}

// --- Chapters ---
function hasChapterNumber(story, chapterNumber, excludeChapterId = null) {
  return story.chapters.some(ch => ch.number === chapterNumber && ch.id !== excludeChapterId);
}

export function addChapter(storyId, { title, number, contentType, content, images }) {
  if (READ_ONLY_MODE) {
    throw new Error(READ_ONLY_ERROR_MESSAGE);
  }

  const stories = getAllStories();
  const story = stories.find(s => s.id === storyId);
  if (!story) return null;

  const chapterNumber = parseInt(number, 10);
  if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
    throw new Error('Chapter number must be a positive number.');
  }
  if (hasChapterNumber(story, chapterNumber)) {
    throw new Error(`Chapter ${chapterNumber} already exists in this story.`);
  }

  const chapter = {
    id: generateId(),
    title,
    number: chapterNumber,
    contentType, // 'text' or 'images'
    content: content || '',
    images: images || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  story.chapters.push(chapter);
  story.chapters.sort((a, b) => a.number - b.number);
  story.updatedAt = new Date().toISOString();
  forceFullStoriesSync = true;
  setItem(STORIES_KEY, stories);

  // Trigger notification
  addNotification({
    type: 'new_chapter',
    storyId: story.id,
    storyTitle: story.title,
    chapterTitle: chapter.title,
    chapterNumber: chapter.number,
  });

  return chapter;
}

export function getChapter(storyId, chapterNum) {
  const story = getStory(storyId);
  if (!story) return null;
  return story.chapters.find(c => c.number === parseInt(chapterNum)) || null;
}

export function getChapterById(storyId, chapterId) {
  const story = getStory(storyId);
  if (!story) return null;
  return story.chapters.find(c => c.id === chapterId) || null;
}

export function updateChapter(storyId, chapterId, updates) {
  if (READ_ONLY_MODE) {
    throw new Error(READ_ONLY_ERROR_MESSAGE);
  }

  const stories = getAllStories();
  const story = stories.find(s => s.id === storyId);
  if (!story) return null;

  const chapterIndex = story.chapters.findIndex(c => c.id === chapterId);
  if (chapterIndex === -1) return null;

  const current = story.chapters[chapterIndex];
  const nextNumber = updates.number !== undefined ? parseInt(updates.number, 10) : current.number;
  if (!Number.isFinite(nextNumber) || nextNumber < 1) {
    throw new Error('Chapter number must be a positive number.');
  }
  if (hasChapterNumber(story, nextNumber, chapterId)) {
    throw new Error(`Chapter ${nextNumber} already exists in this story.`);
  }

  const nextChapter = {
    ...current,
    ...updates,
    number: nextNumber,
    content: updates.content !== undefined ? updates.content : current.content,
    images: updates.images !== undefined ? updates.images : current.images,
    updatedAt: new Date().toISOString(),
  };

  story.chapters[chapterIndex] = nextChapter;
  story.chapters.sort((a, b) => a.number - b.number);
  story.updatedAt = new Date().toISOString();
  forceFullStoriesSync = true;
  setItem(STORIES_KEY, stories);
  return nextChapter;
}

export function deleteChapter(storyId, chapterId) {
  if (READ_ONLY_MODE) {
    throw new Error(READ_ONLY_ERROR_MESSAGE);
  }

  const stories = getAllStories();
  const story = stories.find(s => s.id === storyId);
  if (story) {
    story.chapters = story.chapters.filter(c => c.id !== chapterId);
    story.updatedAt = new Date().toISOString();
    forceFullStoriesSync = true;
    setItem(STORIES_KEY, stories);
  }
}

// --- Notifications ---
export function getAllNotifications() {
  return getItem(NOTIFICATIONS_KEY);
}

export function getUnreadCount() {
  return getAllNotifications().filter(n => !n.read).length;
}

export function addNotification({ type, storyId, storyTitle, chapterTitle, chapterNumber, title, message, url, icon }) {
  const notifications = getAllNotifications();
  const notificationTitle = title || (type === 'announcement'
    ? 'StoryVerse Announcement'
    : 'New Chapter Released!');
  const notificationMessage = message || (type === 'announcement'
    ? 'You have a new announcement.'
    : `Chapter ${chapterNumber}: "${chapterTitle}" added to ${storyTitle}`);

  const notification = {
    id: generateId(),
    type,
    storyId: storyId || null,
    storyTitle: storyTitle || '',
    chapterTitle: chapterTitle || '',
    chapterNumber: chapterNumber || null,
    title: notificationTitle,
    message: notificationMessage,
    url: url || (storyId && chapterNumber ? `#/story/${storyId}/chapter/${chapterNumber}` : '#/notifications'),
    icon: icon || (type === 'announcement' ? '📣' : '📖'),
    read: false,
    createdAt: new Date().toISOString(),
  };
  notifications.unshift(notification);
  setItem(NOTIFICATIONS_KEY, notifications);

  // Dispatch custom event for live UI updates
  window.dispatchEvent(new CustomEvent('storyverse:notification', { detail: notification }));
  return notification;
}

export function markNotificationRead(id) {
  const notifications = getAllNotifications();
  const n = notifications.find(x => x.id === id);
  if (n) n.read = true;
  setItem(NOTIFICATIONS_KEY, notifications);
  window.dispatchEvent(new Event('storyverse:notification-update'));
}

export function markAllRead() {
  const notifications = getAllNotifications().map(n => ({ ...n, read: true }));
  setItem(NOTIFICATIONS_KEY, notifications);
  window.dispatchEvent(new Event('storyverse:notification-update'));
}

export function clearAllNotifications() {
  setItem(NOTIFICATIONS_KEY, []);
  window.dispatchEvent(new Event('storyverse:notification-update'));
}

// --- Seed Demo Data ---
export function seedDemoData() {
  if (localStorage.getItem('storyverse_seeded')) return;

  const story1 = createStory({
    title: 'The Last Algorithm',
    description: 'In a world where AI has surpassed human intelligence, one programmer discovers an ancient algorithm that could change everything. A gripping sci-fi thriller about the thin line between creation and destruction.',
    genre: 'Sci-Fi',
    coverImage: null,
  });

  addChapterSilent(story1.id, {
    title: 'The Discovery',
    number: 1,
    contentType: 'text',
    content: `The monitor's blue light cast sharp shadows across Maya's face as she scrolled through lines of code she'd never seen before. Not in thirty years of programming. Not in any textbook, any forum, any leaked corporate repository.\n\nThis was something else entirely.\n\n"What are you?" she whispered, leaning closer. The algorithm was elegant—no, that wasn't the right word. It was beautiful in the way a hurricane is beautiful. Powerful, vast, and terrifying in its implications.\n\nShe'd found it buried in the legacy systems of NovaTech, hidden inside a routine cleanup script that hadn't been touched since 2031. Someone had put it there deliberately, wrapped in layers of obfuscation that would make most engineers give up after the first pass.\n\nMaya wasn't most engineers.\n\nHer coffee had gone cold hours ago. The office around her was dark and empty—everyone else had gone home at six, like normal people with normal lives. But Maya had followed a hunch, a tiny anomaly in the system logs that most would have dismissed.\n\nNow, at 2:47 AM, she understood why someone had hidden this so carefully.\n\nThe algorithm didn't just process data. It *understood* it. Not in the way current AI models pretended to understand, with their statistical approximations and pattern matching. This was genuine comprehension, encoded in mathematical structures she'd never encountered.\n\n"This changes everything," she said to the empty room. And for the first time in years, she felt afraid.`,
  });

  addChapterSilent(story1.id, {
    title: 'Old Friends',
    number: 2,
    contentType: 'text',
    content: `The call came at 6 AM, three hours after Maya had finally forced herself to leave the office. She hadn't slept.\n\n"Maya Chen?" The voice was familiar but she couldn't place it. "It's been a long time."\n\n"Who is this?"\n\n"James Okafor. We worked together at DeepFrame, back in '28." Silence. Then: "I know what you found last night."\n\nMaya sat up in bed, fully awake now. "How could you possibly—"\n\n"Not on the phone. Meet me at The Green Door, the café on 5th. You remember it?"\n\nShe did. They'd spent countless hours there during the DeepFrame years, fueled by espresso and ambition, convinced they were going to build the first true artificial general intelligence. They hadn't, of course. Nobody had. The problem was always the same: you could make AI that was fast, that was accurate, that could mimic understanding—but genuine comprehension remained out of reach.\n\nUntil now, maybe.\n\nJames was already there when she arrived, sitting in the back corner. He'd aged well—silver at his temples, laugh lines that suggested a happier life than hers, but the same sharp eyes. In front of him sat two coffees.\n\n"You had it analyzed?" he asked without preamble.\n\n"I was up all night reading through it. James, it's—"\n\n"I know what it is. I helped write it."\n\nThe café seemed to go quiet around them, though nothing had actually changed. Maya stared at him.\n\n"That's impossible. The mathematical framework alone—it would take decades of work. And the approach, it's nothing like anything published—"\n\n"That's because we never published it." He wrapped both hands around his coffee. "There were seven of us. A side project within DeepFrame, completely off the books. We called it Project Ouroboros."`,
  });

  const story2 = createStory({
    title: 'Moonlit Petals',
    description: 'A young herbalist in feudal Japan discovers she can communicate with spirits through her garden. When darkness threatens her village, she must choose between her peaceful life and her hidden power.',
    genre: 'Fantasy',
    coverImage: null,
  });

  addChapterSilent(story2.id, {
    title: 'The Garden Between Worlds',
    number: 1,
    contentType: 'text',
    content: `Every morning, before the sun brushed the tips of the bamboo grove, Hana walked barefoot through her garden.\n\nNot the garden the villagers knew—the one with its neat rows of medicinal herbs, the carefully tended beds of chrysanthemum and peony that made her modest healing practice possible. No, Hana walked through the *other* garden. The one that existed in the space between starlight and shadow, between the last exhale of night and the first breath of dawn.\n\nIn this garden, the flowers whispered.\n\n"Good morning, little healer," murmured the moonflowers, their petals still luminous with borrowed light. "The spirits are restless today."\n\nHana knelt and pressed her palm to the cool earth. She could feel it too—a tremor beneath the surface, subtle as a held breath. Something was changing.\n\n"What troubles them?" she asked.\n\nBut the moonflowers had already closed, retreating into their daylight silence as the first golden ray broke over the eastern hills. The between-time was over.\n\nHana stood, brushed the soil from her knees, and became once again the village herbalist—quiet, capable, unremarkable. Exactly as she preferred.\n\nThe walk from her cottage to the village was short but beautiful, following a path along the river where wild irises grew in purple profusion. Hana gathered a handful as she went, already cataloging the day's tasks. Old Takeda needed more willow bark tea for his joints. The Sato family's youngest had a cough that wanted honey and ginger. And she needed to harvest the foxglove before—\n\n"Hana-san!" \n\nShe looked up. Young Kenji was running toward her, his face flushed with the kind of excitement that was rarely good news in a village this small.\n\n"There's a stranger at the inn," he panted. "A monk. But Hana-san—his eyes are completely white."`,
  });

  const story3 = createStory({
    title: 'Concrete Hearts',
    description: 'Two strangers keep finding each other in a sprawling megacity—on subway platforms, in crowded markets, at 3 AM noodle shops. A modern love story told in fragments and chance encounters.',
    genre: 'Romance',
    coverImage: null,
  });

  addChapterSilent(story3.id, {
    title: 'Platform 9, Southbound',
    number: 1,
    contentType: 'text',
    content: `The first time Lena noticed him, he was reading a paperback on the southbound platform at Shibuya Station.\n\nThis alone was enough to make him unusual. Nobody read paper books anymore—not in public, not in the crush of Tokyo's morning rush. But there he stood, perfectly calm in the current of commuters, a battered copy of something she couldn't quite read held in long fingers. \n\nShe noticed him because she was late and rushing and nearly collided with him, catching herself at the last moment with a breathless "sumimasen." He looked up. Dark eyes, an almost-smile, a brief nod, and then the crowd swept her onto the train and away.\n\nShe forgot about him for exactly eleven days.\n\nThe second time, she was in Tsukiji Outer Market on a Saturday, buying yuzu for a recipe she'd never end up making. He was at the next stall, carefully selecting dried bonito flakes with the seriousness of a surgeon choosing instruments. Same book tucked under his arm—she could see the cover now. García Márquez, *One Hundred Years of Solitude*. \n\n"You again," she almost said, but didn't because that would be strange. You don't acknowledge strangers in Tokyo. You flow around them.\n\nBut she wondered.\n\nThe third time was at 2:47 AM at a tiny ramen shop under the Yamanote Line tracks, a place she went when insomnia won and her apartment felt too empty. There were only six stools at the counter, and he was on the second from the left, eating shoyu ramen with quiet concentration, the paperback—nearly finished now—propped against the soy sauce bottle.\n\nHe looked up. Recognition crossed his face. That almost-smile again.\n\n"You know," he said, in accented but careful Japanese, "at this point it would be stranger not to say hello."`,
  });

  localStorage.setItem('storyverse_seeded', 'true');
}

// Silent version that doesn't trigger notifications (for demo seeding)
function addChapterSilent(storyId, { title, number, contentType, content, images }) {
  const stories = getAllStories();
  const story = stories.find(s => s.id === storyId);
  if (!story) return;

  const chapter = {
    id: generateId(),
    title,
    number: parseInt(number),
    contentType,
    content: content || '',
    images: images || [],
    createdAt: new Date().toISOString(),
  };

  story.chapters.push(chapter);
  story.chapters.sort((a, b) => a.number - b.number);
  story.updatedAt = new Date().toISOString();
  setItem(STORIES_KEY, stories);
}
