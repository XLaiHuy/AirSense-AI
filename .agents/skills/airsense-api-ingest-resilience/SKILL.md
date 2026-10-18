---
name: airsense-api-ingest-resilience
description: "Quy chuẩn thiết kế và vận hành Ingestion Pipeline thu thập dữ liệu quan trắc không khí (OpenAQ, Open-Meteo, PAM Air): Chống đứt kết nối, Circuit Breaker, Exponential Backoff with Jitter, Dead-Letter Queue (DLQ), Watermark Checkpointing và Multi-tier Fallback."
---

# AirSense AI — Ingestion Resilience & API Fault-Tolerance Skill

Kỹ năng chuyên sâu đảm bảo các tiến trình Ingestion thu thập dữ liệu khí tượng và quan trắc chất lượng không khí hoạt động bền bỉ 24/7, tự phục hồi sau sự cố mạng hoặc hạn ngạch API từ nhà cung cấp bên thứ ba (OpenAQ, Open-Meteo, PAM Air, CAMS).

---

## 1. Nguyên tắc Bất biến trong Thu thập Dữ liệu

1. **Không bao giờ làm gián đoạn UI vì lỗi Upstream**:
   - Khi API nhà cung cấp (OpenAQ/Open-Meteo) bị timeout, trả lỗi 5xx hoặc chạm trần 429: Hệ thống tuyệt đối không ném lỗi 500 ra Web Client và **không bao giờ trả giá trị `0`** cho các chỉ số thiếu.
   - Luôn kích hoạt ma trận Fallback đa tầng (Stale Observed -> Modeled CAMS -> Spatial Estimated -> Unavailable có cờ cảnh báo rõ ràng).
2. **Raw Staging First (Landing Zone)**:
   - Mọi response thô từ API ngoài phải được lưu vào bảng `raw_ingest_payloads` (PostgreSQL JSONB hoặc MinIO S3) kèm mã băm SHA-256 và `ingested_at` trước khi bóc tách schema.
   - Điều này cho phép backfill, replay hoặc sửa logic chuyển đổi đơn vị mà không cần tốn quota gọi lại API gốc.
3. **Idempotency & Watermark Tracking**:
   - Lưu trữ `last_successful_observed_at` cho từng trạm và nguồn dữ liệu.
   - Khóa bản ghi duy nhất: `UNIQUE(provider, station_id, pollutant, observed_at)`. Mọi lệnh insert đều dùng `ON CONFLICT DO UPDATE` hoặc `DO NOTHING` để an toàn khi chạy lại nhiều lần.

---

## 2. Các Mẫu Thiết kế Kỹ thuật (Patterns)

### Pattern 1: Circuit Breaker cho Upstream APIs (Stateful Guard)
```python
# Ví dụ triển khai Circuit Breaker cho OpenAQ / Open-Meteo Adapter
import time
from enum import Enum

class BreakerState(Enum):
    CLOSED = "CLOSED"       # Bình thường, cho phép gọi
    OPEN = "OPEN"           # Lỗi vượt ngưỡng, chặn gọi và trả fallback ngay
    HALF_OPEN = "HALF_OPEN" # Cho phép 1 request thăm dò kiểm tra phục hồi

class APICircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = BreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0

    def can_execute(self) -> bool:
        if self.state == BreakerState.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = BreakerState.HALF_OPEN
                return True
            return False
        return True

    def record_success(self):
        self.failure_count = 0
        self.state = BreakerState.CLOSED

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.threshold:
            self.state = BreakerState.OPEN
```

### Pattern 2: Exponential Backoff với Full Jitter (Chống Thundering Herd)
```python
import asyncio
import random

async def fetch_with_jitter_retry(fetch_fn, max_attempts: int = 4, base_delay: float = 1.0, max_delay: float = 30.0):
    for attempt in range(max_attempts):
        try:
            return await fetch_fn()
        except (TimeoutError, Upstream5xxError, RateLimit429Error) as err:
            if attempt == max_attempts - 1:
                raise err
            # Tính thời gian chờ có thêm ngẫu nhiên hóa (Full Jitter)
            sleep_time = min(max_delay, base_delay * (2 ** attempt))
            jitter = random.uniform(0.5, 1.5)
            await asyncio.sleep(sleep_time * jitter)
```

### Pattern 3: Dead-Letter Queue (DLQ) & Background Sweep
- **Bảng `ingest_dead_letter`**: Lưu các payload dị thường (nồng độ âm, trôi cảm biến, schema lỗi) với metadata: `provider`, `station_id`, `raw_payload`, `error_reason`, `retry_count`, `next_retry_at`.
- **Worker Sweep**: Một cron job ngầm chạy 15-30 phút/lần để quét lại các bản ghi trong DLQ. Sau 3 lần thử lại không thành công, gắn cờ `QUARANTINED` và gửi thông báo lên Ops Console.

---

## 3. Checklist Kiểm tra Độ bền Ingestion (Verification Gate)

- [ ] **Mô phỏng ngắt mạng**: Ngắt internet của worker trong 10 phút. Khi có mạng trở lại, worker tự động resume từ watermark cũ mà không bỏ sót giờ đo nào.
- [ ] **Mô phỏng Rate Limit 429**: Giả lập OpenAQ trả mã 429, hệ thống kích hoạt backoff, không dồn dập gửi request spam.
- [ ] **Mô phỏng Trạm chết (Offline station)**: Một trạm ngừng gửi tín hiệu trong 24 giờ. UI hiển thị trạng thái `modeled` hoặc `unavailable` kèm nhãn độ trễ, hệ thống không bị crash.
