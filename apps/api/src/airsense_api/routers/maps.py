from typing import Optional
from fastapi import APIRouter, Query, Response
from airsense_adapters.service import AirSenseDataService

router = APIRouter(prefix="/v1/maps", tags=["Maps GIS"])
data_service = AirSenseDataService()


@router.get("/stations-geojson")
def get_stations_geojson(
    response: Response,
    city_id: Optional[str] = Query(None, description="Lọc theo mã đô thị (ha-noi, tp-ho-chi-minh, da-nang...), để trống lấy toàn bộ"),
):
    """Trả về GeoJSON FeatureCollection của các trạm quan trắc (toàn quốc hoặc theo đô thị)."""
    geojson_data = data_service.get_geojson(city_id=city_id)
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return geojson_data
