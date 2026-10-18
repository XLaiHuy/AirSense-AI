"""Quality Validation and Anomaly Filtering for Air Quality Measurements.
Prevents corrupted data from contaminating the database and machine learning models.
"""
from typing import Dict, Optional, Tuple
from airsense_domain.models import DataKind, Measurement, PollutantType, QualityFlag

# Giới hạn vật lý tối đa cho phép (ug/m3)
PHYSICAL_MAX_LIMITS: Dict[str, float] = {
    "pm25": 800.0,
    "pm10": 1200.0,
    "o3": 1200.0,
    "no2": 2500.0,
    "so2": 2500.0,
    "co": 150000.0,
}


class QualityValidator:
    @staticmethod
    def validate_measurement(
        station_id: str,
        pollutant: str,
        value: float,
        unit: str = "ug/m3",
    ) -> Tuple[bool, QualityFlag, Optional[str]]:
        """Kiểm tra tính hợp lệ của số đo quan trắc.
        Trả về (is_valid, quality_flag, error_reason).
        """
        # 1. Kiểm tra nồng độ âm
        if value < 0:
            return False, QualityFlag.INVALID, f"Nồng độ âm bất hợp lý: {value} {unit}"

        # 2. Chuẩn hóa tên chất ô nhiễm
        pol_lower = pollutant.lower().replace(".", "").replace("-", "")
        if pol_lower not in PHYSICAL_MAX_LIMITS:
            return True, QualityFlag.GOOD, None

        # 3. Kiểm tra trôi cảm biến / đột biến bất khả thi vật lý
        max_limit = PHYSICAL_MAX_LIMITS[pol_lower]
        if value > max_limit:
            return (
                False,
                QualityFlag.DEGRADED,
                f"Giá trị vượt ngưỡng vật lý trần ({value} > {max_limit} {unit})",
            )

        return True, QualityFlag.GOOD, None
