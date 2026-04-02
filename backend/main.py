from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from backend.routers.scorer import router as scorer_router
from backend.routers.auth import router as auth_router
from backend.routers.history import router as history_router
from backend.routers.chat import router as chat_router
from backend.database import init_db

app = FastAPI()

@app.on_event("startup")
async def on_startup():
    await init_db()

app.include_router(auth_router)
app.include_router(history_router)
app.include_router(scorer_router)
app.include_router(chat_router)

@app.get("/", response_class=HTMLResponse)
def home():
    with open("frontend/index.html", encoding="utf-8") as f:
        return f.read()