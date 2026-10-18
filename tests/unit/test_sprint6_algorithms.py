"""Unit tests for Sprint 6 Algorithms:
1. Spatio-Temporal Knowledge Graph (GraphRAG)
2. Advection-Diffusion Kriging (Wind plume spatial interpolation)
3. Multi-Objective A* Clean Air Routing
"""
import pytest
from starlette.testclient import TestClient
from airsense_adapters.interpolation import AdvectionDiffusionKriging
from airsense_adapters.graphrag import SpatioTemporalKnowledgeGraph
from airsense_adapters.routing import MultiObjectiveAStarRouter
from airsense_api.main import app

client = TestClient(app)


def test_advection_diffusion_anisotropy():
    """Kiểm tra tính phi đẳng hướng: Điểm ở hạ lưu hướng gió phải có khoảng cách hiệu dụng ngắn hơn điểm ở thượng lưu."""
    interpolator = AdvectionDiffusionKriging(advection_decay=0.65, diffusion_spread=1.35)
    source_lat, source_lon = 10.770, 106.690
    wind_deg = 180.0  # Gió thổi từ hướng Nam lên hướng Bắc
    wind_speed = 15.0

    # Điểm A ở phía Bắc (hạ lưu gió từ trạm)
    downwind_lat, downwind_lon = 10.800, 106.690
    d_downwind = interpolator.calculate_anisotropic_distance(
        downwind_lat, downwind_lon, source_lat, source_lon, wind_deg, wind_speed
    )

    # Điểm B ở phía Nam (ngược hướng gió)
    upwind_lat, upwind_lon = 10.740, 106.690
    d_upwind = interpolator.calculate_anisotropic_distance(
        upwind_lat, upwind_lon, source_lat, source_lon, wind_deg, wind_speed
    )

    # Khoảng cách hiệu dụng về phía hạ lưu phải nhỏ hơn nhiều so với ngược gió
    assert d_downwind < d_upwind, f"d_downwind ({d_downwind}) must be < d_upwind ({d_upwind})"


def test_spatio_temporal_graphrag():
    """Kiểm tra GraphRAG truy vết nguồn phát thải và phường hạ lưu theo hướng gió."""
    kg = SpatioTemporalKnowledgeGraph()
    # Gió Tây Nam (225 độ) từ KCN Tân Bình & Hiệp Phước tới Phường Bến Nghé
    context = kg.format_graphrag_context(
        ward_name="Phường Bến Nghé",
        ward_lat=10.7769,
        ward_lon=106.7009,
        city_id="tp-ho-chi-minh",
        wind_deg=225.0,
        wind_speed_kmh=12.0,
    )
    assert len(context) > 0
    assert "SPATIO-TEMPORAL GRAPHRAG" in context
    assert "Phường Bến Nghé" in context
    assert "Tây Nam" in context


def test_multiobjective_astar_routing():
    """Kiểm tra thuật toán tìm đường sạch A* đa mục tiêu."""
    router = MultiObjectiveAStarRouter()
    # Tìm đường từ Bến Nghé sang Thảo Điền
    aqi_map = {"Phường Bến Nghé": 75, "Phường Thảo Điền": 53, "Phường Tân Định": 85}
    route = router.find_clean_route(
        from_ward="Phường Bến Nghé",
        to_ward="Phường Thảo Điền",
        ward_aqi_map=aqi_map,
    )
    assert route is not None
    assert len(route.waypoints) >= 2
    assert route.total_distance_km > 0
    assert route.avg_aqi > 0
    assert route.exposure_avoidance_percent >= 0
    assert len(route.coordinates) >= 2
    assert len(route.description) > 0


def test_api_clean_route_endpoint():
    """Kiểm tra API endpoint /v1/air/clean-route."""
    res = client.get("/v1/air/clean-route?from_ward=Phường Bến Nghé&to_ward=Phường Thảo Điền&city_id=tp-ho-chi-minh")
    assert res.status_code == 200
    data = res.json()
    assert "from_ward" in data
    assert "to_ward" in data
    assert data["total_distance_km"] > 0
    assert data["avg_aqi"] > 0
    assert "coordinates" in data
    assert len(data["coordinates"]) >= 2
    assert "waypoints" in data
    assert "exposure_avoidance_percent" in data
