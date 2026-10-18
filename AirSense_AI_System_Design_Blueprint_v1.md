| Tài liệu | Thông tin |
| --- | --- |
| Phiên bản | 1.0 — Draft để triển khai |
| Ngày | 18/10/2026 |
| Phạm vi | Web GIS + Data Platform + Forecasting + Agent/RAG |
| Định hướng | Local-first, API-first, modular, observable, scale-ready |
| Trạng thái | Kiến trúc đề xuất; chưa xác nhận chất lượng dữ liệu/benchmark |

Nguyên tắc lõi: **Forecast engine tạo số liệu; LLM chỉ truy xuất, tổng hợp và giải thích.** Mọi giá trị hiển thị cần provenance, timestamp và data-quality flag.

# AirSense AI — System Architecture & Engineering Blueprint


# Tóm tắt quyết định (Executive Summary)

AirSense AI là nền tảng web GIS để xem chất lượng không khí theo tọa độ, lịch sử, dự báo 1–24h, heatmap theo thời gian và trợ lý AI hỏi đáp có dẫn chứng. Tài liệu ưu tiên triển khai thực tế với chi phí kiểm soát được, hạn chế fine-tuning, chịu lỗi tốt và dễ tách thành dịch vụ khi quy mô tăng.

| Quyết định | Khuyến nghị |
| --- | --- |
| Kiểu kiến trúc | Modular monolith API + các worker bất đồng bộ; chỉ tách service khi có bằng chứng tải. |
| Bản đồ | MapLibre GL JS + tiles hợp lệ + PostGIS; Google Maps là tùy chọn thương mại. |
| Dự báo nền | CAMS qua Open-Meteo, luôn phân biệt với số đo thực tế tại trạm. |
| ML không fine-tune | Chronos-2 Small chạy local zero-shot ở chế độ shadow rồi mới nâng production nếu vượt baseline. |
| Spatial | CAMS background + hiệu chỉnh residual có điều kiện/độ phủ; không tô độ chính xác giả. |
| AI Assistant | LLM local 4B class + LangGraph orchestration + tool gọi API dữ liệu read-only. |
| RAG | Embedding multilingual + pgvector + PostgreSQL full-text + nguồn/citation theo trang. |
| Vận hành | Redis cache/queue, quan sát p95/p99, data-quality gate, source/provenance, error budgets. |

> **Không phải mô hình 1-trong-1** CAMS là sản phẩm dự báo khí quyển bên ngoài, không phải model local. MVP có 3 nhóm model local: forecasting (Chronos-2), LLM (assistant), embedding (RAG). Reranker là tùy chọn.


# 1. Phạm vi, giả định và các nguyên tắc


## 1.1 Mục tiêu và ngoài phạm vi

- Mục tiêu: giám sát nồng độ thực đo (nếu có), ước tính theo không gian, dự báo tương lai, bản đồ tương tác, cảnh báo và giải thích bằng tiếng Việt.
- MVP triển khai thử ở TP.HCM; chỉ công bố cấp khu vực khi dữ liệu và spatial backtest đủ tin cậy. Hỗ trợ mở rộng thành phố thông qua cấu hình.
- Không cam kết nồng độ chính xác ở từng phường/đường phố chỉ vì bản đồ có ô lưới nhỏ; phân giải hiển thị khác phân giải thông tin.
- Không sử dụng LLM để tính AQI, tính thống kê hay phát sinh dữ liệu đo; các bước đó do code định lượng và API dữ liệu phụ trách.
- Không cần fine-tune cho bản đầu, nhưng bắt buộc phải đánh giá, đo drift và chọn baseline/fallback phù hợp.


## 1.2 Vai trò người dùng

| Role | Quyền chính |
| --- | --- |
| Guest | Xem bản đồ, dữ liệu công khai, lịch sử, forecast, câu hỏi giới hạn. |
| User | Bookmark khu vực, cấu hình alert, lịch sử hỏi đáp nếu opt-in. |
| Analyst | Xem nguồn trạm, data-quality, so sánh model, xuất báo cáo phân tích. |
| Admin | Duyệt tài liệu RAG, quản lý source, khóa API, data-policy, cấu hình và vận hành. |


## 1.3 Quy tắc đúng đắn dữ liệu

- Tách observed (số đo), modeled (CAMS), estimated (spatial), forecast (dự báo) và unavailable (không có dữ liệu).
- Mọi bản ghi định lượng có timezone/timestamp UTC, nguồn, đơn vị, validity window, issued_at và quality flag.
- Chỉ tính VN_AQI khi đủ biến và đúng công thức/khung trung bình theo quy định; không đổi AQI của nhà cung cấp khác thành VN_AQI chỉ bằng tên.
- Không công bố dự báo như bằng chứng về nguồn gây ô nhiễm; gợi ý nguyên nhân là giả thuyết nếu không có dữ liệu phát thải.


# 2. Danh mục chức năng và tiêu chí chấp nhận

| ID / Module | Chức năng người dùng | Acceptance criteria |
| --- | --- | --- |
| F01 Map | Click/tìm kiếm/zoom tọa độ | Click trả location id và nhãn độ phân giải/nguồn. |
| F02 Current | AQI, PM2.5, PM10 và khí khác | Có mốc cập nhật, đơn vị, observed/estimated. |
| F03 Heatmap | Lớp ô nhiễm + time slider | Tile đúng forecast issue/time; no-data được thể hiện riêng. |
| F04 History | Đồ thị 24h/7d/30d | Thiếu giờ không tự biến thành 0. |
| F05 Forecast | Dự báo +1h/+6h/+24h | Có source/model/version/issued_at và failover. |
| F06 Spatial | Ước tính ngoài trạm | Ẩn/giảm độ chi tiết khi coverage yếu. |
| F07 Alerts | Theo ngưỡng, lịch chạy | Chống trùng, có trạng thái sent/suppressed. |
| F08 Compare | So sánh nhiều vùng | Cùng loại đo và mốc thời gian trước khi so sánh. |
| F09 AI Assistant | Hỏi đáp từ vị trí và dự báo | Dùng tool read-only; hiển thị nguồn và timestamp. |
| F10 RAG Docs | Giải thích chỉ số/quy định theo tài liệu | Có citation đến doc/version/trang hoặc nói thiếu nguồn. |
| F11 Preferences | Địa điểm quan tâm, cấu hình | Chỉ lưu tối thiểu; có quyền xóa dữ liệu. |
| F12 Ops Console | ETL/model/agent monitoring | Xem freshness, queue, lỗi, model backtests. |


