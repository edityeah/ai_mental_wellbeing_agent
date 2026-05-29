from fastapi import FastAPI

app = FastAPI(title="Mental Wellbeing Companion API", version="0.0.0")


@app.get("/api/v1/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
