---
name: airsense-forecasting-ml
description: "Quy chuẩn huấn luyện, backtest và định tuyến dự báo ô nhiễm không khí: LightGBM GBDT tabular baseline, Chronos-2 Small foundation zero-shot, CAMS atmospheric fallback, chống rò rỉ dữ liệu khí tượng (weather leakage) và leave-station-out spatial evaluation."
---

# AirSense AI — Time-Series Forecasting & ML Skill

Kỹ năng chuyên sâu về **Dự báo chuỗi thời gian ô nhiễm không khí** ($PM_{2.5}, PM_{10}, AQI$). Hướng dẫn triển khai các mô hình Machine Learning thực dụng, quy trình đánh giá nghiêm ngặt chống rò rỉ dữ liệu (data leakage) và cơ chế định tuyến thông minh giữa Baseline và Challenger.

---

## 1. Triết lý ML: "Pragmatic & Parsimonious First"

1. **LightGBM / GBDT là Challenger hàng đầu**:
   - Trước khi nghĩ tới Fine-tuning hay Deep Learning phức tạp, mô hình dạng cây quyết định (LightGBM) với các đặc trưng độ trễ (lag features: 1h, 3h, 6h, 12h, 24h) kết hợp biến ngoại sinh khí tượng (nhiệt độ, độ ẩm, tốc độ gió, áp suất từ Open-Meteo) là giải pháp nhẹ nhất, nhanh nhất và khó bị đánh bại nhất trên dữ liệu trạm hạn chế.
2. **Chronos-2 Foundation Model ở chế độ Shadow**:
   - Sử dụng mô hình `Chronos-2 Small (28M)` ở chế độ zero-shot hoàn toàn.
   - Chạy song song trong worker ngầm (Shadow mode) để tích lũy dữ liệu dự báo đối sánh với LightGBM và CAMS.
3. **CAMS Atmospheric Model là chốt chặn cuối cùng (Fallback)**:
   - Khi dữ liệu trạm bị đứt quãng hoặc mô hình AI gặp lỗi (NaN, OOM, timeout), luôn fallback về CAMS Global của Open-Meteo kèm nhãn `modeled`.

---

## 2. Quy tắc Bất biến Chống Rò rỉ Dữ liệu (No Leakage)

1. **Tuyệt đối không dùng Random Train/Test Split**:
   - Dữ liệu chuỗi thời gian bắt buộc phải dùng **Rolling-origin Backtest** (hoặc TimeSeriesSplit). Dữ liệu kiểm thử luôn nằm sau dữ liệu huấn luyện theo trục thời gian.
2. **Weather Vintage Leakage**:
   - Khi dự báo ô nhiễm cho tương lai $+t$ giờ, chỉ được sử dụng dữ liệu thời tiết **dự báo (weather forecast)** có sẵn tại mốc $T_{\text{issued}}$, tuyệt đối không dùng thời tiết thực đo trong tương lai ($T + t$) để dự báo ô nhiễm.
3. **Spatial Holdout (Leave-Station-Out)**:
   - Để kiểm tra khả năng nội suy không gian của mô hình, luôn tách riêng ít nhất 1-2 trạm hoàn toàn không cho mô hình nhìn thấy trong quá trình fit để đo sai số theo khoảng cách địa lý.

---

## 3. Tiêu chí Đưa mô hình lên Production (Promotion Gate)

Một mô hình Challenger (LightGBM hoặc Chronos-2) chỉ được nâng hạng thành **Champion** (hiển thị trực tiếp cho người dùng) khi thỏa mãn đồng thời:

1. **Vượt qua Baseline CAMS**: Chỉ số MAE và RMSE trên tập Rolling Backtest 30 ngày gần nhất thấp hơn CAMS ít nhất 10% ở các mốc +1h, +6h và +24h.
2. **Kiểm soát Sai số Đỉnh (Spike Event Recall)**: Tỷ lệ phát hiện đúng các đợt ô nhiễm đột biến ($PM_{2.5} > 50\,\mu\text{g/m}^3$) đạt trên 75%.
3. **Độ ổn định kỹ thuật**: Không phát sinh giá trị âm hoặc NaN trong ít nhất 100 lần chạy batch liên tiếp; thời gian suy luận $\le 2.0$ giây trên 1 trạm.