# 3. Kiến trúc logic & ranh giới dịch vụ

Thiết kế theo hướng một repo (monorepo), các module domain tách rõ nhưng ban đầu deploy chung cho HTTP API. Worker forecast, ingest, indexing và LLM inference là process độc lập. Frontend không được gọi trực tiếp LLM, CAMS, OpenAQ hoặc database.

```text
                         WEB / MOBILE CLIENT
   Next.js + MapLibre + ECharts + Chat Streaming
                              |
                     CDN / Reverse Proxy
                              |
                FASTAPI APPLICATION / BFF
      +-----------------+----------------------+
      |  Map/History    | Alert / User / Admin |
      |  Forecast Read  | Agent Gateway        |
      +-----------------+----------------------+
            |                       |
   PostgreSQL/PostGIS          LangGraph Agent
    + pgvector + FTS           |      |      |
            |             Forecast RAG Docs  History
     Redis cache/queue         |      |      |
            |                 Tool/API gateway
   +--------+----------------------------------------+
   | ETL Worker | Forecast Worker | RAG Index Worker |
   +-----------------------------------------------+
           |             |              |
   OpenAQ/Open-Meteo  CAMS+Chronos     Docs/PDF/HTML
                           |
                 Local LLM (separate server)
```


## 3.1 Module boundaries

| Module | Trách nhiệm | Không được làm |
| --- | --- | --- |
| data-adapters | Gọi nguồn, chuẩn hóa, retries, rate-limit | Không xử lý LLM / tự sinh giá trị thiếu. |
| quality | Validate schema/range/timestamp/freshness | Không âm thầm xóa spikes hợp lệ. |
| geo | Resolve region/grid, tính aggregate | Không suy diễn độ phân giải vượt nguồn. |
| forecast | Batch predict, model routing, provenance | Không chạy trên HTTP click thông thường. |
| aqi | Tính toán theo quy tắc VN_AQI | Không dùng câu trả lời LLM để tính. |
| assistant | Route intent, tools, RAG, response | Không truy cập SQL hoặc HTTP tùy ý. |
| knowledge | Ingest doc, version/chunk, embed | Không trộn tài liệu chưa cấp quyền sử dụng. |
| api | Validation, auth, quotas, responses | Không chứa business rules khó kiểm thử. |


## 3.2 Luồng click bản đồ

1. Client click → lấy lat/lon/zoom/time/layer; debounce và hủy request cũ khi người dùng di chuyển nhanh.
2. API resolve tọa độ → tìm region_id/grid_id có phiên bản ranh giới; truy vấn materialized snapshot/cache theo ô.
3. Trả ngay current/history/forecast đã precompute + source labels; phần chart dài có thể fetch lazy.
4. Heatmap tile được lấy từ CDN/tile server theo {layer, valid_at, issued_at, z, x, y}.


# 4. Nguồn dữ liệu, chính sách và khả thi tại Việt Nam

| Nguồn | Vai trò | Lưu ý triển khai |
| --- | --- | --- |
| OpenAQ v3 | Trạm, phép đo, lịch sử | Có API key; giới hạn rate; phải kiểm chứng coverage địa phương. |
| Open-Meteo Weather | Dự báo thời tiết, future covariates | Kiểm tra timestamp chạy backtest: không dùng thời tiết “biết trước”. |
| Open-Meteo CAMS Global | Nền khí quyển, fallback | Nguồn ~45 km, 3h; không có độ chính xác cấp phường. |
| OSM/geoBoundaries | Tiles/đường, ranh giới | Tuân thủ tile use + giấy phép; cập nhật thay đổi hành chính. |
| Tài liệu chính thức | VN_AQI, hướng dẫn sức khỏe, quy trình | Đặt hiệu lực phiên bản/ngày ban hành, không tự suy ra hiệu lực pháp lý. |
| Google Maps/Air Quality (optional) | Provider thương mại | Kiểm tra chi phí + TOS caching/training/map display trước khi bật. |

> **Go/No-Go trước khi xây ML** Thử API trong thành phố mục tiêu: số trạm thực đo, số tháng lịch sử, độ liên tục theo pollutant, thời gian cập nhật và giấy phép dữ liệu. Nếu không đủ, vẫn phát hành dashboard CAMS nhưng phải giảm phạm vi tuyên bố.


## 4.1 ETL contracts

- Ingestion incremental theo watermarks; backfill idempotent bằng unique (provider, station, pollutant, observed_at).
- Có raw payload storage (object store hoặc JSONB theo retention), normalized measurements, transformation_version.
- Không mặc định cùng đơn vị CO/O3 giữa các nguồn; conversion có phương trình và điều kiện hợp lệ.
- Partition dữ liệu quan trắc theo thời gian; không dùng request lịch sử trực tiếp đến upstream mỗi lần người dùng click.
- Nhập dữ liệu tài liệu PDF/HTML riêng; chỉ tài liệu có license/nguồn đáng tin mới xuất hiện trong RAG production.


## 4.2 Ingestion Resilience & Chống ngắt kết nối API (API Fault-Tolerance)

Để đảm bảo việc thu thập dữ liệu từ OpenAQ, Open-Meteo, CAMS và các trạm đo nội địa (PAM Air/cảm biến địa phương) hoạt động liên tục 24/7 không bị gián đoạn hay mất mát:

1. **Circuit Breaker Pattern (Đóng - Mở - Bán mở)**:
   - Theo dõi tỷ lệ lỗi của từng Upstream API. Nếu gặp lỗi liên tiếp (HTTP 5xx, Timeout, 429) vượt ngưỡng 5 lần trong 1 phút, chuyển sang trạng thái `OPEN` trong 60 giây.
   - Khi `OPEN`: Tạm dừng gọi trực tiếp ra internet, kích hoạt chế độ Fallback ngay lập tức mà không để worker treo kết nối. Sau 60s chuyển sang `HALF-OPEN` để thử lại 1 request thăm dò.
