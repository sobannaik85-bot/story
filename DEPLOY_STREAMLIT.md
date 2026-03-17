# Separate Backend + Frontend Deployment (Streamlit)

This project is now split into:

- `backend/` -> FastAPI backend
- `frontend-streamlit/` -> Streamlit frontend

## Fastest Path (No Local Venv)

If you want immediate deployment, deploy only Streamlit first:

1. Push this repo to GitHub.
2. In Streamlit Community Cloud, set app file path to:

   frontend-streamlit/app.py

3. Deploy.

This works immediately using bundled `frontend-streamlit/stories-static.json` fallback data.

## 1) Deploy Backend (Render example)

1. Push this project to GitHub.
2. Create a new Web Service on Render.
3. Set Root Directory to `backend`.
4. Build Command:

   pip install -r requirements.txt

5. Start Command:

   uvicorn app.main:app --host 0.0.0.0 --port $PORT

6. Environment variables:

   CORS_ORIGINS=https://<your-streamlit-app>.streamlit.app

7. Deploy and copy your backend URL, for example:

   https://storyverse-backend.onrender.com

## 2) Deploy Streamlit Frontend

1. Open Streamlit Community Cloud.
2. Create app from your GitHub repo.
3. Set app file path to:

   frontend-streamlit/app.py

4. In Streamlit app settings, add secret:

   API_BASE_URL = "https://storyverse-backend.onrender.com"

5. Deploy.

## 3) Verify

- Backend health URL:

  https://storyverse-backend.onrender.com/health

- Streamlit app should load stories and chapters from backend.

## Local Test

Backend:

cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Frontend:

cd frontend-streamlit
pip install -r requirements.txt
set API_BASE_URL=http://localhost:8000
streamlit run app.py
