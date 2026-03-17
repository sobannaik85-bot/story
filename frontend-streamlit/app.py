import json
import os
from pathlib import Path
from typing import Any
from datetime import datetime

import requests
import streamlit as st

# Page config
st.set_page_config(
    page_title="Storyverse",
    page_icon="📖",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Constants
ADMIN_ID = "soban"
ADMIN_PASS = "pass"
BASE_DIR = Path(__file__).resolve().parent
LOCAL_STORIES_PATH = Path(
    st.secrets.get("LOCAL_STORIES_PATH", os.getenv("LOCAL_STORIES_PATH", str(BASE_DIR / "stories-static.json")))
).expanduser()
API_BASE_URL = st.secrets.get("API_BASE_URL", os.getenv("API_BASE_URL", "")).rstrip("/")
REQUEST_TIMEOUT_SECONDS = 30

# Initialize session state
if "admin_logged_in" not in st.session_state:
    st.session_state.admin_logged_in = False
if "stories" not in st.session_state:
    st.session_state.stories = []
if "show_admin_login" not in st.session_state:
    st.session_state.show_admin_login = False


def load_stories() -> list[dict[str, Any]]:
    """Load stories from all available sources."""
    try:
        if API_BASE_URL:
            response = requests.get(
                f"{API_BASE_URL}/stories",
                timeout=REQUEST_TIMEOUT_SECONDS,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
            stories = payload.get("stories", [])
            if isinstance(stories, list):
                return stories
    except Exception:
        pass

    # Local file fallback
    if LOCAL_STORIES_PATH.exists():
        try:
            with LOCAL_STORIES_PATH.open("r", encoding="utf-8") as f:
                payload = json.load(f)
                stories = payload.get("stories", [])
                if isinstance(stories, list):
                    return stories
        except Exception:
            pass

    # GitHub fallback
    try:
        response = requests.get(
            "https://raw.githubusercontent.com/sobannaik85-bot/story/main/frontend-streamlit/stories-static.json",
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        stories = payload.get("stories", [])
        if isinstance(stories, list):
            return stories
    except Exception:
        pass

    # Hardcoded fallback
    return get_hardcoded_stories()


def get_hardcoded_stories() -> list[dict[str, Any]]:
    """Hardcoded demo stories."""
    return [
        {
            "id": "demo_1",
            "title": "The First Rewrite",
            "description": "A story about beginnings and second chances.",
            "genre": "Drama",
            "coverImage": None,
            "chapters": [
                {
                    "id": "ch_1",
                    "title": "Chapter One",
                    "number": 1,
                    "contentType": "text",
                    "content": "This is a demo story. Log in as admin to create real stories!\n\nAdmin ID: soban\nPassword: pass",
                    "images": [],
                    "createdAt": datetime.now().isoformat(),
                }
            ],
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
        }
    ]


def save_stories(stories: list[dict[str, Any]]) -> None:
    """Save stories to local JSON file."""
    try:
        payload = {"stories": stories, "updatedAt": datetime.now().isoformat()}
        with LOCAL_STORIES_PATH.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
    except Exception as exc:
        st.error(f"Failed to save stories: {exc}")


def admin_login_ui():
    """Admin login interface."""
    st.markdown("# 🔐 Admin Login")

    col1, col2 = st.columns([1, 2])

    with col1:
        admin_id = st.text_input("Admin ID", key="admin_id_input")
        admin_pass = st.text_input("Password", type="password", key="admin_pass_input")

        if st.button("Login", use_container_width=True):
            if admin_id == ADMIN_ID and admin_pass == ADMIN_PASS:
                st.session_state.admin_logged_in = True
                st.session_state.show_admin_login = False
                st.success("Login successful! Reloading...")
                st.rerun()
            else:
                st.error("Invalid credentials")


def admin_dashboard_ui(stories: list[dict[str, Any]]):
    """Admin dashboard for story/chapter management."""
    st.markdown("# 📚 Admin Dashboard")

    col1, col2 = st.columns([3, 1])
    with col2:
        if st.button("Logout", use_container_width=True):
            st.session_state.admin_logged_in = False
            st.rerun()

    # Create new story
    with st.expander("➕ Create New Story", expanded=False):
        story_title = st.text_input("Story Title")
        story_desc = st.text_area("Description")
        story_genre = st.text_input("Genre")

        if st.button("Create Story"):
            if story_title.strip():
                new_story = {
                    "id": f"story_{len(stories)}_{int(datetime.now().timestamp())}",
                    "title": story_title,
                    "description": story_desc,
                    "genre": story_genre,
                    "coverImage": None,
                    "chapters": [],
                    "createdAt": datetime.now().isoformat(),
                    "updatedAt": datetime.now().isoformat(),
                }
                stories.append(new_story)
                save_stories(stories)
                st.success(f"Story '{story_title}' created!")
                st.rerun()
            else:
                st.error("Story title cannot be empty")

    st.divider()

    # Manage stories
    st.markdown("## Manage Stories")

    if not stories:
        st.info("No stories yet.")
        return

    for idx, story in enumerate(stories):
        with st.expander(f"📖 {story.get('title', 'Untitled')} ({len(story.get('chapters', []))} chapters)", expanded=False):
            col1, col2, col3 = st.columns(3)

            with col1:
                st.write(f"**Genre:** {story.get('genre', 'N/A')}")
                st.write(f"**Description:** {story.get('description', 'N/A')}")

            with col2:
                if st.button("Delete", key=f"delete_story_{idx}"):
                    stories.pop(idx)
                    save_stories(stories)
                    st.success("Story deleted!")
                    st.rerun()

            with col3:
                st.write(f"**Chapters:** {len(story.get('chapters', []))}")

            # Chapters section
            st.markdown("### Chapters")
            chapters = story.get("chapters", [])

            # Add new chapter
            if st.button("➕ Add Chapter", key=f"add_chapter_{idx}"):
                new_chapter = {
                    "id": f"ch_{len(chapters)}_{int(datetime.now().timestamp())}",
                    "title": f"Chapter {len(chapters) + 1}",
                    "number": len(chapters) + 1,
                    "contentType": "text",
                    "content": "",
                    "images": [],
                    "createdAt": datetime.now().isoformat(),
                }
                story["chapters"].append(new_chapter)
                story["updatedAt"] = datetime.now().isoformat()
                save_stories(stories)
                st.success("Chapter added!")
                st.rerun()

            # List and manage chapters
            if st.checkbox("📝 Edit Chapters", key=f"edit_chapters_{idx}"):
                st.markdown("#### Edit Chapters")
                
                for ch_idx, chapter in enumerate(chapters):
                    st.divider()
                    
                    col1, col2, col3 = st.columns([2, 1, 1])
                    
                    with col1:
                        ch_title = st.text_input("Chapter Title", value=chapter.get("title", ""), key=f"ch_title_{idx}_{ch_idx}")
                    
                    with col2:
                        ch_number = st.number_input("Ch #", value=int(chapter.get("number", 1)), min_value=1, key=f"ch_number_{idx}_{ch_idx}")
                    
                    with col3:
                        ch_type = st.selectbox("Type", ["text", "images"], index=0 if chapter.get("contentType") == "text" else 1, key=f"ch_type_{idx}_{ch_idx}")
                    
                    if ch_type == "text":
                        ch_content = st.text_area("Content", value=chapter.get("content", ""), key=f"ch_content_{idx}_{ch_idx}", height=100)
                    else:
                        ch_content = ""
                    
                    col_save, col_delete = st.columns(2)
                    with col_save:
                        if st.button("✅ Save", key=f"save_ch_{idx}_{ch_idx}", use_container_width=True):
                            chapter["title"] = ch_title
                            chapter["number"] = ch_number
                            chapter["contentType"] = ch_type
                            if ch_type == "text":
                                chapter["content"] = ch_content
                            chapter["updatedAt"] = datetime.now().isoformat()
                            story["updatedAt"] = datetime.now().isoformat()
                            save_stories(stories)
                            st.success("Chapter saved!")
                            st.rerun()
                    
                    with col_delete:
                        if st.button("❌ Delete", key=f"delete_ch_{idx}_{ch_idx}", use_container_width=True):
                            story["chapters"].pop(ch_idx)
                            story["updatedAt"] = datetime.now().isoformat()
                            save_stories(stories)
                            st.success("Chapter deleted!")
                            st.rerun()


def reader_view_ui(stories: list[dict[str, Any]]):
    """Reader view for non-admin users."""
    st.markdown("# 📚 Storyverse Reader")

    if not stories:
        st.warning("No stories available.")
        return

    st.sidebar.markdown("## 📖 Stories")

    story_labels = [s.get("title", "Untitled") for s in stories]
    selected_label = st.sidebar.selectbox("Select a story:", story_labels)
    selected_story = stories[story_labels.index(selected_label)]

    # Story header
    st.title(selected_story.get("title", "Untitled Story"))

    col1, col2 = st.columns(2)
    with col1:
        if genre := selected_story.get("genre"):
            st.caption(f"**Genre:** {genre}")
    with col2:
        st.caption(f"**Chapters:** {len(selected_story.get('chapters', []))}")

    if desc := selected_story.get("description"):
        st.write(desc)

    st.divider()

    # Chapters
    chapters = selected_story.get("chapters", [])
    if not chapters:
        st.info("No chapters in this story yet.")
        return

    chapter_labels = [f"Chapter {ch.get('number', '?')}: {ch.get('title', 'Untitled')}" for ch in chapters]
    selected_ch_label = st.selectbox("Choose chapter:", chapter_labels)
    selected_chapter = chapters[chapter_labels.index(selected_ch_label)]

    # Render chapter
    st.markdown(f"## {selected_chapter.get('title', 'Untitled Chapter')}")

    if selected_chapter.get("contentType") == "images":
        images = selected_chapter.get("images", [])
        if images:
            st.image(images, use_container_width=True)
        else:
            st.info("No images in this chapter.")
    else:
        content = selected_chapter.get("content", "")
        if content:
            st.markdown(content.replace("\n", "  \n"))
        else:
            st.info("No content in this chapter.")


# Main app
def main():
    if not st.session_state.admin_logged_in:
        # Check for admin login button in sidebar
        with st.sidebar:
            st.markdown("---")
            if st.button("🔐 Admin Login", use_container_width=True):
                st.session_state.show_admin_login = True

        if st.session_state.show_admin_login:
            admin_login_ui()
        else:
            # Load and display stories in reader mode
            st.session_state.stories = load_stories()
            reader_view_ui(st.session_state.stories)
    else:
        # Admin mode
        st.session_state.stories = load_stories()
        admin_dashboard_ui(st.session_state.stories)


if __name__ == "__main__":
    main()