2. **Exponential Backoff with Full Jitter**:
   - Khi request thất bại hoặc bị rate-limit 429: Thời gian chờ thử lại được tính theo công thức:
     $$T_{\text{sleep}} = \min(T_{\max}, T_{\text{base}} \times 2^{\text{attempt}}) \times \text{random}(0.5, 1.5)$$
   - Tránh hiện tượng "Thundering Herd" khi hàng loạt worker cùng retry một lúc làm sập upstream hoặc bị chặn IP.
3. **Token Bucket & Quota Pool**:
   - Quản lý ngân sách gọi API tập trung qua Redis: OpenAQ (giới hạn 100 req/min), Open-Meteo (10,000 req/day). 
   - Đặt rate limit chủ động ở phía client (Client-side Throttling), không bao giờ để worker tự do phát sinh request vượt trần API.
4. **Raw Data Staging (Landing Zone) & Checkpointing**:
   - Mọi response thô từ nhà cung cấp được ghi tức thời vào bảng `raw_ingest_payloads` (PostgreSQL JSONB / MinIO) kèm hash SHA-256 trước khi giải mã.
   - Lưu trữ watermark `last_successful_observed_at`. Nếu worker bị crash giữa chừng, lần chạy tiếp theo sẽ tiếp tục ngay từ watermark gần nhất (Resume-on-Failure).
5. **Dead-Letter Queue (DLQ) & Retry Sweep**:
   - Những payload bị lỗi schema hoặc dữ liệu dị thường (outliers vô lý) sẽ được đẩy vào DLQ `ingest_dead_letter`.
   - Một worker ngầm (`retry_sweep_worker`) sẽ định kỳ quét lại các bản ghi trong DLQ với tần suất thưa hơn (15 phút/lần) và phát cảnh báo đến Ops Console nếu một trạm bị lỗi quá 3 chu kỳ.
6. **Ma trận Fallback đa tầng (Multi-tier UI Fallback Matrix)**:
   - *Tầng 1 (Tối ưu)*: Dữ liệu thực đo `observed` mới nhất (< 2h).
   - *Tầng 2 (Mất kết nối ngắn)*: Dữ liệu thực đo gần nhất (< 6h), hiển thị nhãn cảnh báo độ trễ `source_lag` (ví dụ: "Cập nhật cách đây 3 giờ").
   - *Tầng 3 (Mất kết nối dài)*: Tự động chuyển vùng hiển thị sang `modeled` (CAMS) hoặc `estimated` (nội suy) kèm cờ cảnh báo `degraded`.
   - *Tầng 4 (Toàn bộ nguồn lỗi)*: Hiển thị trạng thái `unavailable` minh bạch, tuyệt đối không trả về số `0` hoặc làm trắng giao diện người dùng.


# 5. Data model, schema và index

| Table | Columns chính | Chỉ mục / constraints |
| --- | --- | --- |
| stations | id, provider, point, status, metadata | GiST(point); unique(provider, ext_id). |
| air_measurements | station_id, observed_at, pollutant, value, unit, flags | (station_id,pollutant,observed_at DESC); time partition. |
| weather_forecasts | grid_id, issued_at, valid_at, var, value | (grid_id,var,valid_at,issued_at). |
| forecast_runs | run_id, model_id, issued_at, dataset_version, status | (issued_at DESC); reproducibility hash. |
| forecast_grid | cell_id, valid_at, issued_at, value, provenance, uncertainty | (cell_id,valid_at,issued_at DESC). |
| regions | id, geometry, boundary_version | GiST(geometry); historical validity. |
| aqi_snapshots | location_id, observed_at, aqi_system, value, completeness | (location_id, observed_at DESC). |
| kb_documents | doc_id, title, uri, issuer, effective_date, status | doc version; SHA256, ACL. |
| kb_chunks | doc_id, page, chunk_text, embedding, tsv, version | HNSW(vector); GIN(tsv); ACL metadata. |
| agent_threads | thread_id, user_id, checkpoint/ref, expires_at | TTL and tenant-scoped access. |
| alerts | user_id, region_id, rule, last_sent, active | dedup_key unique per event. |


## 5.1 Data contracts — tối thiểu

```typescript
Measurement {
  location_id, pollutant, value, unit,
  observed_at, ingested_at, source,
  data_kind: observed|modeled|estimated,
  quality: good|degraded|invalid|unavailable
}
Forecast {
  location_id, pollutant, value, unit,
  issued_at, valid_at, horizon_hours,
  source: cams|chronos|hybrid,
  model_version, dataset_version,
  coverage_level, quality, uncertainty,
  spatial_resolution_km, warnings[]
}
RagCitation {
  document_id, title, page, section,
  version, effective_date, uri, quote_span
}
```


## 5.2 Spatial indexing

PostGIS GiST cho vị trí và polygon, ST_DWithin cho tìm trạm gần, ST_Intersects cho điểm thuộc vùng, BRIN/BTREE cho chuỗi thời gian. Với RAG: pgvector HNSW (khi corpus đủ lớn) kết hợp PostgreSQL full-text; kiểm tra lọc theo tenant trước khi truy xuất. Dùng EXPLAIN (ANALYZE, BUFFERS) để quyết định index, không tạo index theo cảm tính.


## 5.3 Quy chuẩn tính toán VN_AQI (Quyết định số 1459/QĐ-TCMT & QCVN 05:2023)

Để đảm bảo tính pháp lý và độ chính xác khoa học tại Việt Nam, module `packages/domain/aqi` tuân thủ nghiêm ngặt:
1. **Thuật toán NowCast cho PM2.5 và PM10**:
   - Không dùng nồng độ tức thời của 1 giờ đơn lẻ để kết luận AQI ngày.
   - Trọng số $w = \min(C) / \max(C)$ trong chuỗi 12 giờ gần nhất (nếu $w < 0.5$, đặt $w = 0.5$).
   - Nồng độ NowCast: $C^* = \frac{\sum_{i=1}^{12} w^{i-1} C_i}{\sum_{i=1}^{12} w^{i-1}}$.
2. **Khung thời gian trung bình theo chất ô nhiễm**:
   - $PM_{2.5}, PM_{10}$: Trung bình trượt 24h hoặc NowCast 12h.
   - $O_3$: Trung bình trượt 8h (cho ban ngày) và 1h (cho cảnh báo đỉnh).
   - $NO_2, SO_2, CO$: Trung bình 1h và 24h.
