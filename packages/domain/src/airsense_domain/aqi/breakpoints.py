"""VN_AQI Breakpoints according to Decision 1459/QD-TCMT and QCVN 05:2023.
Also provides colorblind-safe metadata (symbols, hex colors, health advice).
"""
from typing import Dict, List, Tuple
from airsense_domain.models import AQICategory

# Thang AQI chuẩn [I_min, I_max]
AQI_LEVELS = [
    (0, 50, AQICategory.GOOD, "Tốt", "#00E400", "●", "Chất lượng không khí tốt, tự do hoạt động ngoài trời."),
    (51, 100, AQICategory.MODERATE, "Trung bình", "#FFFF00", "◆", "Chấp nhận được. Nhóm cực kỳ nhạy cảm nên hạn chế hoạt động mạnh."),
    (101, 150, AQICategory.UNHEALTHY_SENSITIVE, "Kém", "#FF7E00", "▲", "Nhóm nhạy cảm (trẻ em, người già, người bệnh hô hấp) nên giảm hoạt động ngoài trời."),
    (151, 200, AQICategory.UNHEALTHY, "Xấu", "#FF0000", "⬣", "Mọi người bắt đầu cảm nhận ảnh hưởng; nhóm nhạy cảm bị tác động nghiêm trọng hơn."),
    (201, 300, AQICategory.VERY_UNHEALTHY, "Rất xấu", "#8F3F97", "⬛", "Cảnh báo sức khỏe khẩn cấp. Toàn bộ người dân bị ảnh hưởng, nên ở trong nhà."),
    (301, 500, AQICategory.HAZARDOUS, "Nguy hại", "#7E0023", "✖", "Báo động nguy hại sức khỏe nghiêm trọng. Đóng kín cửa sổ, tránh mọi hoạt động ngoài trời.")
]

# Bảng phân đoạn nồng độ chất ô nhiễm (ug/m3) theo từng mức AQI
# Format: [BP_min, BP_max] tương ứng với từng mức trong AQI_LEVELS
BREAKPOINTS: Dict[str, List[Tuple[float, float]]] = {
    "pm25": [
        (0.0, 25.0),
        (25.1, 50.0),
        (50.1, 80.0),
        (80.1, 150.0),
        (150.1, 250.0),
        (250.1, 350.0),
    ],
    "pm10": [
        (0.0, 50.0),
        (50.1, 100.0),
        (100.1, 150.0),
        (150.1, 250.0),
        (250.1, 350.0),
        (350.1, 420.0),
    ],
    "o3": [
        (0.0, 100.0),
        (100.1, 160.0),
        (160.1, 215.0),
        (215.1, 265.0),
        (265.1, 800.0),
        (800.1, 1000.0),
    ],
    "no2": [
        (0.0, 100.0),
        (100.1, 200.0),
        (200.1, 700.0),
        (700.1, 1200.0),
        (1200.1, 2350.0),
        (2350.1, 3850.0),
    ],
    "so2": [
        (0.0, 125.0),
        (125.1, 350.0),
        (350.1, 550.0),
        (550.1, 800.0),
        (800.1, 1600.0),
        (1600.1, 2100.0),
    ],
    "co": [
        (0.0, 10000.0),
        (10000.1, 30000.0),
        (30000.1, 45000.0),
        (45000.1, 60000.0),
        (60000.1, 90000.0),
        (90000.1, 120000.0),
    ],
}
