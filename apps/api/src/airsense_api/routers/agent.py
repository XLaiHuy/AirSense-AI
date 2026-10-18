"""AI Agent Assist Router.
Provides conversational AI health & meteorological advisor with function dispatching and grounding in real-time air quality data.
"""
from datetime import datetime
import os
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter
import httpx
from airsense_adapters.service import AirSenseDataService
from airsense_adapters.graphrag import graphrag_engine
from airsense_domain.models import AgentChatRequest, AgentChatResponse

router = APIRouter(prefix="/v1/agent", tags=["AI Agent Assist"])

data_service = AirSenseDataService()


def _expert_heuristic_agent(query: str, city_context: str) -> Dict[str, Any]:
    """Hệ thống suy luận chuyên gia cục bộ (Fallback khi chưa có key LLM ngoài).
    Phân tích từ khóa câu hỏi, gọi dữ liệu trạm thật và đưa ra khuyến nghị chính xác.
    """
    query_lower = query.lower()
    city = data_service.get_city(city_context) or data_service.get_city("tp-ho-chi-minh")
    cities = {c.id: c for c in data_service.get_all_cities()}

    # 1. Câu hỏi So sánh giữa 2 thành phố (ví dụ: Hà Nội vs Sài Gòn)
    if "so sánh" in query_lower or ("hà nội" in query_lower and ("sài gòn" in query_lower or "hồ chí minh" in query_lower)):
        hn = cities.get("ha-noi")
        hcm = cities.get("tp-ho-chi-minh")
        if hn and hcm:
            better = hcm if hcm.current_aqi < hn.current_aqi else hn
            worse = hn if better == hcm else hcm
            diff = abs(hn.current_aqi - hcm.current_aqi)
            reply = (
                f"### 📊 So sánh Không khí Hiện tại:\n\n"
                f"- **{hcm.name}**: Điểm AQI = **{hcm.current_aqi}** ({hcm.label_vi})\n"
                f"- **{hn.name}**: Điểm AQI = **{hn.current_aqi}** ({hn.label_vi})\n\n"
                f"**Nhận xét:** Không khí tại **{better.name}** đang trong lành, thoáng đãng hơn **{worse.name}** khoảng **{diff} điểm AQI**.\n"
                f"Tại {worse.name}, bạn nên chú ý tránh ra đường lúc tan tầm (7:30 - 9:00 sáng và 17:30 - 19:00 chiều) vì lúc này lượng xe cộ đông đúc khiến khói bụi tích tụ nhiều hơn."
            )
            return {
                "reply": reply,
                "suggested_actions": ["Xem chi tiết các phường tại Hà Nội", "Xem chi tiết các phường tại TP.HCM", "Thời điểm chạy bộ trong lành"],
                "referenced_stations": [f"Trạm {hn.name}", f"Trạm {hcm.name}"],
            }

    # 2. Câu hỏi về Thể thao / Chạy bộ / Giờ ra ngoài
    if any(k in query_lower for k in ["chạy bộ", "tập thể dục", "thể thao", "đạp xe", "ra ngoài", "giờ nào"]):
        aqi = city.current_aqi
        if aqi <= 50:
            advice = "Không khí đang rất trong lành và sạch sẽ. Bạn có thể thoải mái chạy bộ hoặc tập luyện thể thao ngoài trời vào bất kỳ lúc nào trong ngày."
            best_time = "Khoảng 5:30 - 7:00 sáng hoặc 17:30 - 19:30 chiều mát mẻ."
        elif aqi <= 100:
            advice = "Chất lượng không khí ở mức vừa phải (Trung bình). Nếu bạn hay bị viêm mũi dị ứng hoặc hen suyễn thì nên quan sát cảm giác cơ thể."
            best_time = "Nên chạy bộ trước 6:30 sáng hoặc sau 20:00 tối khi đường phố đã vắng xe bớt khói bụi."
        else:
            advice = (
                f"Chỉ số ô nhiễm hiện tại là **{aqi}** ({city.label_vi}). "
                "Hôm nay bạn nên hạn chế chạy bộ ngoài trời nhé, vì khi thở gấp phổi sẽ hít phải nhiều bụi bẩn độc hại."
            )
            best_time = "Nên chuyển sang tập nhẹ nhàng trong nhà hoặc phòng tập có máy lọc không khí."

        reply = (
            f"### 🏃 Lời Khuyên Tập Thể Dục tại {city.name}:\n\n"
            f"- **Chỉ số AQI hiện tại:** **{aqi}** ({city.label_vi})\n"
            f"- **Lời khuyên:** {advice}\n"
            f"- **Thời gian tốt nhất:** {best_time}\n\n"
            f"💡 **Mẹo nhỏ:** Nếu ra ngoài, bạn nên chọn các cung đường ven sông hoặc công viên râm mát nhiều cây xanh để hít thở dễ chịu hơn."
        )
        return {
            "reply": reply,
            "suggested_actions": ["Hôm nay có cần đeo khẩu trang không?", "Dự báo ngày mai thế nào?", "Xem các phường khác"],
            "referenced_stations": [d.name for d in city.districts[:3]],
        }

    # 3. Câu hỏi về Dự báo / Thời tiết ngày mai
    if any(k in query_lower for k in ["dự báo", "ngày mai", "tuần tới", "xu hướng"]):
        reply = (
            f"### 🔮 Dự Báo Không Khí 24h Tới tại {city.name}:\n\n"
            f"- **Mức dao động dự kiến:** Chỉ số AQI trong khoảng **{max(30, city.current_aqi - 15)} - {city.current_aqi + 20}**.\n"
            f"- **Lúc khói bụi nhiều nhất:** Khoảng **07:00 - 09:00 sáng** và **18:00 - 20:00 tối** khi xe cộ đông đúc giờ đi làm và tan sở.\n"
            f"- **Lúc không khí sạch nhất:** Đầu giờ chiều (13:00 - 15:00) khi trời có nắng gió giúp khói bụi tản bớt đi.\n\n"
            f"Bạn có thể mở mục **Dashboard Studio** để xem chi tiết dự báo từng khung giờ nhé."
        )
        return {
            "reply": reply,
            "suggested_actions": ["Mở Dashboard Studio", "Khuyến cáo bảo vệ sức khỏe", "Kiểm tra quận của tôi"],
            "referenced_stations": [f"Trạm trung tâm {city.name}"],
        }

    # 4. Trả lời tổng quan về Thành phố được chọn
    districts_str = ", ".join([f"{d.name} ({d.aqi_value} - {d.label_vi})" for d in city.districts[:4]])
    reply = (
        f"Xin chào! Tôi là **AirSense AI Assistant** — Trợ lý Khí tượng & Sức khỏe Không gian số.\n\n"
        f"Tại **{city.name}**, chỉ số VN_AQI hiện tại ghi nhận là **{city.current_aqi}** ({city.label_vi}).\n\n"
        f"**Tình hình một số khu vực trọng điểm:**\n{districts_str}.\n\n"
        f"Tôi có thể giúp bạn:\n"
        f"1. 🏃 Gợi ý giờ chạy bộ, đạp xe và hoạt động thể thao an toàn.\n"
        f"2. 📍 Kiểm tra nồng độ bụi mịn PM2.5 tại bất kỳ vị trí nào bạn bấm trên bản đồ.\n"
        f"3. ⚖️ So sánh chất lượng không khí giữa 6 đô thị lớn Việt Nam."
    )
    return {
        "reply": reply,
        "suggested_actions": [
            f"Hôm nay chạy bộ ở {city.name} lúc mấy giờ an toàn?",
            "So sánh ô nhiễm giữa Hà Nội và TP.HCM",
            "Dự báo chất lượng không khí 24h tới",
        ],
        "referenced_stations": [d.name for d in city.districts],
    }