3. **Phân đoạn nồng độ (Breakpoints)**: Áp dụng bảng ngưỡng giới hạn quy định tại QCVN 05:2023/BTNMT (thay thế QCVN 05:2013). Khi một trạm thiếu các thông số phụ, AQI được tính theo chất ô nhiễm có chỉ số cao nhất kèm cờ `completeness_flag` (vd: `ONLY_PM25`).


# 6. Forecasting engine — no fine-tuning first


## 6.1 Các nhánh mô hình

| Branch | Engine | Quyết định |
| --- | --- | --- |
| Baseline production | CAMS Global | Luôn sẵn nếu upstream hợp lệ; nhãn modeled/forecast. |
| Challenger #1 (Tabular GBDT) | LightGBM + Weather Covariates | Siêu nhẹ, chạy CPU, tận dụng độ trễ (lags) + thời tiết (nhiệt độ, độ ẩm, gió) từ Open-Meteo. |
| Challenger #2 (Deep Foundation) | Chronos-2 Small 28M local | Dự báo chuỗi PM2.5 khi đủ lịch sử; không fine-tune, chạy dạng Shadow. |
| Optional spatial hybrid | CAMS + residual correction | Chỉ bật khi spatial holdout cải thiện rõ so với baseline. |


## 6.2 Routing logic / quality gates

1. Đọc availability của tất cả source và xác định lịch sử có đủ mới/đều hay không.
2. Kiểm tra timestamp/đơn vị/range; khôi phục missing timestamps và ghi NaN có mask; không điền 0.
3. Tính forecast CAMS theo valid_time; tính Chronos trong worker, không chặn click API.
4. So sánh champion/challenger trên rolling backtest, sai số spike và spatial held-out stations.
5. Nếu model AI chưa được kiểm chứng hoặc quality gate không đạt → publish CAMS baseline; nếu không có nguồn tin cậy → unavailable.
6. Lưu forecast snapshot bất biến theo issued_at + model_version; không overwrite lịch sử forecast gây leakage.


## 6.3 Không thể “bảo đảm” độ phân giải

CAMS Global có độ phân giải nguồn khoảng 45 km và bước thời gian 3 giờ. Heatmap lưới mịn chỉ là hình thức hiển thị/estimate, không tăng thông tin gốc. Với spatial residual correction: giới hạn ảnh hưởng theo khoảng cách và chất lượng, không extrapolate vô hạn. Kiểm thử giữ lại trạm theo không gian (leave-station-out) và báo cáo sai số theo khoảng cách đến trạm.


## 6.4 Model evaluation

| Đánh giá | Cách thực hiện |
| --- | --- |
| Time split | Rolling-origin backtest; không random split time series. |
| Weather leakage | Chỉ dùng future covariates đã biết tại issued_at; lưu weather forecast vintage. |
| Metrics | MAE/RMSE/bias ở 1h, 6h, 12h, 24h; spike-event recall; uncertainty coverage. |
| Promotion | Challenger chỉ thành champion nếu vượt baseline ổn định trên nhiều khoảng thời gian và trạm. |
| Monitoring | Residual drift, data lag, failure percentage, CPU/GPU utilization. |


# 7. AI Assistant / Agent — kiến trúc LangGraph


## 7.1 Năng lực Agent

- Query data: “PM2.5 tại vị trí tôi click hôm nay là bao nhiêu?” → gọi tool get_current/get_history.
- Explain forecast: “Vì sao ngày mai mức ô nhiễm dự báo tăng?” → lấy forecast + dữ liệu khí tượng, nói rõ đây là tương quan/giải thích mô hình, không khẳng định nguyên nhân.
- Read regulations: “VN_AQI 151–200 có ý nghĩa gì?” → truy xuất tài liệu theo RAG và dẫn văn bản/trang.
- Mixed query: “Dự báo khu tôi ở và khuyến nghị theo quy định?” → kết hợp data tool + tài liệu RAG; phân biệt forecast và khuyến cáo văn bản.
- Comparison: “Khu A và B nơi nào ô nhiễm hơn 24h qua?” → dùng compare API; LLM chỉ tổng hợp kết quả đã tính.


## 7.2 Graph có định tuyến rõ ràng

```text
START
  -> input_guard (auth, rate, context, coordinate)
  -> intent_route (rule-first / cheap classifier)
       |-- DATA    -> deterministic_data_tools --+
       |-- DOCS    -> kb_retriever ------------+ |
       |-- MIXED   -> parallel(DATA, DOCS) --+ | |
       |-- OTHER   -> clarify_or_safe_refusal | | |
  -> evidence_join (timestamps, source IDs, citations)
  -> grounded_generation (local LLM, bounded context)
  -> answer_validator (numbers, citations, unsafe claims)
  -> stream_response + trace
END
```


## 7.3 Tools allowlist và contract

| Tên tool | Tham số | Trả về |
| --- | --- | --- |
| get_air_quality | lat, lon, at_time? | Numerical observation; freshness/source. |
| get_forecast | lat, lon, horizon, pollutant | Forecast + uncertainty + provenance. |
| get_history | region_id/coords, start,end,aggregate | Time-series + coverage. |
| compare_regions | region_ids, pollutant, time_window | Server-computed comparable metrics. |
| search_documents | question, filters, top_k | Chunks + page/source/version. |
| get_document_excerpt | doc_id,page/section | Trusted quoted passage. |
| get_alert_policy | region_id, pollutant | Read-only rules. |

Tất cả tool read-only ở MVP. Cấm arbitrary SQL, file system, open URL tùy ý và gọi webhook ngoài. Pydantic xác minh tham số; kiểm tra phạm vi thời gian/tọa độ, quotas, tenant và kích thước output. Nếu phải gửi thông báo hoặc tạo alert về sau, yêu cầu xác nhận người dùng ở hành động ghi dữ liệu.


## 7.4 LLM local và framework

| Thành phần | Khuyến nghị | Lý do |
| --- | --- | --- |
| LLM local | Qwen3-4B-Instruct-2507 (candidate, quantized) | Đa ngôn ngữ, license Apache-2.0; test tiếng Việt/tool use trước production. |
| Inference | Ollama cho dev; vLLM khi GPU/concurrency cần scale | Giao diện local/OpenAI-compatible, dễ đổi provider. |
| Orchestration | LangGraph StateGraph + Postgres checkpointer | Branching, stateful, checkpoint, retries có giới hạn. |
| LangChain | Tool adapter, loader, splitter, retriever | Dùng khi hữu ích, không bắt buộc cho mọi node. |
| Output | JSON schema hoặc Pydantic, streaming SSE | Frontend update token theo thời gian. |


