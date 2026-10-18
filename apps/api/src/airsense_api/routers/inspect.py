"""Click-to-Inspect Spatial Interpolation Router.
Allows inspecting air quality and meteorological conditions at any coordinate in Vietnam (even without physical stations).
"""
from fastapi import APIRouter, HTTPException, Query
from airsense_adapters.service import AirSenseDataService
from airsense_domain.models import InspectPointResult

router = APIRouter(prefix="/v1/air", tags=["Inspect Coordinates"])

# Global shared service instance
data_service = AirSenseDataService()


@router.get("/inspect", response_model=InspectPointResult)
async def inspect_coordinates(
    lat: float = Query(..., ge=8.0, le=24.0, description="Vĩ độ (Latitude trong lãnh thổ Việt Nam: 8.0 - 24.0)"),
    lon: float = Query(..., ge=102.0, le=110.0, description="Kinh độ (Longitude trong lãnh thổ Việt Nam: 102.0 - 110.0)"),
) -> InspectPointResult:
    """Kiểm tra chất lượng không khí tại bất kỳ tọa độ địa lý nào qua mô hình CAMS & Open-Meteo."""
    try:
        result = await data_service.inspect_coordinates(lat=lat, lon=lon)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi nội suy dữ liệu tại tọa độ ({lat}, {lon}): {str(e)}",
        )
