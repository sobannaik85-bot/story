# Storyverse Frontend (Streamlit)

This is the separated Streamlit frontend.

## Fastest Deploy (No Local Venv)

1. Push this repo to GitHub.
2. In Streamlit Community Cloud, create app with path:

   frontend-streamlit/app.py

3. Deploy directly.

The app includes `frontend-streamlit/stories-static.json` fallback data, so it can run even if backend is not configured yet.

## Local Run

1. Create and activate a Python virtual environment.
2. Install dependencies:

   pip install -r requirements.txt

3. Set backend URL:

   set API_BASE_URL=http://localhost:8000

4. Run app:

   streamlit run app.py

## Streamlit Cloud

- Deploy this folder as the app source.
- Set a secret named `API_BASE_URL` to your deployed backend URL.
- Optional secret `LOCAL_STORIES_PATH` can override fallback file location.