## 7.5 Response policy

Assistant phải xuất hiện nguồn dữ liệu và giờ hợp lệ cho mỗi chỉ số; với tài liệu xuất [tài liệu, phiên bản, trang]. Khi thiếu bằng chứng, nói “chưa đủ dữ liệu” và gợi ý truy vấn có thể làm. Câu hỏi về sức khỏe chỉ đưa hướng dẫn chung đã kiểm chứng, không chẩn đoán hay khuyên xử lý y tế cá nhân.


## 7.6 Kiểm soát Ngữ cảnh & State Pruning cho Local LLM 4B

Mô hình nhỏ chạy local (Qwen 4B) rất nhạy cảm với việc tràn ngữ cảnh (context overflow) và dễ suy giảm khả năng bám sát hướng dẫn (instruction drift):
1. **Bounded Message History**: LangGraph checkpointer chỉ truyền tối đa 3-4 lượt trao đổi (turns) gần nhất vào prompt sinh lời; các tin nhắn cũ hơn tự động nén thành bản tóm tắt trạng thái ngắn (summary state).
2. **Strict Evidence Budget**: 
   - Dữ liệu số từ tools: Giới hạn tối đa 500 tokens (chỉ truyền kết quả aggregate đã tính, không đổ toàn bộ raw measurements array vào prompt).
   - Dữ liệu RAG: Giới hạn tối đa 3 chunks liên quan nhất ($\le 1,200$ tokens).
   - Tổng context gửi sang local LLM luôn được chặn cứng dưới 2,500 tokens để giữ tốc độ phản hồi $\le 4$s TTFT và triệt tiêu hallucination.


# 8. RAG document knowledge base


## 8.1 Pipeline nhập tài liệu

1. Nguồn được duyệt: quy định VN_AQI, hướng dẫn môi trường, giải thích pollutant, tài liệu thống kê/methodology; lưu URI/license/issuer/effective_date.
2. Extract text từ PDF/HTML/DOCX có giữ page map, bảng và chú thích; trường hợp scan OCR thủ công hoặc tuyến riêng có QA.
3. Chunk theo heading/đoạn và overlap hợp lý; metadata bắt buộc doc_id/version/page/section/ACL.
4. Sinh embeddings bằng BGE-M3 multilingual local (candidate), lưu pgvector, tạo full-text tsvector.
5. Hybrid retrieval: dense + keyword/BM25-like → Reciprocal Rank Fusion → optional reranker nếu đo được cải thiện.
6. Filter phiên bản còn hiệu lực, quyền truy cập và tiếng Việt; trả top passages có dẫn nguồn, hạn chế context token.
7. Khi tài liệu thay đổi, reindex delta; giữ version để truy vết câu trả lời đã sinh trước đó.


## 8.2 RAG vs Tool-data: quy tắc bắt buộc

| Loại câu hỏi | Nguồn đúng | Không dùng |
| --- | --- | --- |
| “AQI hiện tại bao nhiêu?” | API dữ liệu/forecast đã kiểm chứng | RAG PDF để đo chỉ số. |
| “AQI 151–200 là mức gì?” | RAG tài liệu VN_AQI + rule engine | LLM tự đoán định nghĩa. |
| “Tại sao forecast tăng?” | API forecast/weather + RAG kiến thức nền | Khẳng định nguyên nhân khi thiếu dữ liệu. |
| “So sánh vùng A và B?” | Compare API tính server-side | LLM tự nhẩm từ chuỗi thô. |


## 8.3 Citation và evaluation

Câu trả lời tài liệu bắt buộc có citation mở được (doc_uri, title, edition, page, highlighted passage). RAG eval gồm retrieval recall@k, context precision, faithfulness, answer relevance, tỷ lệ citation hợp lệ, test prompt injection, câu hỏi không có trong tài liệu, bản tài liệu đã hết hiệu lực.


# 9. API Design — contract v1

| Method / endpoint | Request | Kết quả / lỗi |
| --- | --- | --- |
| GET /v1/locations/resolve | lat,lon | grid_id, region_id, support_level; 422/404. |
| GET /v1/air/current | lat,lon,pollutants | values + observed/estimated + freshness. |
| GET /v1/air/history | lat,lon,from,to,interval | series, missing_rate, source coverage. |
| GET /v1/air/forecast | lat,lon,horizons,pollutant | snapshots, valid_at, issued_at, model_id. |
| GET /v1/regions/{id}/summary | time_window,pollutant | area-level aggregate and coverage. |
| GET /v1/maps/{layer}/{z}/{x}/{y} | valid_at,issued_at? | tile bytes + CDN cache hints. |
| POST /v1/assistant/chat | session_id,message,location_ctx | SSE tokens + citations + tool provenance. |
| POST /v1/alerts | region_id,threshold | Authenticated create with idempotency key. |
| GET /v1/ops/health | admin auth | source lag, queue age, forecast freshness. |


## 9.1 Response envelope / semantics

```json
{
  "data": {
    "location": {"lat": 10.8231, "lon": 106.6297},
    "pollutant": "pm25",
    "value": null,
    "unit": "ug/m3",
    "kind": "unavailable",
    "issued_at": null,
    "valid_at": null,
    "source": null,
    "quality": "no_data",
    "spatial_resolution_km": null,
    "warnings": ["NO_TRUSTWORTHY_SOURCE"]
  },
  "meta": {"schema_version": "1.0", "request_id": "..."}
}
```

Chọn HTTP 200 kèm trạng thái unavailable cho một kết quả thiếu dữ liệu hợp lệ; dùng 4xx cho input sai/không đủ quyền; 5xx cho lỗi hệ thống. Đừng trả 0 cho missing. Các endpoint danh sách giới hạn max time range, max locations và payload size.


# 10. Error handling, edge cases và degradation

