"""Spatio-Temporal Knowledge Graph & GraphRAG Engine.
Xây dựng Đồ thị tri thức không gian - thời gian biểu diễn mối quan hệ nhân quả:
[Nguồn phát thải: KCN/Cảng/Sân bay/Trục đường] -> [Chất ô nhiễm] -> [Vector gió khí tượng] -> [Phường hạ lưu] -> [Khuyến nghị sức khỏe].
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
import math


@dataclass
class EmissionSource:
    id: str
    name: str
    source_type: str  # industrial, logistics_port, airport, highway
    latitude: float
    longitude: float
    dominant_pollutants: List[str]
    base_emission_level: float  # Scale 1-100
    description: str


@dataclass
class SpatialCausalLink:
    source_name: str
    source_type: str
    distance_km: float
    wind_alignment: float  # Cosine similarity (-1 to 1): 1 = downwind (hứng trọn khói bụi)
    is_downwind_impact: bool
    estimated_impact_aqi: int
    narrative: str


class SpatioTemporalKnowledgeGraph:
    """Đồ thị tri thức không gian - thời gian phục vụ GraphRAG."""

    def __init__(self):
        # 1. Cơ sở dữ liệu nguồn thải lớn theo từng đô thị
        self.sources_by_city: Dict[str, List[EmissionSource]] = {
            "tp-ho-chi-minh": [
                EmissionSource(
                    id="tsn-airport",
                    name="Cụm Cảng Hàng Không Quốc Tế Tân Sơn Nhất",
                    source_type="airport",
                    latitude=10.8188,
                    longitude=106.6520,
                    dominant_pollutants=["pm25", "no2", "co"],
                    base_emission_level=75.0,
                    description="Mật độ cất hạ cánh cao cùng luồng phương tiện đón trả khách dày đặc trên các tuyến đường cửa ngõ.",
                ),
                EmissionSource(
                    id="cat-lai-port",
                    name="Cụm Cảng & Khu Công Nghiệp Cát Lái",
                    source_type="logistics_port",
                    latitude=10.7600,
                    longitude=106.7900,
                    dominant_pollutants=["pm25", "diesel_pm", "no2", "so2"],
                    base_emission_level=85.0,
                    description="Cảng container lớn nhất Việt Nam với hàng chục ngàn lượt xe tải nặng, xe đầu kéo container di chuyển ngày đêm.",
                ),
                EmissionSource(
                    id="tan-binh-iz",
                    name="Khu Công Nghiệp Tân Bình",
                    source_type="industrial",
                    latitude=10.8120,
                    longitude=106.6250,
                    dominant_pollutants=["pm25", "vocs", "pm10"],
                    base_emission_level=70.0,
                    description="Tập trung các nhà máy dệt may, bao bì, chế biến và cơ khí phụ trợ nội thành.",
                ),
                EmissionSource(
                    id="hiep-phuoc-iz",
                    name="Khu Đô Thị & Công Nghiệp Hiệp Phước (Nhà Bè)",
                    source_type="industrial",
                    latitude=10.6500,
                    longitude=106.7400,
                    dominant_pollutants=["so2", "pm10", "no2"],
                    base_emission_level=65.0,
                    description="Cụm công nghiệp nặng và điện đạm ven sông Soài Rạp.",
                ),
                EmissionSource(
                    id="vanh-dai-2",
                    name="Hành Lang Vành Đai 2 & Nút Giao An Phú",
                    source_type="highway",
                    latitude=10.7950,
                    longitude=106.7550,
                    dominant_pollutants=["pm25", "co"],
                    base_emission_level=60.0,
                    description="Trục giao thông vận tải liên tỉnh và vành đai trung chuyển hàng hóa phía Đông.",
                ),
            ],
            "ha-noi": [
                EmissionSource(
                    id="hn-bac-thang-long",
                    name="KCN Bắc Thăng Long",
                    source_type="industrial",
                    latitude=21.1200,
                    longitude=105.7800,
                    dominant_pollutants=["pm25", "vocs"],
                    base_emission_level=75.0,
                    description="Khu công nghiệp cơ điện tử và lắp ráp công nghệ cao quy mô lớn.",
                ),
                EmissionSource(
                    id="hn-vanh-dai-3",
                    name="Trục Đường Vành Đai 3 Trên Cao",
                    source_type="highway",
                    latitude=20.9900,
                    longitude=105.8000,
                    dominant_pollutants=["pm25", "no2", "co"],
                    base_emission_level=80.0,
                    description="Tuyến huyết mạch có mật độ ùn ứ xe cộ và xe khách liên tỉnh cao nhất thủ đô.",
                ),
            ],
        }

    @staticmethod
    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Tính khoảng cách cầu giữa 2 tọa độ (km)."""
        r = 6371.0
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(d_lon / 2) ** 2
        )
        return 2 * r * math.asin(math.sqrt(a))

    @staticmethod
    def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Góc phương vị từ điểm 1 tới điểm 2 (độ 0-360)."""
        lat1_r = math.radians(lat1)
        lat2_r = math.radians(lat2)
        d_lon = math.radians(lon2 - lon1)

        y = math.sin(d_lon) * math.cos(lat2_r)
        x = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)
        bearing = math.degrees(math.atan2(y, x))
        return (bearing + 360) % 360

    def query_spatial_causality(
        self,
        ward_name: str,
        ward_lat: float,
        ward_lon: float,
        city_id: str = "tp-ho-chi-minh",
        wind_deg: float = 225.0,  # 225 = Gió Tây Nam
        wind_speed_kmh: float = 12.0,
    ) -> List[SpatialCausalLink]:
        """Truy vết quan hệ nhân quả trên đồ thị:
        Kiểm tra nguồn thải nào nằm ở thượng phong (upwind) và thổi khói bụi vào phường này.
        """
        sources = self.sources_by_city.get(city_id, self.sources_by_city["tp-ho-chi-minh"])
        links: List[SpatialCausalLink] = []

        # Vector gió thổi TỪ wind_deg TỚI (wind_deg + 180) % 360
        wind_blow_towards_deg = (wind_deg + 180) % 360

        for src in sources:
            dist = self._haversine_km(src.latitude, src.longitude, ward_lat, ward_lon)
            if dist > 25.0:  # Ngoài phạm vi ảnh hưởng đô thị
                continue

            # Góc phương vị từ Nguồn phát thải tới Phường đang xét
            source_to_ward_deg = self._bearing_deg(src.latitude, src.longitude, ward_lat, ward_lon)

            # Độ lệch góc giữa hướng gió thổi và hướng tới Phường
            angle_diff = abs(wind_blow_towards_deg - source_to_ward_deg)
            if angle_diff > 180:
                angle_diff = 360 - angle_diff

            # Cosine similarity: 1 = Phường nằm ngay chính diện hướng gió cuốn bụi tới
            alignment = math.cos(math.radians(angle_diff))
            is_downwind = alignment > 0.4 and dist < 15.0

            # Tính mức đóng góp AQI ước tính từ nguồn này
            distance_decay = 1.0 / (1.0 + dist * 0.25)
            impact_aqi = int(src.base_emission_level * distance_decay * max(0.1, alignment) * 0.45)

            if is_downwind:
                narrative = (
                    f"Nằm cuối luồng gió của {src.name} (cách {dist:.1f} km). "
                    f"Khói bụi và khí xả đang bị gió thổi tạt trực tiếp sang phân khu này."
                )
            elif alignment < -0.3:
                narrative = (
                    f"Nằm ngược hướng gió so với {src.name} (cách {dist:.1f} km), "
                    f"nhờ đó tránh được luồng khói bụi phát tán chính."
                )
            else:
                narrative = (
                    f"Cách {src.name} khoảng {dist:.1f} km theo phương ngang gió, "
                    f"ít chịu ảnh hưởng trực tiếp từ luồng phát thải tập trung."
                )

            links.append(
                SpatialCausalLink(
                    source_name=src.name,
                    source_type=src.source_type,
                    distance_km=round(dist, 1),
                    wind_alignment=round(alignment, 2),
                    is_downwind_impact=is_downwind,
                    estimated_impact_aqi=impact_aqi,
                    narrative=narrative,
                )
            )

        # Sắp xếp theo mức độ ảnh hưởng giảm dần
        links.sort(key=lambda x: (x.is_downwind_impact, x.estimated_impact_aqi), reverse=True)
        return links

    def format_graphrag_context(
        self,
        ward_name: str,
        ward_lat: float,
        ward_lon: float,
        city_id: str,
        wind_deg: float,
        wind_speed_kmh: float,
    ) -> str:
        """Định dạng context tri thức không gian - thời gian phục vụ LLM."""
        links = self.query_spatial_causality(ward_name, ward_lat, ward_lon, city_id, wind_deg, wind_speed_kmh)
        downwind_sources = [l for l in links if l.is_downwind_impact]

        wind_direction_text = (
            "Tây Nam" if 200 <= wind_deg <= 260
            else "Đông Bắc" if 20 <= wind_deg <= 80
            else "Đông Nam" if 110 <= wind_deg <= 170
            else "Tây Bắc" if 290 <= wind_deg <= 350
            else f"{wind_deg:.0f}°"
        )

        lines = [
            f"=== THÔNG TIN ĐỒ THỊ TRI THỨC KHÔNG GIAN (SPATIO-TEMPORAL GRAPHRAG) ===",
            f"- Khu vực tra cứu: {ward_name} (Tọa độ: {ward_lat:.4f}°N, {ward_lon:.4f}°E)",
            f"- Điều kiện gió khí tượng hiện tại: Hướng gió thổi từ {wind_direction_text} ({wind_deg:.0f}°), tốc độ {wind_speed_kmh:.1f} km/h.",
        ]

        if downwind_sources:
            lines.append("- Các nguồn phát thải thượng lưu đang ảnh hưởng trực tiếp:")
            for s in downwind_sources[:2]:
                lines.append(f"  + {s.source_name}: {s.narrative} (Đóng góp ~{s.estimated_impact_aqi} điểm AQI)")
        else:
            lines.append("- Khu vực hiện không nằm trực diện cuối luồng gió của các điểm nóng công nghiệp lớn.")

        lines.append("=== KẾT THÚC DỮ LIỆU ĐỒ THỊ ===")
        return "\n".join(lines)


# Singleton instance
graphrag_engine = SpatioTemporalKnowledgeGraph()
