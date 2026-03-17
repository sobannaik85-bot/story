import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_PATH = BASE_DIR / "data" / "stories-static.json"
DATA_PATH = Path(os.getenv("STORIES_DATA_PATH", str(DEFAULT_DATA_PATH))).expanduser()


def _load_stories_data() -> dict[str, Any]:
    if not DATA_PATH.exists():
        return {"stories": []}

    try:
        with DATA_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid stories JSON: {exc}") from exc

    stories = payload.get("stories", []) if isinstance(payload, dict) else []
    if not isinstance(stories, list):
        stories = []

    return {
        "stories": stories,
        "updatedAt": payload.get("updatedAt") if isinstance(payload, dict) else None,
    }


def _find_story(stories: list[dict[str, Any]], story_id: str) -> dict[str, Any] | None:
    return next((story for story in stories if str(story.get("id")) == story_id), None)


def _find_chapter(story: dict[str, Any], chapter_number: int) -> dict[str, Any] | None:
    chapters = story.get("chapters", [])
    if not isinstance(chapters, list):
        return None

    for chapter in chapters:
        try:
            value = int(chapter.get("number", -1))
        except (TypeError, ValueError):
            continue

        if value == chapter_number:
            return chapter

    return None


app = FastAPI(
    title="Storyverse Backend",
    version="1.0.0",
    description="Separated backend API for Storyverse stories and chapters.",
)

cors_origins_raw = os.getenv("CORS_ORIGINS", "*").strip()
if cors_origins_raw == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "storyverse-backend",
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    stories = _load_stories_data().get("stories", [])
    return {
        "status": "ok",
        "storiesCount": len(stories),
    }


@app.get("/stories")
def list_stories() -> dict[str, Any]:
    payload = _load_stories_data()
    stories = payload.get("stories", [])

    return {
        "stories": stories,
        "count": len(stories),
        "updatedAt": payload.get("updatedAt"),
    }


@app.get("/stories/{story_id}")
def get_story(story_id: str) -> dict[str, Any]:
    stories = _load_stories_data().get("stories", [])
    story = _find_story(stories, story_id)

    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    return story


@app.get("/stories/{story_id}/chapters/{chapter_number}")
def get_chapter(story_id: str, chapter_number: int) -> dict[str, Any]:
    if chapter_number < 1:
        raise HTTPException(status_code=400, detail="chapter_number must be >= 1")

    stories = _load_stories_data().get("stories", [])
    story = _find_story(stories, story_id)

    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    chapter = _find_chapter(story, chapter_number)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    return chapter
