"use client";

import { useEffect, useState } from "react";
import { localDB, LocalStation, LocalStationHistory } from "@/lib/db/airsense-local-db";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://airsense-ai-vigy.onrender.com";

const DEFAULT_CITIES = [
  {
    id: "tp-ho-chi-minh",
    name: "TP. Hồ Chí Minh",
    country: "Việt Nam",
    center_lat: 10.7769,
    center_lon: 106.7009,
    zoom_level: 11.2,
    current_aqi: 85,
    category: "MODERATE",
    label_vi: "Trung bình",
    color_hex: "#EAB308",
    districts: [
      { id: "hcm-ben-nghe", name: "Phường Bến Nghé", latitude: 10.7756, longitude: 106.7004, aqi_value: 85, category: "MODERATE", label_vi: "Trung bình", color_hex: "#EAB308" },
      { id: "hcm-thao-dien", name: "Phường Thảo Điền", latitude: 10.803, longitude: 106.738, aqi_value: 58, category: "MODERATE", label_vi: "Trung bình", color_hex: "#EAB308" },
      { id: "hcm-tan-son-nhat", name: "Phường Tân Sơn Nhất", latitude: 10.8167, longitude: 106.6667, aqi_value: 116, category: "UNHEALTHY_SENSITIVE", label_vi: "Kém", color_hex: "#F97316" },
      { id: "hcm-gia-dinh", name: "Phường Gia Định", latitude: 10.8115, longitude: 106.7112, aqi_value: 138, category: "UNHEALTHY_SENSITIVE", label_vi: "Kém", color_hex: "#F97316" },
    ],
  },
  { id: "ha-noi", name: "Hà Nội", country: "Việt Nam", center_lat: 21.0285, center_lon: 105.8542, zoom_level: 11.0, current_aqi: 128, category: "UNHEALTHY_SENSITIVE", label_vi: "Kém", color_hex: "#F97316", districts: [] },
  { id: "da-nang", name: "Đà Nẵng", country: "Việt Nam", center_lat: 16.0544, center_lon: 108.2022, zoom_level: 11.5, current_aqi: 38, category: "GOOD", label_vi: "Tốt", color_hex: "#10B981", districts: [] },
  { id: "hai-phong", name: "Hải Phòng", country: "Việt Nam", center_lat: 20.8449, center_lon: 106.6881, zoom_level: 11.0, current_aqi: 96, category: "MODERATE", label_vi: "Trung bình", color_hex: "#EAB308", districts: [] },
  { id: "can-tho", name: "Cần Thơ", country: "Việt Nam", center_lat: 10.0452, center_lon: 105.7469, zoom_level: 11.5, current_aqi: 48, category: "GOOD", label_vi: "Tốt", color_hex: "#10B981", districts: [] },
  { id: "thua-thien-hue", name: "Thành phố Huế", country: "Việt Nam", center_lat: 16.4637, center_lon: 107.5909, zoom_level: 11.5, current_aqi: 34, category: "GOOD", label_vi: "Tốt", color_hex: "#10B981", districts: [] },
];

const DEFAULT_STUDIO_DATA = {
  city: DEFAULT_CITIES[0],
  live_aqi: {
    station_id: "tp-ho-chi-minh",
    calculated_at: new Date().toISOString(),
    aqi_value: 77,
    category: "MODERATE",
    label_vi: "Trung bình",
    color_hex: "#FFFF00",
    health_advice_vi: "Chất lượng không khí ở mức chấp nhận được. Nhóm người có tiền sử hô hấp nên hạn chế vận động gắng sức ngoài trời.",
    dominant_pollutant: "pm25",
  },
  environmental: {
    pm25_ugm3: 38.2,
    pm10_ugm3: 61.1,
    wind_speed_kmh: 8.1,
    temperature_c: 29.0,
    humidity_percent: 78,
    weather_condition: "Trời nắng nhẹ",
  },
  index_of_day: [
    { hour: "00:00", aqi: 65, pm25: 29.2 },
    { hour: "04:00", aqi: 60, pm25: 27.0 },
    { hour: "08:00", aqi: 100, pm25: 45.0 },
    { hour: "12:00", aqi: 80, pm25: 36.0 },
    { hour: "16:00", aqi: 75, pm25: 33.0 },
    { hour: "20:00", aqi: 85, pm25: 38.0 },
  ],
  health_tips: [
    { id: "tip-outdoor", action_vi: "Thời tiết lý tưởng cho hoạt động thể thao ngoài trời sáng sớm", icon_type: "outdoor", severity: "info" },
    { id: "tip-window", action_vi: "Có thể mở cửa thông thoáng nhà cửa vào buổi trưa", icon_type: "window", severity: "info" },
    { id: "tip-mask", action_vi: "Đeo khẩu trang khi đi qua các trục đường lớn giờ tan tầm", icon_type: "mask", severity: "info" },
  ],
  forecast_matrix: [
    { time_slot: "12 am", day_label: "T2", aqi_value: 59, category: "MODERATE", color_hex: "#FFFF00", opacity: 0.5 },
    { time_slot: "04 am", day_label: "T2", aqi_value: 55, category: "MODERATE", color_hex: "#FFFF00", opacity: 0.5 },
    { time_slot: "08 am", day_label: "T2", aqi_value: 88, category: "MODERATE", color_hex: "#FFFF00", opacity: 0.7 },
    { time_slot: "12 pm", day_label: "T2", aqi_value: 70, category: "MODERATE", color_hex: "#FFFF00", opacity: 0.6 },
    { time_slot: "04 pm", day_label: "T2", aqi_value: 75, category: "MODERATE", color_hex: "#FFFF00", opacity: 0.6 },
    { time_slot: "08 pm", day_label: "T2", aqi_value: 82, category: "MODERATE", color_hex: "#FFFF00", opacity: 0.7 },
  ],
  watchlist: [
    { city_id: "tp-ho-chi-minh", city_name: "TP. Hồ Chí Minh", pollution_level: "85 - Trung bình", weather_desc: "Trời nắng đẹp", temp_range: "26° - 32°", wind_speed: "8.1 km/h", aqi_value: 85, color_hex: "#EAB308" },
    { city_id: "ha-noi", city_name: "Hà Nội", pollution_level: "128 - Kém", weather_desc: "Nhiều mây", temp_range: "22° - 28°", wind_speed: "9.5 km/h", aqi_value: 128, color_hex: "#F97316" },
    { city_id: "da-nang", city_name: "Đà Nẵng", pollution_level: "38 - Tốt", weather_desc: "Trời nắng đẹp", temp_range: "22° - 28°", wind_speed: "11.2 km/h", aqi_value: 38, color_hex: "#10B981" },
  ],
};

