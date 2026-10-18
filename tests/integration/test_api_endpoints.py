"""Integration tests for FastAPI REST API endpoints."""
from datetime import datetime, timezone
from email.utils import formatdate
import pytest
from starlette.testclient import TestClient
from airsense_api.main import app

client = TestClient(app)


def test_root_endpoint():
    resp = client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert "documentation" in data


def test_health_check_endpoint():
    resp = client.get("/v1/ops/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["station_count"] >= 5


def test_list_stations_endpoint():
    resp = client.get("/v1/air/stations")
    assert resp.status_code == 200
    stations = resp.json()
    assert len(stations) >= 5

    # Kiểm tra trạm Lãnh sự quán Mỹ
    us_consulate = next((s for s in stations if s["id"] == "vn-hcm-us-consulate"), None)
    assert us_consulate is not None
    assert us_consulate["latest_aqi"] is not None
    assert us_consulate["latest_aqi"]["aqi_value"] > 0
    assert us_consulate["latest_aqi"]["label_vi"] != ""


def test_stations_geojson_endpoint():
    resp = client.get("/v1/maps/stations-geojson")
    assert resp.status_code == 200
    geojson = resp.json()
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) >= 5

    feat = geojson["features"][0]
    assert "geometry" in feat
    assert feat["geometry"]["type"] == "Point"
    assert "properties" in feat
    assert "aqi" in feat["properties"]
    assert "symbol" in feat["properties"]


def test_http_304_not_modified_behavior():
    """Kiểm tra cơ chế If-Modified-Since trả mã HTTP 304 để client không cần tải lại."""
    station_id = "vn-hcm-us-consulate"

    # 1. Gọi lần 1 lấy Last-Modified
    resp1 = client.get(f"/v1/air/stations/{station_id}")
    assert resp1.status_code == 200
    last_mod = resp1.headers.get("Last-Modified")
    assert last_mod is not None

    # 2. Gọi lần 2 với If-Modified-Since = Last-Modified -> Phải trả HTTP 304
    resp2 = client.get(
        f"/v1/air/stations/{station_id}",
        headers={"If-Modified-Since": last_mod},
    )
    assert resp2.status_code == 304
    assert len(resp2.content) == 0  # 0 byte mạng