| Lỗi / tình huống | Ứng xử đúng | Theo dõi |
| --- | --- | --- |
| Sai lat/lon, thời gian vượt phạm vi | 422 + validation message | invalid_request_rate |
| Nhầm đơn vị / pollutant âm | Quarantine, ghi reason, không đưa vào model | invalid_measurement_rate |
| Mất liên tiếp nhiều giờ | Gắn mask, fallback CAMS khi vượt quality gate | missing_rate_by_station |
| Upstream 429/timeout | Backoff+jitter, circuit-breaker, cache valid | upstream_error_rate |
| Nguồn chậm 2–24 giờ | Có timestamp/stale flag, không hiển thị như real-time | source_lag |
| Không có trạm gần | CAMS broad-area + nhãn resolution | spatial_coverage |
| Chronos OOM/NaN/timeout | Không publish AI; giữ baseline, log run | forecast_failure_rate |
| Outdated doc / OCR lỗi | Skip/review, reindex version | kb_ingest_error |
| Prompt injection trong tài liệu | Treat retrieved content as untrusted; no tools from docs | injection_test_pass |
| LLM hallucination số liệu | Numeric validator dùng tool result; fallback template | unsupported_numeric_claim |
| Chat mất kết nối | SSE reconnect/session checkpoint, bounded retries | agent_disconnects |
| Thông báo lặp | dedup key + cooldown + idempotent worker | duplicate_alert_rate |


# 11. Performance, latency & speed — ưu tiên có đo đạc

Đối với UI bản đồ, latency chủ yếu đến từ tile, API query, mạng và tải dữ liệu. Đối với Agent, latency chủ yếu từ LLM token generation, retrieval, số bước graph và tool calls. Không trộn hai đường phục vụ này trong cùng request đồng bộ.


## 11.1 SLO khởi điểm (chưa benchmark)

| Đường truy cập | SLO p95 đề xuất | Biện pháp |
| --- | --- | --- |
| Map tile cached | < 300 ms server/CDN response | Prebuilt tile, CDN, zoom-aware LOD. |
| Map click detail warm | < 500 ms end-to-end API | Redis, indexed grid cell, concise payload. |
| History 7 ngày | < 800 ms API | Time-index, downsample, aggregate bucket. |
| Forecast read | < 500 ms API | Precompute hourly snapshots; never infer per click. |
| Agent time-to-first-token | < 4 s với GPU phù hợp | SSE streaming, warm LLM, parallel tools. |
| Agent full answer | < 12 s với GPU phù hợp | Bounded graph (≤2 tool rounds), short prompts. |
| Availability API | 99.5% mục tiêu ban đầu | Fallback, readiness probes, backup. |

Các SLO chỉ là mục tiêu engineering, phải được hiệu chỉnh theo máy triển khai, tải thực tế và network. CPU-only LLM local có thể không đạt SLO chatbot; cho phép hiển thị phản hồi chậm, rút ngắn output hoặc tách GPU inference.


## 11.2 Cache policy & Cơ chế Lưu Cục bộ (Client-Side Local Persistence)

Hệ thống kết hợp **Server/CDN Caching** và **Client Local Storage (IndexedDB + Service Worker)** để đạt hiệu năng hiển thị tức thì (< 50ms), tiết kiệm băng thông và tránh gọi lại API không cần thiết khi người dùng truy cập lại ứng dụng:

| Tầng lưu trữ | Dữ liệu | Nơi lưu / Khóa cache | Chiến lược & TTL |
| --- | --- | --- | --- |
| **Client Local DB** | Trạm, AQI gần nhất, history 24h, forecast, bookmark | **IndexedDB (Dexie.js)** trên trình duyệt | **Stale-While-Revalidate (SWR)**: Mở app hiển thị ngay từ IndexedDB (< 50ms); gửi request ngầm với `If-Modified-Since` / `ETag`. Server trả HTTP 304 -> giữ nguyên local (0 byte mạng). |
| **Client Asset/Tiles** | Vector tiles nền bản đồ, font Be Vietnam Pro | **CacheStorage (Service Worker)** | **Cache-First**: TTL 7 ngày; mở lại bản đồ không cần fetch lại các tile đã duyệt. |
| **Backend Hot Cache** | Current measurement snapshot | Redis: `curr:{grid_or_station_id}` | 5–15 phút; hết hạn tự động theo source timestamp. |
| **Backend History** | Chuỗi số đo theo giờ/ngày | TimescaleDB / Redis | 1–24 giờ; tự động nén (columnar compression). |
| **Forecast Precompute** | Lưới dự báo CAMS / LightGBM | Redis + PostgreSQL | Bất biến theo `(model_id, issued_at, valid_at)`. |
| **CDN Static Tiles** | Raster / MVT overlays diện rộng | CDN / MinIO S3 | Immutable theo `run_id`; invalidation qua manifest. |
| **RAG Embeddings** | Vector tài liệu pháp quy | PostgreSQL pgvector HNSW | Bất biến; chỉ reindex delta khi có văn bản mới ban hành. |
| **Chat Answer** | Câu hỏi kiến thức/hướng dẫn chung | Redis: `chat:{query_hash}` | 1–7 ngày; chỉ cache câu hỏi không nhạy cảm và không chứa vị trí cá nhân. |


## 11.3 Tối ưu thực tế

- Map Heatmap Rendering (Client-side WebGL): Thay vì render dynamic raster tiles từ backend làm quá tải CPU/RAM, backend chỉ trả GeoJSON lưới điểm thô/trạm kèm giá trị ô nhiễm. MapLibre GL JS sử dụng layer `heatmap` trực tiếp trên GPU client với WebGL shader. Đối với lớp phủ CAMS quy mô lớn, backend sinh trước static GeoTIFF/MVT qua worker và lưu trên MinIO/CDN, không render theo từng click/zoom.
- MapLibre: tải vector/raster tiles theo viewport, không gửi toàn bộ GeoJSON thành phố; zoom-based level of detail, simplify polygon.
- Frontend: debounce map move 200–400ms, AbortController, request dedup, lazy-load chart, ECharts data decimation.
- Backend: async IO cho provider calls, connection pool PostgreSQL, pagination, compression và ETag.
- PostgreSQL & TimescaleDB extension: GiST cho geo, BTREE/BRIN cho time, hypertables/partition measurements theo tháng, continuous aggregates theo giờ/ngày để phục vụ history endpoint siêu tốc.
- Forecast: batch/chunk inference, model load 1 lần, giới hạn concurrency, forecast grid store + immutable issuance.
- Agent: route intent bằng rules trước LLM, cache embeddings, retrieve top-k nhỏ, song song data/RAG, giới hạn vòng tool.
- SSE token streaming; không chạy OCR/index/ML train trong request HTTP; dùng queue/worker độc lập.
- Chỉ thêm reranker, fine-tune, microservices, Kafka hoặc GPU scaling sau khi benchmark xác nhận bottleneck.


