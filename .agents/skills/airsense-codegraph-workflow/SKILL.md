---
name: airsense-codegraph-workflow
description: "Quy chuẩn khai thác và đồng bộ CodeGraph cho monorepo AirSense AI: Trace call path giữa Next.js - FastAPI - Celery/Worker - PostGIS, đánh giá phạm vi ảnh hưởng khi refactor, và thiết lập codegraph.json loại trừ dữ liệu GIS/ML binaries."
---

# AirSense AI — CodeGraph Workflow Skill

Kỹ năng điều phối và khai thác công cụ **CodeGraph** trong cấu trúc Monorepo của AirSense AI. Áp dụng quy chuẩn tra cứu đồ thị quan hệ giữa các thành phần mã nguồn, phân tích tác động (impact analysis) khi refactor, và tối ưu chỉ mục code cục bộ.

---

## 1. Nguyên tắc Kích hoạt & Sử dụng CodeGraph

1. **Chỉ dùng khi có thư mục `.codegraph/`**:
   - Nếu trong root repo chưa có `.codegraph/`, bỏ qua CodeGraph và dùng các công cụ duyệt file tiêu chuẩn.
   - Việc sinh index là quyết định chủ động của kỹ sư: chạy `codegraph index` khi cấu trúc monorepo và các symbols ban đầu đã hình thành.
2. **Ưu tiên CodeGraph trước Grep / Regex**:
   - Trước khi grep tìm kiếm văn bản rời rạc, hãy gọi công cụ `codegraph_explore` hoặc lệnh shell `codegraph explore "<symbol hoặc câu hỏi>"` để thấy ngay định nghĩa, tham chiếu và đường dẫn gọi hàm (call path).
3. **Đánh giá phạm vi ảnh hưởng (Change Impact Analysis)**:
   - Khi chỉnh sửa các data contract dùng chung (ví dụ: `Measurement`, `Forecast`, schema VN_AQI), sử dụng CodeGraph để xác định chính xác những router, worker, hoặc component nào bị ảnh hưởng trước khi sửa đổi.

---

## 2. Quy chuẩn Cấu hình `codegraph.json` cho AirSense AI

Vì AirSense AI làm việc với dữ liệu GIS, mô hình Machine Learning và embeddings, file `codegraph.json` **bắt buộc phải loại trừ các thư mục dữ liệu lớn và file nhị phân**:

```json
{
  "exclude": [
    "**/node_modules/**",
    "**/.venv/**",
    "**/__pycache__/**",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/data/raw/**",
    "**/data/fixtures/**",
    "**/*.geojson",
    "**/*.tif",
    "**/*.tiff",
    "**/*.pt",
    "**/*.bin",
    "**/*.onnx",
    "**/*.parquet",
    "**/*.csv",
    "**/.git/**",
    "**/docker_volumes/**"
  ]
}
```

---

## 3. Các Luồng Tra cứu Trọng yếu (Key Call Paths)

Khi sử dụng CodeGraph để phân tích mã nguồn AirSense AI:

1. **Luồng Hiển thị Bản đồ**:
   - `apps/web/components/MapLibreView.tsx` 
   - ➔ `apps/api/routers/maps.py` 
   - ➔ `packages/domain/geo/grid.py` 
   - ➔ `PostGIS ST_DWithin query`.
2. **Luồng Ingestion & Kiểm tra Dữ liệu**:
   - `workers/ingest/tasks.py` 
   - ➔ `packages/data_adapters/openaq.py` 
   - ➔ `packages/domain/quality/validator.py` 
   - ➔ `packages/domain/aqi/nowcast.py` 
   - ➔ `air_measurements table`.
3. **Luồng Agent & RAG Citation**:
   - `apps/api/routers/assistant.py` 
   - ➔ `packages/assistant/graph.py` 
   - ➔ `packages/assistant/tools/data_tools.py` 
   - ➔ `packages/knowledge/retrieval.py` (pgvector HNSW + FTS).
