function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
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

function applyDeletedStories(stories, deletedStoryIds) {
  if (!deletedStoryIds.length) {
    return stories;
  }

  const deletedSet = new Set(deletedStoryIds);
  return stories.filter((story) => !deletedSet.has(story.id));
}

async function loadStories(db) {
  const result = await db
    .prepare('SELECT payload FROM stories ORDER BY updated_at DESC')
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];
  const stories = rows
    .map((row, index) => {
      try {
        return normalizeStory(JSON.parse(row.payload), index);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return sortStoriesByUpdatedAt(stories);
}

async function saveStories(db, stories, deletedStoryIds) {
  const statements = [];

  for (const story of stories) {
    const updatedAtMs = getTimeValue(story.updatedAt || story.createdAt || new Date().toISOString());
    statements.push(
      db.prepare(
        `INSERT INTO stories (id, payload, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
      ).bind(story.id, JSON.stringify(story), updatedAtMs),
    );
  }

  for (const storyId of deletedStoryIds) {
    statements.push(db.prepare('DELETE FROM stories WHERE id = ?1').bind(storyId));
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

function getLatestUpdatedAt(stories) {
  if (stories.length === 0) return null;

  const latestStory = stories.reduce((latest, current) => {
    const latestTime = getTimeValue(latest?.updatedAt || latest?.createdAt);
    const currentTime = getTimeValue(current?.updatedAt || current?.createdAt);
    return currentTime > latestTime ? current : latest;
  }, stories[0]);

  return latestStory.updatedAt || latestStory.createdAt || null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (!['/', '/stories-data'].includes(url.pathname)) {
      return json({ error: 'Not found.' }, 404);
    }

    if (!env.DB) {
      return json({ error: 'D1 binding DB is not configured.' }, 500);
    }

    if (request.method === 'GET') {
      const stories = await loadStories(env.DB);
      return json({
        stories,
        updatedAt: getLatestUpdatedAt(stories),
        storage: 'cloudflare-d1',
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

      const currentStories = await loadStories(env.DB);
      const mergedStories = applyDeletedStories(
        mergeStories(currentStories, incomingStories),
        deletedStoryIds,
      );

      await saveStories(env.DB, mergedStories, deletedStoryIds);

      return json({
        ok: true,
        storiesCount: mergedStories.length,
        storage: 'cloudflare-d1',
        updatedAt: getLatestUpdatedAt(mergedStories),
        clearedDeletedStoryIds: deletedStoryIds,
      });
    }

    return json({ error: 'Method not allowed.' }, 405);
  },
};