# 12. Observability, quality và vận hành

| Pillar | Metrics & tools |
| --- | --- |
| Logs | Structured JSON + request_id, run_id; redact input nhạy cảm. |
| Metrics | Prometheus/Grafana; RPS, p50/p95/p99, error rate, queue age, cache hit. |
| Traces | OpenTelemetry spans API→DB→tool→LLM; sampling, no raw secrets. |
| Data quality | Completeness, freshness, range errors, source drift per station. |
| Forecast quality | MAE by horizon/station, residual bias, interval coverage, promotion gate. |
| RAG/Agent | Retrieval recall, citation coverage, groundedness, tool errors, tokens/sec. |
| Alerting | Notification on upstream outage, stale data, tile error, LLM saturation. |


## 12.1 Failure budgets & rollback

Forecast model và Agent có version, feature flags và canary rollout. Mọi run lưu issue time, input dataset hash và artifact version. Nếu metric thoái hóa → rollback bằng flag tới baseline CAMS hoặc chuyển Agent về template/data-only mode mà không làm bản đồ sập.


# 13. Security, privacy, compliance

- HTTPS/TLS, CORS allowlist, security headers, secrets trong environment/secret manager; không đưa API key vào bundle frontend.
- JWT/session auth, RBAC cho user/analyst/admin; policy theo tenant nếu mở rộng B2B.
- Rate limit và token quota cho Chat, upload KB, Map search; max tokens, tool rounds và request timeout.
- Chỉ expose tool read-only, sanitize params, không chạy SQL do LLM tạo, chặn SSRF/untrusted URLs.
- Retrieved docs/prompt người dùng là dữ liệu không tin cậy; prompt-injection tests + citation-based output validation.
- Knowledge corpus có provenance, bản quyền và ACL; review thủ công đối với tài liệu pháp quy nhạy cảm/version mới.
- User location: chỉ dùng vị trí do người dùng chọn/cho phép; hạn chế lưu tọa độ chính xác và đặt chính sách retention/deletion.
- Không dùng hướng dẫn sức khỏe dạng chẩn đoán cá nhân; thể hiện cảnh báo dựa trên dữ liệu có nguồn.


# 14. Deployment topology và scale-up


## 14.1 Giai đoạn MVP (1 host hoặc 2 host)

```yaml
Docker Compose
  - nginx / traefik + frontend
  - fastapi-web (2+ workers after load test)
  - postgres + postgis + pgvector
  - redis (cache + queue)
  - data-ingest worker
  - forecast worker (Chronos-2 preloaded)
  - rag-index worker
  - agent-worker + local-llm server (CPU/GPU optional)
  - prometheus + grafana (can start later)
```

Dùng chung một repo với các package domain; môi trường dev có thể chạy không cần GPU (LLM nhỏ/CPU), nhưng tải chatbot thật cần benchmark. PostgreSQL và RAG dùng chung instance ở MVP, có schema/bảng tách biệt, chưa cần hai vector database.


## 14.2 Scale theo bottleneck

| Nếu nghẽn ở | Bước mở rộng |
| --- | --- |
| Read API / map clicks | Nhiều API replicas sau load balancer, Redis hot cache, CDN tiles. |
| Historical DB queries | Read replica, partition, rollup, connection pool, retention. |
| Map tile rendering | Pre-generated tiles + object storage/CDN, tile server độc lập. |
| LLM token generation | Dedicated GPU inference pool, quantization, dynamic batching, concurrency caps. |
| Forecast worker | Batch partition theo thành phố/station; worker replicas idempotent. |
| RAG corpus/index | Separate worker, HNSW tuning, chunk cache, eventual consistency. |
| Cross-city growth | Region-based sharding/caching only after throughput proves need. |


## 14.3 Tài nguyên dự kiến và giới hạn

Không chốt cấu hình RAM/VRAM khi chưa đo. Các model local có overhead từ quantization, context length và concurrency; đề xuất kiểm thử 3 profile: CPU dev, GPU 1-instance và scaled GPU inference. Cấu hình cụ thể cần lấy từ benchmark tải ở phần 16. Tránh đặt con số phần cứng “đủ” tuyệt đối cho production.


# 15. Mã nguồn, maintainability và kiểm soát thay đổi

```text
airsense-ai/
  apps/web/                     # Next.js UI + map + chat
  apps/api/                     # FastAPI endpoints / auth / versioned API
  packages/domain/              # business rules: AQI, QC, geo, contracts
  packages/data_adapters/       # openaq, openmeteo, boundaries
  packages/forecasting/         # Chronos adapter, CAMS, routing, backtest
  packages/assistant/           # LangGraph nodes, tool registry, prompts
  packages/knowledge/           # parser/chunker/embed/retrieval
  workers/ingest/
  workers/forecast/
  workers/knowledge/
  infra/docker/ infra/migrations/ infra/observability/
  tests/unit/ tests/integration/ tests/e2e/ tests/load/
  docs/adr/ docs/api/ docs/runbooks/
```


## 15.1 Quy ước kỹ thuật

- Contracts-first: OpenAPI + Pydantic schemas, version `/v1` và migration strategy trước khi thay payload.
- Adapter/protocol cho ForecastModel, LLMProvider, EmbeddingProvider và AirQualityProvider; thay implementation không ảnh hưởng domain.
- Type hints, Ruff, mypy (mức phù hợp), Black; pyproject + lockfile; eslint/prettier cho frontend.
- Unit tests cho VN_AQI, đơn vị, timezones, quality gates; integration tests với upstream fixtures/mock.
- Architecture Decision Records (ADR) lưu vì sao chọn MapLibre/Chronos/LLM/GIS, điều kiện xem xét lại.
- CI: lint→unit→integration→security scan→build container→smoke test; release có rollback.


# 16. Test plan và benchmark trước production

