CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stories_updated_at ON stories(updated_at DESC);
