from fastapi import FastAPI

from app.routers import chat as chat_router
from app.routers import conversations as conversations_router
from app.routers import me as me_router

app = FastAPI(title="Mental Wellbeing Companion API", version="0.0.0")
app.include_router(me_router.router, prefix="/api/v1", tags=["me"])
app.include_router(conversations_router.router, prefix="/api/v1", tags=["conversations"])
app.include_router(chat_router.router, prefix="/api/v1", tags=["chat"])


@app.get("/api/v1/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
