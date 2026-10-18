"""VN_AQI NowCast Calculation conforming strictly to Decision 1459/QD-TCMT.
Calculates NowCast concentrations and computes sub-indices and overall VN_AQI.
"""
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from airsense_domain.aqi.breakpoints import AQI_LEVELS, BREAKPOINTS
from airsense_domain.models import AQICategory, PollutantType, VNAQIResult


def calculate_nowcast_concentration(hourly_values: List[float]) -> float:
    """Tính nồng độ NowCast theo chuỗi nồng độ 12 giờ gần nhất.
    hourly_values[0] là giờ hiện tại (mới nhất), hourly_values[-1] là giờ xa nhất.
    """
    valid_values = [v for v in hourly_values if v is not None and v >= 0]
    if not valid_values:
        return 0.0
    if len(valid_values) == 1:
        return valid_values[0]

    c_min = min(valid_values)
    c_max = max(valid_values)

    if c_max == 0:
        w = 1.0
    else:
        w = c_min / c_max
        if w < 0.5:
            w = 0.5

    numerator = 0.0
    denominator = 0.0
    for i, c in enumerate(valid_values):
        weight = w ** i
        numerator += weight * c
        denominator += weight

    if denominator == 0:
        return valid_values[0]

    return round(numerator / denominator, 2)


def calculate_sub_index(pollutant: str, concentration: float) -> int:
    """Tính chỉ số AQI thành phần (sub-index) theo phân đoạn nồng độ."""
    if pollutant not in BREAKPOINTS:
        return 0

    c = max(0.0, float(concentration))
    intervals = BREAKPOINTS[pollutant]

    # Duyệt qua các phân đoạn
    for level_idx, (bp_lo, bp_hi) in enumerate(intervals):
        if c <= bp_hi or level_idx == len(intervals) - 1:
            i_lo, i_hi = AQI_LEVELS[level_idx][0], AQI_LEVELS[level_idx][1]
            if bp_hi == bp_lo:
                return i_lo
            aqi = ((i_hi - i_lo) / (bp_hi - bp_lo)) * (c - bp_lo) + i_lo
            return min(500, max(0, round(aqi)))

    return 500


def get_aqi_level_metadata(aqi_value: int) -> Tuple[AQICategory, str, str, str, str]:
    """Trả về (category, label_vi, color_hex, symbol, health_advice)."""
    for i_lo, i_hi, cat, label, color, symbol, advice in AQI_LEVELS:
        if i_lo <= aqi_value <= i_hi:
            return cat, label, color, symbol, advice
    # Vượt 500
    last = AQI_LEVELS[-1]
    return last[2], last[3], last[4], last[5], last[6]


def calculate_vn_aqi(
    station_id: str,
    measurements: Dict[str, List[float]],
    calculated_at: Optional[datetime] = None,
) -> VNAQIResult:
    """Tính chỉ số VN_AQI tổng hợp từ dictionary các chất ô nhiễm.
    Ví dụ measurements = {'pm25': [35.2, 38.0, 31.4], 'no2': [45.0], ...}
    """
    if calculated_at is None:
        calculated_at = datetime.utcnow()

    sub_indices: Dict[str, int] = {}
    
    # 1. PM2.5 (NowCast nếu có chuỗi giờ)
    if "pm25" in measurements and measurements["pm25"]:
        c_pm25 = calculate_nowcast_concentration(measurements["pm25"])
        sub_indices["pm25"] = calculate_sub_index("pm25", c_pm25)

    # 2. PM10 (NowCast nếu có chuỗi giờ)
    if "pm10" in measurements and measurements["pm10"]:
        c_pm10 = calculate_nowcast_concentration(measurements["pm10"])
        sub_indices["pm10"] = calculate_sub_index("pm10", c_pm10)

    # 3. Các khí khác (1 giờ tức thời hoặc trung bình)
    for pol in ["o3", "no2", "so2", "co"]:
        if pol in measurements and measurements[pol]:
            valid = [v for v in measurements[pol] if v is not None and v >= 0]
            if valid:
                sub_indices[pol] = calculate_sub_index(pol, valid[0])

    if not sub_indices:
        # Không có dữ liệu đo nào
        return VNAQIResult(
            station_id=station_id,
            calculated_at=calculated_at,
            aqi_value=0,
            category=AQICategory.GOOD,
            label_vi="Không có dữ liệu",
            color_hex="#9E9E9E",
            symbol="●",
            health_advice_vi="Chưa có dữ liệu quan trắc tại trạm này.",
            dominant_pollutant=PollutantType.PM25,
            sub_indices={},
            completeness_flag="NO_DATA",
        )

    # Chất ô nhiễm có chỉ số lớn nhất quyết định AQI trạm
    max_pol = max(sub_indices, key=lambda k: sub_indices[k])
    max_aqi = sub_indices[max_pol]

    cat, label, color, symbol, advice = get_aqi_level_metadata(max_aqi)

    completeness = "FULL" if len(sub_indices) >= 3 else f"ONLY_{max_pol.upper()}"

    return VNAQIResult(
        station_id=station_id,
        calculated_at=calculated_at,
        aqi_value=max_aqi,
        category=cat,
        label_vi=label,
        color_hex=color,
        symbol=symbol,
        health_advice_vi=advice,
        dominant_pollutant=PollutantType(max_pol),
        sub_indices=sub_indices,
        completeness_flag=completeness,
    )
