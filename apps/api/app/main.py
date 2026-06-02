import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging_setup import configure_logging
from app.routers import chat as chat_router
from app.routers import conversations as conversations_router
from app.routers import insights as insights_router
from app.routers import me as me_router
from app.routers import mood as mood_router
from app.routers import onboarding as onboarding_router
from app.routers import profile as profile_router
from app.routers import voice as voice_router

configure_logging()

app = FastAPI(title="Mental Wellbeing Companion API", version="0.0.0")

# CORS allowed origins come from env so we can change them without a
# code deploy. Defaults cover local dev. In production set
# CORS_ALLOWED_ORIGINS=https://wellbeing.adityeah.ai,https://your-vercel-app.vercel.app
_cors_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()] or [
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me_router.router, prefix="/api/v1", tags=["me"])
app.include_router(conversations_router.router, prefix="/api/v1", tags=["conversations"])
app.include_router(chat_router.router, prefix="/api/v1", tags=["chat"])
app.include_router(voice_router.router, prefix="/api/v1", tags=["voice"])
app.include_router(insights_router.router, prefix="/api/v1", tags=["insights"])
app.include_router(profile_router.router, prefix="/api/v1", tags=["profile"])
app.include_router(onboarding_router.router, prefix="/api/v1", tags=["onboarding"])
app.include_router(mood_router.router, prefix="/api/v1", tags=["mood"])


@app.get("/api/v1/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