export function useStations() {
  const [stations, setStations] = useState<LocalStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. TẢI TỨC THỜI TỪ INDEXEDDB (< 50ms - Zero Latency First Paint)
      try {
        const cachedStations = await localDB.stations.toArray();
        if (cachedStations.length > 0 && isMounted) {
          setStations(cachedStations);
          setLastSynced(new Date(cachedStations[0].synced_at));
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("[LocalDB] Không đọc được cache ban đầu:", err);
      }

      if (!navigator.onLine) {
        setIsOffline(true);
        setIsLoading(false);
        return;
      }

      // 2. REVALIDATION NGẦM VỚI BACKEND API (SWR)
      try {
        const res = await fetch(`${API_BASE}/v1/air/stations`);
        if (res.ok) {
          const freshData: any[] = await res.json();
          const now = Date.now();

          // Lưu đè vào IndexedDB
          await localDB.transaction("rw", localDB.stations, async () => {
            for (const item of freshData) {
              await localDB.stations.put({
                ...item,
                synced_at: now,
              });
            }
          });

          if (isMounted) {
            setStations(freshData);
            setLastSynced(new Date(now));
            setIsOffline(false);
          }
        }
      } catch (err) {
        console.warn("[Network] Không gọi được API, giữ nguyên dữ liệu IndexedDB:", err);
        if (isMounted) setIsOffline(true);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    // Lắng nghe sự kiện online/offline
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { stations, isLoading, isOffline, lastSynced };
}

export function useStationHistory(stationId: string | null) {
  const [history, setHistory] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!stationId) {
      setHistory(null);
      return;
    }

    const currentId = stationId;
    let isMounted = true;

    async function fetchHistory() {
      setIsLoading(true);

      // Đọc trước từ IndexedDB
      try {
        const cached = await localDB.history.where("station_id").equals(currentId).first();
        if (cached && isMounted) {
          setHistory(cached.data);
        }
      } catch (err) {
        console.warn("[LocalDB] Lỗi đọc history cache:", err);
      }

      // Fetch fresh từ API
      try {
        const res = await fetch(`${API_BASE}/v1/air/stations/${currentId}/history`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setHistory(data);

          // Cập nhật IndexedDB
          await localDB.history.where("station_id").equals(currentId).delete();
          await localDB.history.add({
            station_id: currentId,
            data: data,
            synced_at: Date.now(),
          });
        }
      } catch (err) {
        console.warn("[Network] Không fetch được history mới, dùng cache:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchHistory();
    return () => { isMounted = false; };
  }, [stationId]);

  return { history, isLoading };
}

// -------------------------------------------------------------
// SPRINT 2 HOOKS: CITIES, DASHBOARD STUDIO, INSPECT & AGENT
// -------------------------------------------------------------

export function useCities() {
  const [cities, setCities] = useState<any[]>(DEFAULT_CITIES);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadCities() {
      try {
        const res = await fetch(`${API_BASE}/v1/air/cities`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setCities(data);
          }
        }
      } catch (err) {
        console.warn("[Cities] Sử dụng danh mục đô thị mặc định:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadCities();
    return () => { isMounted = false; };
  }, []);

  return { cities, isLoading };
}

export function useDashboardStudio(cityId: string = "tp-ho-chi-minh") {
  const [studioData, setStudioData] = useState<any>(DEFAULT_STUDIO_DATA);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchStudioData() {
      try {
        const res = await fetch(`${API_BASE}/v1/air/cities/${cityId}/dashboard`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setStudioData(data);
          }
        }
      } catch (err) {
        console.warn("[DashboardStudio] Sử dụng gói dữ liệu studio dự phòng:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchStudioData();
    return () => { isMounted = false; };
  }, [cityId]);

  return { studioData, isLoading };
}

export async function inspectCoordinate(lat: number, lon: number): Promise<any> {
  const res = await fetch(`${API_BASE}/v1/air/inspect?lat=${lat}&lon=${lon}`);
  if (!res.ok) {
    throw new Error(`Inspect failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function sendAgentMessage(messages: { role: string; content: string }[], cityContext: string): Promise<any> {
  const res = await fetch(`${API_BASE}/v1/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      city_context: cityContext,
    }),
  });
  if (!res.ok) {
    throw new Error(`Agent request failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchCleanRoute(fromWard: string, toWard: string, cityId: string = "tp-ho-chi-minh"): Promise<any> {
  const res = await fetch(
    `${API_BASE}/v1/air/clean-route?from_ward=${encodeURIComponent(fromWard)}&to_ward=${encodeURIComponent(toWard)}&city_id=${encodeURIComponent(cityId)}`
  );
  if (!res.ok) {
    throw new Error(`Clean route request failed: ${res.statusText}`);
  }
  return await res.json();
}


