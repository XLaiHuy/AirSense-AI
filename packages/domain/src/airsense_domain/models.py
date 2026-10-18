"""Domain Data Contracts and Models for AirSense AI.
Strict Pydantic v2 schemas preserving provenance, quality flags, and timestamps.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class DataKind(str, Enum):
    OBSERVED = "observed"
    MODELED = "modeled"
    ESTIMATED = "estimated"
    FORECAST = "forecast"
    UNAVAILABLE = "unavailable"


class QualityFlag(str, Enum):
    GOOD = "good"
    DEGRADED = "degraded"
    INVALID = "invalid"
    UNAVAILABLE = "unavailable"
    NO_DATA = "no_data"


class PollutantType(str, Enum):
    PM25 = "pm25"
    PM10 = "pm10"
    O3 = "o3"
    NO2 = "no2"
    SO2 = "so2"
    CO = "co"


class AQICategory(str, Enum):
    GOOD = "GOOD"                                 # 0 - 50: Tốt
    MODERATE = "MODERATE"                         # 51 - 100: Trung bình
    UNHEALTHY_SENSITIVE = "UNHEALTHY_SENSITIVE"   # 101 - 150: Kém
    UNHEALTHY = "UNHEALTHY"                       # 151 - 200: Xấu
    VERY_UNHEALTHY = "VERY_UNHEALTHY"             # 201 - 300: Rất xấu
    HAZARDOUS = "HAZARDOUS"                       # 301 - 500: Nguy hại


class Measurement(BaseModel):
    station_id: str = Field(..., description="Mã định danh trạm")
    pollutant: PollutantType = Field(..., description="Loại chất ô nhiễm")
    value: float = Field(..., description="Giá trị đo được")
    unit: str = Field(default="ug/m3", description="Đơn vị nồng độ")
    observed_at: datetime = Field(..., description="Thời gian quan trắc chuẩn UTC")
    ingested_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    data_kind: DataKind = Field(default=DataKind.OBSERVED)
    quality_flag: QualityFlag = Field(default=QualityFlag.GOOD)
    warnings: List[str] = Field(default_factory=list)

    @field_validator("value")
    @classmethod
    def check_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Nồng độ ô nhiễm không thể âm")
        return round(v, 2)


class VNAQIResult(BaseModel):
    station_id: str
    calculated_at: datetime
    aqi_value: int = Field(..., ge=0, le=500, description="Chỉ số VN_AQI (0 - 500)")
    category: AQICategory
    label_vi: str = Field(..., description="Tên mức ô nhiễm tiếng Việt")
    color_hex: str = Field(..., description="Mã màu HEX đại diện")
    symbol: str = Field(..., description="Ký hiệu hình học cho người mù màu")
    health_advice_vi: str = Field(..., description="Khuyến cáo sức khỏe tiếng Việt")
    dominant_pollutant: PollutantType
    sub_indices: Dict[str, int] = Field(default_factory=dict)
    completeness_flag: str = Field(default="FULL")


class Station(BaseModel):
    id: str
    provider: str = Field(..., description="openaq, openmeteo, tphcm_local, pamair")
    name: str
    latitude: float
    longitude: float
    status: str = Field(default="active")
    latest_aqi: Optional[VNAQIResult] = None
    latest_measurements: Dict[str, Measurement] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    last_updated: Optional[datetime] = None


class ForecastSnapshot(BaseModel):
    location_id: str
    pollutant: PollutantType
    value: float
    unit: str = "ug/m3"
    issued_at: datetime
    valid_at: datetime
    horizon_hours: int
    source: str = Field(default="cams", description="cams | lightgbm | chronos | hybrid")
    model_version: str = "1.0"
    uncertainty: Optional[float] = None
    warnings: List[str] = Field(default_factory=list)


# -------------------------------------------------------------
# SPRINT 2 MODELS: DASHBOARD STUDIO, SPATIAL INSPECT & AGENT
# -------------------------------------------------------------

class EnvironmentalSummary(BaseModel):
    pm25_ugm3: float = Field(..., description="Nồng độ PM2.5 (ug/m3)")
    pm10_ugm3: float = Field(default=0.0, description="Nồng độ PM10 (ug/m3)")
    wind_speed_kmh: float = Field(..., description="Tốc độ gió (km/h)")
    temperature_c: float = Field(..., description="Nhiệt độ (độ C)")
    humidity_percent: int = Field(..., description="Độ ẩm tương đối (%)")
    weather_condition: str = Field(default="Có mây", description="Điều kiện thời tiết")


class InspectPointResult(BaseModel):
    latitude: float
    longitude: float
    nearest_address: str
    is_virtual_station: bool = True
    aqi: VNAQIResult
    environmental: EnvironmentalSummary
    measurements: Dict[str, Measurement]
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)


class DistrictInfo(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    aqi_value: int
    category: AQICategory
    label_vi: str
    color_hex: str


class CityRegion(BaseModel):
    id: str
    name: str
    country: str = "Việt Nam"
    center_lat: float
    center_lon: float
    zoom_level: float = 11.0
    current_aqi: int
    category: AQICategory
    label_vi: str
    color_hex: str
    districts: List[DistrictInfo] = Field(default_factory=list)


class ForecastMatrixItem(BaseModel):
    time_slot: str = Field(..., description="12 am, 2 am, 6 am, 10 am, 1 pm, 4 pm, 8 pm")
    day_label: str = Field(..., description="Sun, Mon, Tue, Wed, Thu, Fri, Sat")
    aqi_value: int
    category: AQICategory
    color_hex: str
    opacity: float = 1.0


class WatchlistItem(BaseModel):
    city_id: str
    city_name: str
    pollution_level: str = Field(..., description="Tốt | Trung bình | Kém | Xấu | Rất xấu | Nguy hại")
    weather_desc: str
    temp_range: str
    wind_speed: str
    aqi_value: int
    color_hex: str


class SparklinePoint(BaseModel):
    hour: str
    aqi: int
    pm25: float


class HealthTip(BaseModel):
    id: str
    action_vi: str
    icon_type: str = Field(..., description="mask | window | outdoor | air_purifier")
    severity: str = Field(default="info", description="info | warning | alert")


class DashboardStudioData(BaseModel):
    city: CityRegion
    live_aqi: VNAQIResult
    environmental: EnvironmentalSummary
    index_of_day: List[SparklinePoint]
    health_tips: List[HealthTip]
    forecast_matrix: List[ForecastMatrixItem]
    watchlist: List[WatchlistItem]
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class AgentMessage(BaseModel):
    role: str = Field(..., description="user | assistant | system")
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentChatRequest(BaseModel):
    messages: List[AgentMessage]
    city_context: Optional[str] = "tp-ho-chi-minh"
    user_location: Optional[Dict[str, float]] = None


class AgentChatResponse(BaseModel):
    reply: str
    suggested_actions: List[str] = Field(default_factory=list)
    referenced_stations: List[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