| Nhóm test | Kịch bản / pass condition |
| --- | --- |
| Data QA | Missing 0/10/50/100%, âm, unit mismatch, duplicate, out-of-order; không phát số đo giả. |
| Model backtest | Rolling split + unseen stations; không leakage; AI model chỉ promote khi vượt CAMS. |
| Map GIS | Click ngoài bounds, ranh giới mới, zoom, no-data tiles, nhiều lớp dữ liệu. |
| Agent unit | Tool schema, max retries, auth, route intents và deterministic numeric response. |
| RAG eval | Có/không tài liệu, xung đột version, bilingual Vietnamese, invalid page citation. |
| Security | Prompt injection, SQLi, malicious URLs, multi-tenant ACL, excessive tokens, PII. |
| Performance | k6/Locust mixed load: 80% map, 15% history, 5% chat; tăng dần concurrency. |
| Disaster | DB restart, Redis outage, API 429, LLM OOM, worker crash; hệ thống degraded đúng. |


## 16.1 Benchmark đo cụ thể

1. Chuẩn hóa dataset test và thiết bị đo; ghi mẫu tải: city size, tile count, số trạm, context length, số người dùng đồng thời.
2. Ghi p50/p95/p99 latency từng endpoint, DB execution plan, cache hit, queue wait, resource CPU/RAM/GPU.
3. Test chatbot: time-to-first-token, tokens/sec, tool calls/request, tổng thời gian, citation coverage.
4. Do spike test và soak test ít nhất 30–60 phút trong môi trường gần production, kiểm tra memory leak.
5. Ra quyết định scale bằng threshold đo được, không giả định microservices hoặc GPU luôn nhanh hơn.


# 17. Roadmap theo milestone và Definition of Done

| Phase | Deliverables | Exit gate |
| --- | --- | --- |
| 0 — Data feasibility | Data inventory + license matrix + station coverage TP.HCM | Có nguồn dữ liệu được phép + cách đánh dấu no-data. |
| 1 — Map/Data MVP | Next.js, MapLibre, click, history, QC, PostGIS, tile manifest | Map và chart load nhanh, đầy đủ source/time labels. |
| 2 — Forecast | CAMS baseline, Chronos shadow, backtest, quality router | Sai số được công bố; robust fallback. |
| 3 — Knowledge RAG | Corpus approved, embedding, FTS+vector, page citations | Retrieval/citation eval đạt tiêu chí nội bộ. |
| 4 — Assistant/Agent | LangGraph, read-only tools, LLM local, SSE, guarded answer | Không bịa số; test prompt-injection & timeout. |
| 5 — Production hardening | SLO dashboards, load test, rate-limits, backup, runbook | Release có rollback, incident response và monitoring. |


## 17.1 Must-have / nice-to-have

MVP bắt buộc: hiện tại/lịch sử/dự báo nền, map, provenance, backend API, data quality, assistant trả lời bằng tool + citations. Phase sau: spatial residual verified, multi-region area comparison, alerts, multilingual, reranker, custom temporal model fine-tuning nếu có ROI.


# 18. Quyết định mở và rủi ro

| Mục cần khóa | Tại sao quan trọng | Chủ trì |
| --- | --- | --- |
| Coverage OpenAQ/địa phương | Quyết định khả năng train/hiệu chỉnh spatial | Data Engineering |
| License tài liệu và AQ provider | Quyết định caching, redistribution, fine-tune allowed | Product/Legal |
| Ranh giới VN hành chính | Map vùng và so sánh lịch sử cần nhất quán | GIS |
| Cấu hình host & concurrency | Quyết định latency local LLM và tính khả thi SLO | DevOps/ML |
| LLM tiếng Việt evaluation | Giải thích được nhưng không bịa số/nguồn | AI/QA |
| AQI rules version | Tránh nhầm VN_AQI với US AQI | Domain owner |
| Uncertainty UI | Tránh cảm giác chính xác giả từ heatmap | UX/ML |


# 19. Checklist triển khai đầu tiên

1. Test 3 nguồn API ở tọa độ mục tiêu; xuất báo cáo completeness, rate limit, license.
2. Tạo `docker compose` gồm PostgreSQL/PostGIS/pgvector, Redis, API và frontend.
3. Định nghĩa data contract & migration đầu tiên; lưu `observed/modelled/estimated/forecast` riêng.
4. Xây ingestion incremental + quality validator + dataset freshness dashboard.
5. Xây MapLibre click + overlay trạm + chart history + heatmap CAMS nhãn resolution.
6. Xây forecast worker CAMS; thêm Chronos shadow, rolling-backtest trước khi hiển thị AI.
7. Ingest 10–20 tài liệu chính thức có metadata, làm hybrid RAG + dẫn trang.
8. Bổ sung LangGraph Agent read-only tools, grounded response JSON/SSE.
9. Test edge cases và benchmark p95 theo workload; ghi ADR và runbook.


# 20. Tài liệu tham khảo chính thức (đã kiểm tra 18/10/2026)

LangGraph — Overview: https://docs.langchain.com/oss/python/langgraph/overview

LangChain — Retrieval/RAG: https://docs.langchain.com/oss/python/deepagents/retrieval

LangGraph persistence & checkpoints: https://langchain-ai.github.io/langgraph/concepts/durable_execution/

Amazon Chronos — forecasting models: https://github.com/amazon-science/chronos-forecasting

Chronos-2 Small — model card: https://huggingface.co/autogluon/chronos-2-small

OpenAQ API docs & rates: https://docs.openaq.org/using-the-api/rate-limits

Open-Meteo Air Quality / CAMS: https://open-meteo.com/en/docs/air-quality-api

Open-Meteo terms: https://open-meteo.com/en/terms

MapLibre docs: https://maplibre.org/maplibre-gl-js/docs/

MapLibre large data guide: https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/large-data.md

PostGIS documentation: https://postgis.net/docs/using_postgis_dbmanagement.html

pgvector documentation: https://github.com/pgvector/pgvector

OpenTelemetry Python: https://opentelemetry.io/docs/languages/python/

Qwen3-4B-Instruct-2507 model card: https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507

BGE-M3 model card: https://huggingface.co/BAAI/bge-m3

Ghi chú: SLO/TTL/ngưỡng gate là **mục tiêu hoặc cấu hình đề xuất**, chưa phải kết quả benchmark. API, license và chính sách nhà cung cấp có thể thay đổi; cần rà lại trước khi thương mại hóa.
