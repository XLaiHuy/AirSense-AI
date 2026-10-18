---
name: airsense-plan-goals
description: "Quản lý mục tiêu, phân rã milestone, định nghĩa Definition of Done (DoD) và cổng nghiệm thu (Verification Gates) cho dự án AirSense AI. Tách biệt công việc local với hạ tầng production."
---

# AirSense AI — Plan Goals & Verification Gate Skill

Kỹ năng quản trị mục tiêu kỹ thuật, phân rã sprint và thiết lập các cổng kiểm chứng thực nghiệm (**Verification Gates**) cho dự án AirSense AI. Đảm bảo mọi tính năng được hoàn thành trọn vẹn theo tiêu chuẩn chất lượng nghiêm ngặt trước khi chuyển sang giai đoạn tiếp theo.

---

## 1. Nguyên tắc Quản lý Tiến độ (Implementation Discipline)

1. **Không coi việc "dựng khung (scaffolding)" là hoàn thành**:
   - Một module hay API chỉ được đánh dấu là xong (Done) khi đã có unit tests, kiểm thử tích hợp (integration tests) với mock data/fixtures và log quan sát được.
2. **Tách biệt Môi trường Local và Production**:
   - Mọi milestone ban đầu phải chạy hoàn toàn trên máy local (qua Docker Compose: PostgreSQL + PostGIS + pgvector + Redis) với dữ liệu mẫu và các mock adapter trước khi phụ thuộc vào API keys thực tế hay GPU server ngoài.
3. **Evidence-based Verification (Kiểm chứng bằng bằng chứng đo đạc)**:
   - Các tuyên bố về độ chính xác mô hình (MAE/RMSE), độ trễ API (p95 latency) hoặc khả năng chịu lỗi (resilience) phải đi kèm báo cáo log hoặc screenshot đo đạc thực tế, không dùng giả định.

---

## 2. Cổng Nghiệm thu theo Từng Giai đoạn (Milestone Gates)

```
[Phase 0: Feasibility] ──► [Phase 1: Map/Data MVP] ──► [Phase 2: Forecasting] ──► [Phase 3: RAG & Agent]
      │                            │                           │                         │
      ▼                            ▼                           ▼                         ▼
Gate 0: API Contracts        Gate 1: Map & UI            Gate 2: Challenger Gate   Gate 3: Anti-Hallucination
• OpenAQ token test          • MapLibre 60fps            • Rolling Backtest        • 100% Read-only tools
• CAMS grid resolution       • Click p95 < 500ms         • LightGBM beats CAMS     • Context < 2500 tokens
• QCVN 1459 NowCast unit     • Fallback UI tests         • No weather leakage      • Page-level citations
```

---

## 3. Quy trình Kiểm thử Nghiệm thu (Verification Protocol)

Mỗi khi hoàn thành một tính năng, kỹ sư/agent bắt buộc chạy quy trình kiểm thử 4 bước:

1. **Contract & Lint Check**:
   - Chạy `ruff check .` và `mypy packages/` cho Python.
   - Chạy `npm run lint` và `tsc --noEmit` cho Next.js frontend.
2. **Ingestion & Resilience Smoke Test**:
   - Chạy lệnh mô phỏng ngắt kết nối mạng hoặc rate limit 429 để kiểm tra Circuit Breaker và cơ chế Exponential Backoff with Jitter.
   - Xác nhận bảng `ingest_dead_letter` nhận đúng dữ liệu rác và worker ngầm quét lại thành công.
3. **Numeric Accuracy Check**:
   - Chạy bộ test suite tính toán VN_AQI NowCast đối chiếu với bảng giá trị mẫu từ QCVN 05:2023. Sai số tuyệt đối phải bằng 0.
4. **Agent Guarded Response Check**:
   - Gửi các câu hỏi thử thách (prompt injection, câu hỏi ép đoán số liệu khi không có trạm đo).
   - Xác nhận Agent trả lời bằng trạng thái từ chối an toàn hoặc trích dẫn chính xác tài liệu pháp quy.