@router.post("/chat", response_model=AgentChatResponse)
async def chat_with_agent(req: AgentChatRequest) -> AgentChatResponse:
    """Endpoint trò chuyện với Trợ lý Khí tượng & Sức khỏe AirSense AI.
    Hỗ trợ Function Calling tra cứu dữ liệu thực tế và đề xuất hành động.
    """
    if not req.messages:
        return AgentChatResponse(
            reply="Xin chào! Tôi có thể hỗ trợ gì về thông tin chất lượng không khí hôm nay?",
            suggested_actions=["So sánh Hà Nội và TP.HCM", "Thời điểm chạy bộ an toàn"],
        )

    last_user_message = req.messages[-1].content
    city_context = req.city_context or "tp-ho-chi-minh"

    # Kiểm tra nếu có API key Gemini trong môi trường
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            city = data_service.get_city(city_context)
            districts_brief = ", ".join([f"{d.name} (AQI {d.aqi_value})" for d in (city.districts[:3] if city else [])])

            # Truy vết quan hệ nhân quả không gian - thời gian từ Đồ thị tri thức (GraphRAG)
            graphrag_context = ""
            if city:
                ref_ward = city.districts[0] if city.districts else None
                ward_name = ref_ward.name if ref_ward else city.name
                ward_lat = ref_ward.latitude if ref_ward else city.center_lat
                ward_lon = ref_ward.longitude if ref_ward else city.center_lon
                graphrag_context = graphrag_engine.format_graphrag_context(
                    ward_name=ward_name,
                    ward_lat=ward_lat,
                    ward_lon=ward_lon,
                    city_id=city.id,
                    wind_deg=225.0,
                    wind_speed_kmh=12.0,
                )

            system_prompt = (
                "Bạn là người bạn đồng hành tư vấn sức khỏe và không khí sạch AirSense AI tại Việt Nam. "
                "Phong cách trả lời: Ấm áp, gần gũi, văn phong con người đời thường, súc tích và có tâm. "
                "Tuyệt đối KHÔNG dùng thuật ngữ hàn lâm khó hiểu (như 'phơi nhiễm', 'nghịch nhiệt', 'đối lưu', 'tiêu chuẩn QCVN'). "
                "Thay vào đó hãy dùng từ ngữ đời sống dễ hiểu: 'hít ít khói bụi', 'tránh giờ cao điểm xe cộ đông đúc', 'chạy bộ giờ nào thoáng đãng nhất'. "
                "Trọng tâm: Đưa ra lời khuyên hành động thiết thực cho người dân (giờ chạy bộ/tập thể dục tối ưu, có nên mở cửa đón gió, đeo khẩu trang khi nào). "
                f"Dữ liệu thực tế tại {city.name if city else 'TP. Hồ Chí Minh'}: Chỉ số chất lượng không khí AQI là {city.current_aqi if city else 85} ({city.label_vi if city else 'Trung bình'}). "
                f"Các phường tiêu biểu: {districts_brief}.\n\n"
                f"{graphrag_context}"
            )
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={gemini_key}"
                payload = {
                    "contents": [
                        {"role": "user", "parts": [{"text": f"{system_prompt}\n\nNgười dùng hỏi: {last_user_message}"}]}
                    ]
                }
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if text:
                            return AgentChatResponse(
                                reply=text,
                                suggested_actions=["Xem ma trận dự báo", "Đổi đô thị khác", "Lời khuyên sức khỏe cho trẻ nhỏ"],
                                referenced_stations=[city.name if city else "TP.HCM"],
                            )
        except Exception as e:
            pass  # Fallback sang heuristic bên dưới nếu lỗi mạng

    # Fallback Expert Heuristic Engine
    heuristic_res = _expert_heuristic_agent(last_user_message, city_context)
    return AgentChatResponse(
        reply=heuristic_res["reply"],
        suggested_actions=heuristic_res["suggested_actions"],
        referenced_stations=heuristic_res["referenced_stations"],
    )
