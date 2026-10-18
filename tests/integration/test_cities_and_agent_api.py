"""Integration tests for Sprint 2 Endpoints:
- /v1/air/cities and /v1/air/cities/{city_id}/dashboard
- /v1/air/inspect
- /v1/agent/chat
"""
import pytest
from starlette.testclient import TestClient
from airsense_api.main import app

client = TestClient(app)


def test_list_cities():
    """Kiểm tra danh sách 6 đô thị lớn Việt Nam."""
    res = client.get("/v1/air/cities")
    assert res.status_code == 200
    cities = res.json()
    assert len(cities) >= 6
    city_ids = [c["id"] for c in cities]
    assert "tp-ho-chi-minh" in city_ids
    assert "ha-noi" in city_ids
    assert "da-nang" in city_ids


def test_get_city_dashboard_studio():
    """Kiểm tra gói dữ liệu Dashboard Studio chuyên sâu cho TP.HCM."""
    res = client.get("/v1/air/cities/tp-ho-chi-minh/dashboard")
    assert res.status_code == 200
    data = res.json()
    assert "city" in data
    assert "live_aqi" in data
    assert "environmental" in data
    assert "index_of_day" in data
    assert "health_tips" in data
    assert "forecast_matrix" in data
    assert "watchlist" in data

    # Kiểm tra các thông số môi trường
    env = data["environmental"]
    assert env["pm25_ugm3"] > 0
    assert "wind_speed_kmh" in env
    assert "temperature_c" in env

    # Kiểm tra ma trận dự báo
    assert len(data["forecast_matrix"]) == 49  # 7 slots x 7 days


def test_inspect_point_coordinates():
    """Kiểm tra chức năng nội suy không gian tại tọa độ bất kỳ không có trạm."""
    # Tọa độ vùng ven TP.HCM (Nhà Bè: 10.650, 106.733)
    res = client.get("/v1/air/inspect?lat=10.650&lon=106.733")
    assert res.status_code == 200
    inspect_data = res.json()
    assert inspect_data["is_virtual_station"] is True
    assert "aqi" in inspect_data
    assert "environmental" in inspect_data
    assert inspect_data["aqi"]["aqi_value"] > 0
    assert "nearest_address" in inspect_data


def test_agent_chat_assistant():
    """Kiểm tra phản hồi của AI Agent Assist với câu hỏi tư vấn chạy bộ."""
    payload = {
        "messages": [
            {"role": "user", "content": "Hôm nay tôi chạy bộ ở Quận 1 TP.HCM lúc mấy giờ an toàn?"}
        ],
        "city_context": "tp-ho-chi-minh",
    }
    res = client.post("/v1/agent/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert len(data["reply"]) > 50
    assert "VN_AQI" in data["reply"] or "AQI" in data["reply"]
    assert len(data["suggested_actions"]) > 0


def test_agent_chat_compare_cities():
    """Kiểm tra AI Agent so sánh Hà Nội và TP.HCM."""
    payload = {
        "messages": [
            {"role": "user", "content": "So sánh ô nhiễm giữa Hà Nội và TP.HCM hiện tại."}
        ],
        "city_context": "ha-noi",
    }
    res = client.post("/v1/agent/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "Hà Nội" in data["reply"]
    assert "Hồ Chí Minh" in data["reply"]
