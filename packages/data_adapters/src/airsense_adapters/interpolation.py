"""Advection-Diffusion Spatial Interpolator (Khuếch tán Đối Lưu Gió).
Thay thế mô hình IDW đẳng hướng hình cầu thông thường.
Mô hình hóa sự lan truyền nồng độ ô nhiễm theo phương trình truyền tải - khuếch tán:
Các hạt bụi mịn PM2.5 bị vector gió cuốn theo hướng gió chính (Advection)
đồng thời khuếch tán rối theo phương ngang (Diffusion).
"""
import math
from typing import List, Dict, Any, Tuple


class AdvectionDiffusionKriging:
    """Bộ nội suy không gian dựa trên Phương trình Đối lưu - Khuếch tán khí tượng."""

    def __init__(self, advection_decay: float = 0.65, diffusion_spread: float = 1.35):
        self.advection_decay = advection_decay  # Hệ số kéo dài theo vệt gió
        self.diffusion_spread = diffusion_spread  # Hệ số khuếch tán ngang gió

    @staticmethod
    def _to_cartesian_km(lat: float, lon: float, ref_lat: float, ref_lon: float) -> Tuple[float, float]:
        """Quy đổi tọa độ WGS84 sang tọa độ phẳng Đề-các địa phương (km)."""
        lat_km = (lat - ref_lat) * 111.0
        lon_km = (lon - ref_lon) * 111.0 * math.cos(math.radians(ref_lat))
        return lon_km, lat_km

    def calculate_anisotropic_distance(
        self,
        target_lat: float,
        target_lon: float,
        station_lat: float,
        station_lon: float,
        wind_deg: float,  # Độ 0-360: hướng gió thổi từ
        wind_speed_kmh: float,
    ) -> float:
        """Tính khoảng cách hiệu dụng phi đẳng hướng (Anisotropic Distance).
        Nếu mục tiêu nằm ở hạ lưu hướng gió so với trạm, khoảng cách hiệu dụng giảm đi
        (ảnh hưởng ô nhiễm lan xa hơn theo vệt gió).
        """
        # Vector gió thổi tới góc (wind_deg + 180) % 360
        theta_rad = math.radians((wind_deg + 180) % 360)
        cos_t = math.cos(theta_rad)
        sin_t = math.sin(theta_rad)

        # Tọa độ tương đối từ Trạm tới Điểm mục tiêu
        dx, dy = self._to_cartesian_km(target_lat, target_lon, station_lat, station_lon)

        # Chiếu tọa độ lên hệ trục của vector gió:
        # d_parallel: dọc theo hướng gió thổi
        # d_perp: vuông góc với hướng gió thổi
        d_parallel = dx * sin_t + dy * cos_t
        d_perp = -dx * cos_t + dy * sin_t

        # Tốc độ gió chuẩn hóa
        v_norm = max(0.5, wind_speed_kmh / 10.0)

        # Nếu d_parallel > 0 (nằm ở hạ lưu hướng gió): khoảng cách hiệu dụng ngắn lại
        if d_parallel > 0:
            eff_parallel = d_parallel / (1.0 + self.advection_decay * v_norm)
        else:
            # Ngược hướng gió: khói bụi khó phát tán tới
            eff_parallel = abs(d_parallel) * (1.0 + self.advection_decay * v_norm * 1.5)

        eff_perp = abs(d_perp) * self.diffusion_spread

        return math.sqrt(eff_parallel**2 + eff_perp**2) + 0.05

    def interpolate_point(
        self,
        target_lat: float,
        target_lon: float,
        stations: List[Dict[str, Any]],
        wind_deg: float = 225.0,
        wind_speed_kmh: float = 12.0,
    ) -> Dict[str, float]:
        """Nội suy nồng độ PM2.5 và AQI tại tọa độ mục tiêu bằng trọng số khoảng cách đối lưu."""
        if not stations:
            return {"aqi": 65.0, "pm25": 28.0}

        total_weight = 0.0
        weighted_aqi = 0.0
        weighted_pm25 = 0.0

        for st in stations:
            s_lat = float(st.get("latitude") or 0.0)
            s_lon = float(st.get("longitude") or 0.0)
            aqi_val = float(st.get("aqi") if st.get("aqi") is not None else 60.0)
            pm25_raw = st.get("pm25")
            pm25_val = float(pm25_raw) if pm25_raw is not None else aqi_val * 0.45

            dist_eff = self.calculate_anisotropic_distance(
                target_lat, target_lon, s_lat, s_lon, wind_deg, wind_speed_kmh
            )

            # Trọng số nghịch đảo bình phương khoảng cách hiệu dụng
            w = 1.0 / (dist_eff**2)
            total_weight += w
            weighted_aqi += aqi_val * w
            weighted_pm25 += pm25_val * w

        if total_weight > 0:
            return {
                "aqi": round(weighted_aqi / total_weight, 1),
                "pm25": round(weighted_pm25 / total_weight, 1),
            }
        return {"aqi": 65.0, "pm25": 28.0}


# Singleton instance
advection_interpolator = AdvectionDiffusionKriging()
