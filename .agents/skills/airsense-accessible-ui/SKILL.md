---
name: airsense-accessible-ui
description: "Quy chuẩn thiết kế giao diện Web GIS AirSense AI chuẩn công thái học, dễ tiếp cận (WCAG 2.1 AA), bảng màu AQI an toàn cho người mù màu (Colorblind-safe), Typography tiếng Việt Be Vietnam Pro và touch targets tối ưu bản đồ."
---

# AirSense AI — Accessible Web GIS & Sensory UI Skill

Kỹ năng chuyên sâu về **Thiết kế Giao diện Dễ tiếp cận (Accessibility - a11y)** cho nền tảng AirSense AI. Đảm bảo bản đồ chất lượng không khí, bảng số liệu và trợ lý AI có thể sử dụng dễ dàng bởi mọi đối tượng người dùng, bao gồm người khiếm thị, người mù màu và người cao tuổi.

---

## 1. Nguyên tắc An toàn Màu sắc AQI (Colorblind-Safe Palettes)

> [!WARNING]
> **Tuyệt đối không sử dụng màu sắc làm chỉ báo duy nhất cho mức độ ô nhiễm.**  
> Khoảng 8% nam giới mắc chứng mù màu đỏ-xanh lá (Deuteranopia/Protanopia) và hoàn toàn không thể phân biệt màu Xanh (Không khí Tốt) với màu Đỏ/Cam (Không khí Nguy hại).

Mọi thẻ trạng thái, điểm trạm trên bản đồ và biểu đồ nồng độ bắt buộc phải bao gồm **bộ ba định danh đồng thời**:
1. **Màu sắc nền/viền**: Sử dụng dải màu có độ tương phản độ sáng (Luminance contrast) cao giữa các mức.
2. **Nhãn chữ tiếng Việt minh bạch**: "Tốt", "Trung bình", "Kém", "Xấu", "Rất xấu", "Nguy hại".
3. **Chỉ số số học rõ ràng & Icon hình học**: Kèm số AQI/PM2.5 to, rõ và biểu tượng hình học riêng biệt (vd: ● Tròn = Tốt, ▲ Tam giác = Kém, ■ Vuông = Xấu, ⚠ Cảnh báo = Nguy hại).

| Mức AQI | Khoảng giá trị | Nhãn tiếng Việt | Ký hiệu hình học | Khuyến cáo ngắn |
| :--- | :--- | :--- | :--- | :--- |
| **Cấp 1** | 0 – 50 | Tốt | ● Tròn xanh lam | Tự do hoạt động ngoài trời |
| **Cấp 2** | 51 – 100 | Trung bình | ◆ Thoi vàng | Nhóm nhạy cảm nên lưu ý |
| **Cấp 3** | 101 – 150 | Kém | ▲ Tam giác cam | Giảm vận động ngoài trời |
| **Cấp 4** | 151 – 200 | Xấu | ⬣ Lục giác đỏ | Đeo khẩu trang chống bụi mịn |
| **Cấp 5** | 201 – 300 | Rất xấu | ⬛ Vuông tím | Tránh ra ngoài khi không cần |
| **Cấp 6** | 301 – 500 | Nguy hại | ✖ Chữ thập nâu đậm | Ở trong nhà, đóng kín cửa sổ |

---

## 2. Typography & Công thái học Chạm (Touch Ergonomics)

1. **Bộ Font Chuẩn**: Sử dụng self-hosted **Be Vietnam Pro** với đầy đủ dấu tiếng Việt, phân cấp rõ ràng:
   - Số liệu AQI Hero: `font-black text-4xl` hoặc `text-5xl`.
   - Tiêu đề trạm / Vị trí: `font-semibold text-lg`.
   - Nội dung giải thích / Khuyến cáo sức khỏe: `font-normal text-base leading-relaxed` (tối thiểu 15–16px, không dùng chữ dưới 13px cho nội dung chính).
2. **Kích thước Điểm chạm (Touch Targets)**:
   - Các trạm đo trên bản đồ (Map Markers) và các nút bấm điều khiển (Zoom, Time Slider, Bookmark) phải có diện tích chạm thực tế tối thiểu **$44 \times 44\text{ px}$** trên màn hình cảm ứng di động.
   - Thêm vùng đệm ẩn (`hit-box padding`) quanh các marker nhỏ để người dùng ngón tay to không bị bấm trượt.
3. **Điều hướng Bàn phím (Keyboard Navigation)**:
   - Người dùng có thể dùng phím `Tab` để nhảy qua lại giữa danh sách các trạm quan trắc, thanh trượt thời gian và khung chat AI.
   - Luôn có viền chỉ báo tiêu điểm (Focus Ring) nổi bật (`ring-2 ring-primary ring-offset-2`).

---

## 3. Khử Giật & Tôn trọng Hiệu ứng Chuyển động (Reduced Motion)

- Khi người dùng bật cài đặt hệ điều hành `prefers-reduced-motion: reduce`:
  - Tắt toàn bộ hiệu ứng sóng lan tỏa (radar ping pulse) trên các trạm đo.
  - Chuyển hiệu ứng bay máy ảnh (map flyTo animation) thành chuyển cảnh tức thì (jumpTo).
  - Tốc độ chuyển cảnh của thanh trượt thời gian (time-slider) giữ dưới 150ms.
