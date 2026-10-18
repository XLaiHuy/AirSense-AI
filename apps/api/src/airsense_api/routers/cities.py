"""Cities, Districts & Dashboard Studio Data Router.
Provides multi-region support across 6 major Vietnamese cities and aggregated studio metrics.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from airsense_adapters.service import AirSenseDataService
from airsense_domain.models import CityRegion, DashboardStudioData, WatchlistItem

router = APIRouter(prefix="/v1/air", tags=["Cities & Dashboard Studio"])

data_service = AirSenseDataService()


@router.get("/cities", response_model=List[CityRegion])
async def list_cities() -> List[CityRegion]:
    """Lấy danh sách 6 đô thị lớn Việt Nam (TP.HCM, Hà Nội, Đà Nẵng, Hải Phòng, Cần Thơ, Huế)."""
    return data_service.get_all_cities()


@router.get("/cities/{city_id}", response_model=CityRegion)
async def get_city(city_id: str) -> CityRegion:
    """Lấy thông tin chi tiết một đô thị kèm các quận/huyện trực thuộc."""
    city = data_service.get_city(city_id)
    if not city:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy đô thị với mã: {city_id}")
    return city


@router.get("/cities/{city_id}/dashboard", response_model=DashboardStudioData)
async def get_city_dashboard(city_id: str) -> DashboardStudioData:
    """Tổng hợp gói dữ liệu chuyên sâu phục vụ Dashboard Studio (chuẩn Mockup Ảnh 2).
    Bao gồm: Live AQI Index, 4 thẻ Environmental Data, 24h Index Sparkline, Health Tips,
    Forecast Matrix (7 khung giờ x 7 ngày), và Watchlist đa đô thị.
    """
    city = data_service.get_city(city_id)
    if not city:
        # Fallback to default TP.HCM
        city_id = "tp-ho-chi-minh"
    return data_service.get_dashboard_studio_data(city_id)


@router.get("/watchlist", response_model=List[WatchlistItem])
async def get_watchlist() -> List[WatchlistItem]:
    """Lấy bảng theo dõi so sánh nhanh chất lượng không khí giữa các thành phố Việt Nam."""
    return data_service.get_multi_city_watchlist()
