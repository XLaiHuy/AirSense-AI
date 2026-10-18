"""Unit tests for VN_AQI NowCast calculation according to Decision 1459/QD-TCMT."""
import pytest
from airsense_domain.aqi.nowcast import (
    calculate_nowcast_concentration,
    calculate_sub_index,
    calculate_vn_aqi,
    get_aqi_level_metadata,
)
from airsense_domain.models import AQICategory, PollutantType


def test_nowcast_concentration_constant_series():
    """Chuỗi nồng độ không đổi 50.0 ug/m3 thì NowCast phải bằng đúng 50.0."""
    series = [50.0] * 12
    result = calculate_nowcast_concentration(series)
    assert result == 50.0


def test_nowcast_concentration_minimum_weight():
    """Khi nồng độ dao động mạnh (min/max < 0.5), trọng số w phải được neo ở mức sàn 0.5."""
    # Giờ mới nhất nồng độ cao (100.0), giờ cũ nồng độ thấp (10.0) -> w = 10/100 = 0.1 -> w = 0.5
    series = [100.0, 10.0]
    result = calculate_nowcast_concentration(series)
    # w = 0.5. result = (100*1 + 10*0.5) / (1 + 0.5) = 105 / 1.5 = 70.0
    assert result == 70.0


def test_pm25_sub_index_breakpoints():
    """Kiểm tra chỉ số phụ AQI theo các mốc phân đoạn chuẩn QCVN 05:2023."""
    # 0 - 25 ug/m3 -> 0 - 50 AQI (Tốt)
    assert calculate_sub_index("pm25", 0.0) == 0
    assert calculate_sub_index("pm25", 25.0) == 50

    # 25.1 - 50 ug/m3 -> 51 - 100 AQI (Trung bình)
    assert calculate_sub_index("pm25", 37.5) == 75
    assert calculate_sub_index("pm25", 50.0) == 100

    # 50.1 - 80 ug/m3 -> 101 - 150 AQI (Kém)
    assert calculate_sub_index("pm25", 80.0) == 150


def test_calculate_vn_aqi_dominant_pollutant():
    """VN_AQI phải lấy theo chất ô nhiễm có chỉ số phụ cao nhất."""
    measurements = {
        "pm25": [75.0],  # PM2.5 = 75 ug/m3 -> AQI ~ 142 (Kém)
        "pm10": [30.0],  # PM10 = 30 ug/m3 -> AQI = 30 (Tốt)
        "no2": [40.0],   # NO2 = 40 ug/m3 -> AQI = 40 (Tốt)
    }
    result = calculate_vn_aqi("test_station", measurements)
    assert result.dominant_pollutant == PollutantType.PM25
    assert result.category == AQICategory.UNHEALTHY_SENSITIVE
    assert result.label_vi == "Kém"
    assert result.symbol == "▲"
    assert result.aqi_value >= 140


def test_empty_measurements_handling():
    """Khi trạm không có dữ liệu đo nào, trả về trạng thái NO_DATA an toàn."""
    result = calculate_vn_aqi("empty_station", {})
    assert result.completeness_flag == "NO_DATA"
    assert result.aqi_value == 0
    assert result.label_vi == "Không có dữ liệu"
