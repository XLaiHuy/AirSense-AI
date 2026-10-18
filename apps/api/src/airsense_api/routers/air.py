"""Air Quality Data Endpoints with HTTP 304 (Not Modified) Caching Support."""
from datetime import datetime
from email.utils import formatdate, parsedate_to_datetime
from typing import List, Optional
from fastapi import APIRouter, Header, HTTPException, Response
from airsense_adapters.service import AirSenseDataService
from airsense_domain.models import Station

router = APIRouter(prefix="/v1/air", tags=["Air Quality"])
data_service = AirSenseDataService()


@router.get("/stations", response_model=List[Station])
def list_stations(response: Response):
    """Lấy danh sách tất cả các trạm quan trắc kèm VN_AQI NowCast mới nhất."""
    stations = data_service.get_all_stations()
    # Cache Control: client có thể cache 60s
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return stations


@router.get("/stations/{station_id}")
def get_station_detail(
    station_id: str,
    response: Response,
    if_modified_since: Optional[str] = Header(None, alias="If-Modified-Since"),
):
    """Lấy chi tiết một trạm quan trắc. Hỗ trợ HTTP 304 Not Modified."""
    station = data_service.get_station_by_id(station_id)
    if not station:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy trạm: {station_id}")

    last_mod = station.last_updated or datetime.utcnow()
    last_mod_str = formatdate(last_mod.timestamp(), usegmt=True)
    etag = f'W/"{station_id}-{int(last_mod.timestamp())}"'

    # Kiểm tra If-Modified-Since
    if if_modified_since:
        try:
            client_time = parsedate_to_datetime(if_modified_since)
            if int(client_time.timestamp()) >= int(last_mod.timestamp()):
                return Response(status_code=304)
        except Exception:
            pass

    response.headers["Last-Modified"] = last_mod_str
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return station


@router.get("/stations/{station_id}/history")
def get_station_history(
    station_id: str,
    response: Response,
    if_modified_since: Optional[str] = Header(None, alias="If-Modified-Since"),
):
    """Lấy chuỗi lịch sử 24h phục vụ biểu đồ ECharts. Hỗ trợ HTTP 304."""
    history = data_service.get_station_history(station_id)
    if not history:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy lịch sử trạm: {station_id}")

    station = data_service.get_station_by_id(station_id)
    last_mod = station.last_updated if station else datetime.utcnow()
    last_mod_str = formatdate(last_mod.timestamp(), usegmt=True)

    if if_modified_since:
        try:
            client_time = parsedate_to_datetime(if_modified_since)
            if client_time >= last_mod:
                return Response(status_code=304)
        except Exception:
            pass

    response.headers["Last-Modified"] = last_mod_str
    response.headers["Cache-Control"] = "public, max-age=120, stale-while-revalidate=600"
    return history


@router.get("/clean-route")
def get_clean_route(
    from_ward: str,
    to_ward: str,
    city_id: str = "tp-ho-chi-minh",
):
    """Tìm tuyến đường sạch bằng thuật toán A* Đa Mục Tiêu (Multi-Objective A*)."""
    return data_service.get_clean_route(from_ward=from_ward, to_ward=to_ward, city_id=city_id)

