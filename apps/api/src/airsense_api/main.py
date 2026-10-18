"""AirSense AI - FastAPI Main Application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from airsense_api.config import settings
from airsense_api.routers import agent, air, cities, inspect, maps, ops

app = FastAPI(
    title="AirSense AI API",
    description="Nền tảng Giám sát & Dự báo Ô nhiễm Không khí tích hợp Web GIS và AI Assistant",
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Cấu hình CORS cho Next.js Web Client
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gắn các routers
app.include_router(air.router)
app.include_router(inspect.router)
app.include_router(cities.router)
app.include_router(agent.router)
app.include_router(maps.router)
app.include_router(ops.router)


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Chào mừng đến với AirSense AI API (Sprint 2)",
        "documentation": "/docs",
        "health": "/v1/ops/health",
        "stations": "/v1/air/stations",
        "cities": "/v1/air/cities",
        "inspect_point": "/v1/air/inspect?lat=10.776&lon=106.700",
        "dashboard_studio": "/v1/air/cities/tp-ho-chi-minh/dashboard",
        "agent_chat": "/v1/agent/chat",
        "geojson": "/v1/maps/stations-geojson",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("airsense_api.main:app", host="0.0.0.0", port=settings.API_PORT, reload=True)
