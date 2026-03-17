# Storyverse Backend (FastAPI)

This is the separated backend API for stories and chapters.

## Local Run

1. Create and activate a Python virtual environment.
2. Install dependencies:

   pip install -r requirements.txt

3. Start server:

   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

4. Open API docs:

   http://localhost:8000/docs

## Environment

- `CORS_ORIGINS`:
  - `*` for quick testing
  - or comma-separated frontend origins in production
- `STORIES_DATA_PATH` (optional): override JSON path

## Endpoints

- `GET /health`
- `GET /stories`
- `GET /stories/{story_id}`
- `GET /stories/{story_id}/chapters/{chapter_number}`
