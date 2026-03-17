import json
import os
from pathlib import Path
from typing import Any

import requests
import streamlit as st


st.set_page_config(
    page_title="Storyverse Reader",
    page_icon="book",
    layout="wide",
)

BASE_DIR = Path(__file__).resolve().parent
LOCAL_STORIES_PATH = Path(
    st.secrets.get("LOCAL_STORIES_PATH", os.getenv("LOCAL_STORIES_PATH", str(BASE_DIR / "stories-static.json")))
).expanduser()
API_BASE_URL = st.secrets.get("API_BASE_URL", os.getenv("API_BASE_URL", "")).rstrip("/")
REQUEST_TIMEOUT_SECONDS = 30


def chapter_sort_key(chapter: dict[str, Any]) -> tuple[int, int]:
    raw_number = chapter.get("number")
    try:
        chapter_number = int(raw_number)
    except (TypeError, ValueError):
        chapter_number = 10**9

    created_at = chapter.get("createdAt") or ""
    return chapter_number, hash(created_at)


@st.cache_data(ttl=30)
def fetch_stories_from_api() -> list[dict[str, Any]]:
    if not API_BASE_URL:
        return []

    response = requests.get(
        f"{API_BASE_URL}/stories",
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={"Accept": "application/json"},
    )
    response.raise_for_status()

    payload = response.json()
    stories = payload.get("stories", []) if isinstance(payload, dict) else []
    if not isinstance(stories, list):
        return []

    return stories


@st.cache_data(ttl=30)
def fetch_stories_from_local_file() -> list[dict[str, Any]]:
    if not LOCAL_STORIES_PATH.exists():
        return []

    try:
        with LOCAL_STORIES_PATH.open("r", encoding="utf-8") as file_obj:
            payload = json.load(file_obj)
    except (OSError, json.JSONDecodeError):
        return []

    stories = payload.get("stories", []) if isinstance(payload, dict) else []
    if not isinstance(stories, list):
        return []

    return stories


@st.cache_data(ttl=30)
def fetch_stories_from_github() -> list[dict[str, Any]]:
    """Fallback: fetch stories from GitHub raw URL."""
    github_raw_url = (
        "https://raw.githubusercontent.com/sobannaik85-bot/story/main/"
        "frontend-streamlit/stories-static.json"
    )

    try:
        response = requests.get(
            github_raw_url,
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        stories = payload.get("stories", []) if isinstance(payload, dict) else []
        if isinstance(stories, list):
            return stories
    except Exception as exc:
        st.write(f"DEBUG: GitHub fetch failed: {exc}")

    return []


@st.cache_data(ttl=30)
def fetch_stories_hardcoded() -> list[dict[str, Any]]:
    """Ultimate fallback: hardcoded stories for guaranteed availability."""
    # This ensures the app always works
    return get_hardcoded_stories()


def get_hardcoded_stories() -> list[dict[str, Any]]:
    """Hardcoded stories for when all external sources fail."""
    return [
        {
            "id": "hardcoded_1",
            "title": "Sample Story - Concrete Hearts",
            "description": "Two strangers keep finding each other in a sprawling megacity.",
            "genre": "Romance",
            "coverImage": None,
            "chapters": [
                {
                    "id": "ch_1",
                    "title": "Platform 9",
                    "number": 1,
                    "contentType": "text",
                    "content": "The first time Lena noticed him, he was reading a paperback on the southbound platform.\n\nThis alone was enough to make him unusual. Nobody read paper books anymore. But there he stood, perfectly calm in the current of commuters, a battered copy in long fingers.",
                    "images": [],
                    "createdAt": "2026-03-15T12:33:37.874Z"
                }
            ],
            "createdAt": "2026-03-15T12:33:37.873Z",
            "updatedAt": "2026-03-15T12:33:37.874Z"
        }
    ]


def render_story_header(story: dict[str, Any]) -> None:
    st.title(story.get("title", "Untitled Story"))

    genre = story.get("genre")
    if genre:
        st.caption(f"Genre: {genre}")

    description = story.get("description")
    if description:
        st.write(description)

    cover_image = story.get("coverImage")
    if isinstance(cover_image, str) and cover_image.strip():
        st.image(cover_image, use_container_width=True)


def render_chapter(chapter: dict[str, Any]) -> None:
    chapter_number = chapter.get("number", "?")
    chapter_title = chapter.get("title", "Untitled Chapter")
    st.subheader(f"Chapter {chapter_number}: {chapter_title}")

    content_type = str(chapter.get("contentType") or "text").lower()

    if content_type == "images":
        images = chapter.get("images", [])
        if isinstance(images, list) and images:
            st.image(images, use_container_width=True)
            return
        st.info("This image chapter has no images.")
        return

    content = chapter.get("content", "")
    if isinstance(content, str) and content.strip():
        st.markdown(content.replace("\n", "  \n"))
    else:
        st.info("No text content in this chapter.")


st.sidebar.header("Storyverse")

if st.sidebar.button("Refresh Stories"):
    st.cache_data.clear()

if API_BASE_URL:
    st.sidebar.caption(f"Backend: {API_BASE_URL}")
else:
    st.sidebar.caption("Backend: not configured")

api_error_message = ""
try:
    stories = fetch_stories_from_api()
except requests.RequestException as exc:
    api_error_message = str(exc)
    stories = []

if not stories:
    stories = fetch_stories_from_local_file()
    if stories:
        st.sidebar.caption("Data source: local stories-static.json")
        if api_error_message:
            st.warning("Backend is unavailable. Showing bundled stories instead.")
    else:
        st.sidebar.caption("Data source: none")

if not stories:
    stories = fetch_stories_from_github()
    if stories:
        st.sidebar.caption("Data source: GitHub raw")
        if api_error_message:
            st.warning("Backend is unavailable. Loading from GitHub instead.")

if not stories:
    stories = fetch_stories_hardcoded()
    if stories:
        st.sidebar.caption("Data source: hardcoded (demo)")
        st.warning("Using hardcoded demo stories. Real data will load once backend/GitHub is configured.")

if api_error_message and API_BASE_URL and stories:
    st.info("Backend API was unreachable; using fallback data.")

if not stories:
    st.error("No stories available. This should not happen.")

story_labels = [story.get("title", "Untitled Story") for story in stories]
selected_story_label = st.sidebar.selectbox("Select Story", options=story_labels)
selected_story = stories[story_labels.index(selected_story_label)]

render_story_header(selected_story)

chapters = selected_story.get("chapters", [])
if not isinstance(chapters, list) or not chapters:
    st.info("No chapters yet for this story.")
    st.stop()

sorted_chapters = sorted(chapters, key=chapter_sort_key)
chapter_options = [
    f"Chapter {chapter.get('number', '?')}: {chapter.get('title', 'Untitled')}"
    for chapter in sorted_chapters
]
selected_chapter_label = st.selectbox("Choose Chapter", options=chapter_options)
selected_chapter = sorted_chapters[chapter_options.index(selected_chapter_label)]

render_chapter(selected_chapter)
