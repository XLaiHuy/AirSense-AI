"""Operations & Health Check Endpoints."""
from fastapi import APIRouter
from airsense_adapters.service import AirSenseDataService
from airsense_api.config import settings

router = APIRouter(prefix="/v1/ops", tags=["Operations"])
data_service = AirSenseDataService()


@router.get("/health")
def health_check():
    """Kiểm tra sức khỏe hệ thống và trạng thái các Circuit Breakers."""
    stations = data_service.get_all_stations()
    return {
        "status": "healthy",
        "service": "AirSense AI API",
        "environment": settings.ENVIRONMENT,
        "station_count": len(stations),
        "circuits": {
            "openmeteo": data_service.openmeteo.circuit_breaker.state.value,
        },
    }
