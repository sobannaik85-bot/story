import { getStore } from '@netlify/blobs';

const STORE_NAME = 'storyverse-content';
const SNAPSHOT_KEY = 'stories';
const STORY_KEY_PREFIX = 'stories/';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getTimeValue(value) {
  const timestamp = Date.parse(value || '');
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeStories(stories) {
  return Array.isArray(stories) ? stories.filter(Boolean) : [];
}

function normalizeDeletedStoryIds(ids) {
  if (!Array.isArray(ids)) return [];

  return Array.from(new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ));
}

function normalizeStory(story, fallbackIndex = 0) {
  if (!story || typeof story !== 'object') return null;

  const now = new Date().toISOString();
  const id = String(story.id || `legacy-${fallbackIndex}`);
  const createdAt = story.createdAt || story.updatedAt || now;
  const updatedAt = story.updatedAt || createdAt;

  return {
    ...story,
    id,
    chapters: Array.isArray(story.chapters) ? story.chapters : [],
    createdAt,
    updatedAt,
  };
}

function sortStoriesByUpdatedAt(stories) {
  return [...stories].sort((a, b) => {
    const aTime = getTimeValue(a?.updatedAt || a?.createdAt);
    const bTime = getTimeValue(b?.updatedAt || b?.createdAt);
    return bTime - aTime;
  });
}

function pickNewestStory(firstStory, secondStory) {
  const firstTime = getTimeValue(firstStory?.updatedAt || firstStory?.createdAt);
  const secondTime = getTimeValue(secondStory?.updatedAt || secondStory?.createdAt);

  if (secondTime > firstTime) return secondStory;
  if (firstTime > secondTime) return firstStory;

  // If timestamps match, keep the one with more chapter data.
  const firstChapterCount = Array.isArray(firstStory?.chapters) ? firstStory.chapters.length : 0;
  const secondChapterCount = Array.isArray(secondStory?.chapters) ? secondStory.chapters.length : 0;
  return secondChapterCount >= firstChapterCount ? secondStory : firstStory;
}

function mergeStories(existingStories = [], incomingStories = []) {
  const storyMap = new Map();

  existingStories.forEach((story, index) => {
    const normalized = normalizeStory(story, index);
    if (!normalized) return;
    storyMap.set(normalized.id, normalized);
  });

  incomingStories.forEach((story, index) => {
    const normalized = normalizeStory(story, index);
    if (!normalized) return;

    const current = storyMap.get(normalized.id);
    if (!current) {
      storyMap.set(normalized.id, normalized);
      return;
    }

    storyMap.set(normalized.id, pickNewestStory(current, normalized));
  });

  return sortStoriesByUpdatedAt(Array.from(storyMap.values()));
}

async function readRecordStories(store) {
  const { blobs = [] } = await store.list({ prefix: STORY_KEY_PREFIX, consistency: 'strong' });
  if (blobs.length === 0) return [];

  const records = await Promise.all(
    blobs.map(async (blob, index) => {
      const story = await store.get(blob.key, { type: 'json', consistency: 'strong' });
      return normalizeStory(story, index);
    }),
  );

  return sortStoriesByUpdatedAt(records.filter(Boolean));
}

async function persistSnapshotStories(store, stories) {
  const updatedAt = new Date().toISOString();
  await store.setJSON(SNAPSHOT_KEY, {
    stories,
    updatedAt,
    source: 'snapshot-db-v2',
  });

  return updatedAt;
}

async function loadStoriesFromDatabase(store) {
  const snapshot = await store.get(SNAPSHOT_KEY, { type: 'json', consistency: 'strong' });
  if (snapshot && (Array.isArray(snapshot.stories) || snapshot.updatedAt)) {
    const normalizedStories = normalizeStories(snapshot.stories)
      .map((story, index) => normalizeStory(story, index))
      .filter(Boolean);

    return {
      stories: sortStoriesByUpdatedAt(normalizedStories),
      updatedAt: snapshot.updatedAt || null,
      source: snapshot.source || 'snapshot-db-v2',
    };
  }

  // One-time fallback: if older record-based blobs exist, collapse them into single snapshot.
  const migratedStories = await readRecordStories(store);
  if (migratedStories.length === 0) {
    return {
      stories: [],
      updatedAt: null,
      source: 'snapshot-db-v2',
    };
  }

  const updatedAt = await persistSnapshotStories(store, migratedStories);
  return {
    stories: migratedStories,
    updatedAt,
    source: 'migrated-from-record-db',
  };
}

function applyDeletedStories(stories, deletedStoryIds) {
  if (deletedStoryIds.length === 0) {
    return stories;
  }

  const deletedSet = new Set(deletedStoryIds);
  return stories.filter((story) => !deletedSet.has(story.id));
}

export default async function handler(request) {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (request.method === 'GET') {
    const snapshot = await loadStoriesFromDatabase(store);

    return json({
      stories: snapshot.stories,
      updatedAt: snapshot.updatedAt,
      storage: 'snapshot-db',
      source: snapshot.source,
    });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON payload.' }, 400);
    }

    const incomingStories = normalizeStories(body?.stories)
      .map((story, index) => normalizeStory(story, index))
      .filter(Boolean);

    const deletedStoryIds = normalizeDeletedStoryIds(body?.deletedStoryIds);

    const snapshot = await loadStoriesFromDatabase(store);
    const mergedStories = applyDeletedStories(
      mergeStories(snapshot.stories, incomingStories),
      deletedStoryIds,
    );

    const updatedAt = await persistSnapshotStories(store, mergedStories);

    return json({
      ok: true,
      storiesCount: mergedStories.length,
      storage: 'snapshot-db',
      updatedAt,
      clearedDeletedStoryIds: deletedStoryIds,
    });
  }

  return json({ error: 'Method not allowed.' }, 405);
}
