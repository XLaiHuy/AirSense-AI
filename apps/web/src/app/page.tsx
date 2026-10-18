"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useStations, useCities, useDashboardStudio, inspectCoordinate } from "@/hooks/useAirQuality";
import { LocalStation } from "@/lib/db/airsense-local-db";
import StationDrawer from "@/components/dashboard/StationDrawer";
import DashboardStudio from "@/components/dashboard/DashboardStudio";
import AgentAssistDrawer from "@/components/agent/AgentAssistDrawer";
import {
  Wind,
  WifiOff,
  LayoutDashboard,
  Bot,
  Info,
  Sun,
  Moon,
  Flame,
  Waves,
  Navigation,
} from "lucide-react";

const MapLibreView = dynamic(() => import("@/components/map/MapLibreView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 text-neutral-400">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Đang nạp dữ liệu bản đồ Web GIS 60fps...</span>
      </div>
    </div>
  ),
});

export default function HomePage() {
  const { stations, isLoading, isOffline, lastSynced } = useStations();
  const { cities } = useCities();

  const [viewMode, setViewMode] = useState<"studio" | "map">("studio");
  const [selectedCityId, setSelectedCityId] = useState<string>("tp-ho-chi-minh");
  const [selectedStation, setSelectedStation] = useState<LocalStation | null>(null);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [inspectedPoint, setInspectedPoint] = useState<{ lat: number; lon: number; data?: any } | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // Map Controls State
  const [currentTheme, setCurrentTheme] = useState<"dark" | "light">("dark");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showWindStream, setShowWindStream] = useState(true);

  // Clean Air Route State
  const [activeRoute, setActiveRoute] = useState<any | null>(null);

  const { studioData } = useDashboardStudio(selectedCityId);

  // Lấy đối tượng đô thị hiện tại
  const selectedCity = useMemo(() => {
    return cities.find((c) => c.id === selectedCityId) || cities[0];
  }, [cities, selectedCityId]);

  // Xử lý Click-to-Inspect bất kỳ đâu trên bản đồ (xem nơi không có trạm)
  async function handleInspectCoordinate(lat: number, lon: number) {
    setIsInspecting(true);
    setInspectedPoint({ lat, lon });

    try {
      const inspectRes = await inspectCoordinate(lat, lon);
      setInspectedPoint({ lat, lon, data: inspectRes });

      // Chuyển kết quả nội suy thành station ảo để mở Drawer
      const virtualStation: any = {
        id: `virtual-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        name: inspectRes.nearest_address,
        provider: "cams_model",
        latitude: lat,
        longitude: lon,
        status: "active",
        latest_aqi: inspectRes.aqi,
        latest_measurements: inspectRes.measurements,
        metadata: {
          is_virtual: true,
          weather: inspectRes.environmental,
        },
        synced_at: Date.now(),
      };
      setSelectedStation(virtualStation);
    } catch (err) {
      console.warn("Lỗi khi kiểm tra tọa độ:", err);
    } finally {
      setIsInspecting(false);
    }
  }

  // CHUYỂN ĐỔI VIEWPORT LIÊN TỤC KHÔNG UNMOUNT — KHỬ TRIỆT ĐỂ GIẬT LAG 60FPS
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0e12] font-sans">
      {/* 1. CHẾ ĐỘ BẢN ĐỒ WEB GIS (Luôn duy trì trong DOM, chuyển cảnh 0ms tức thì) */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
          viewMode === "map"
            ? "opacity-100 z-10 pointer-events-auto"
            : "opacity-0 z-0 pointer-events-none"
        }`}
      >
        <main className="relative w-full h-full overflow-hidden flex flex-col select-none">
          {/* Floating Header Bar Hợp Nhất (Swiss Minimalist - Không bị đè) */}
          <header className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center justify-between px-4 sm:px-5 py-2 bg-slate-950/85 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-6xl">
            {/* Brand & City Selector */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-700 text-sky-400 shadow-sm">
                <Wind className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold tracking-tight text-white">AirSense AI</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-neutral-800 text-emerald-400 border border-neutral-700">
                    100% Cấp Phường
                  </span>
                </div>

                {/* City Dropdown */}
                <div className="flex items-center space-x-1">
                  <select
                    value={selectedCityId}
                    onChange={(e) => setSelectedCityId(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-neutral-300 hover:text-white border-none outline-none cursor-pointer pr-1"
                    aria-label="Chọn đô thị"
                  >
                    {cities.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-950 text-white">
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-neutral-500">• 6 đô thị lớn</span>
                </div>
              </div>
            </div>

            {/* Cụm điều khiển Bản đồ Tích Hợp (Heatmap, Dòng gió, Sáng/Tối, AI, Studio) */}
            <div className="flex items-center space-x-2">
              {/* Nút Bật/Tắt Lớp phủ Heatmap */}
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition ${
                  showHeatmap
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "bg-neutral-900/60 text-neutral-400 hover:text-white border border-neutral-800"
                }`}
                title="Bật/Tắt Lớp phủ nhiệt độ ô nhiễm"
              >
                <Flame className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lớp phủ Heatmap</span>
              </button>

              {/* Nút Bật/Tắt Dòng Gió Động */}
              <button
                onClick={() => setShowWindStream(!showWindStream)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition ${
                  showWindStream
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                    : "bg-neutral-900/60 text-neutral-400 hover:text-white border border-neutral-800"
                }`}
                title="Bật/Tắt vệt gió bay trên bản đồ"
              >
                <Waves className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dòng gió động</span>
              </button>

              {/* Nút Đổi Theme Sáng/Tối */}
              <button
                onClick={() => setCurrentTheme(currentTheme === "dark" ? "light" : "dark")}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-800/80 text-neutral-300 border border-neutral-800 text-xs font-medium transition"
                title="Đổi giao diện Bản đồ Sáng / Tối"
              >
                {currentTheme === "dark" ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span className="hidden md:inline">{currentTheme === "dark" ? "Tối" : "Sáng"}</span>
              </button>

              <div className="w-px h-4 bg-neutral-800" />

              {/* Nút Chuyển sang Dashboard Studio */}
              <button
                onClick={() => setViewMode("studio")}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700/80 text-xs font-semibold shadow-sm transition"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Mở Dashboard Studio</span>
              </button>

              {/* Nút Trợ lý AI */}
              <button
                onClick={() => setIsAgentOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sky-300 border border-neutral-700 text-xs font-semibold shadow transition"
              >
                <Bot className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">Trợ lý AI</span>
              </button>
            </div>
          </header>

          {/* Main Map View */}
          <div className="relative flex-1 w-full h-full">
            <MapLibreView
              stations={stations}
              selectedStation={selectedStation}
              onSelectStation={(s) => setSelectedStation(s)}
              selectedCity={selectedCity}
              onInspectCoordinate={handleInspectCoordinate}
              inspectedPoint={inspectedPoint}
              showHeatmap={showHeatmap}
              showWindStream={showWindStream}
              currentTheme={currentTheme}
              activeRoute={activeRoute}
              onClearRoute={() => setActiveRoute(null)}
            />
          </div>

          {/* Thông báo kiểm tra tọa độ thân thiện */}
          {isInspecting && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-slate-900/95 text-white text-xs font-medium shadow-2xl flex items-center space-x-2 border border-neutral-700">
              <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <span>Đang kiểm tra độ sạch không khí tại điểm bạn vừa chọn...</span>
            </div>
          )}

          {/* Station / Virtual Point Drawer */}
          <StationDrawer
            station={selectedStation}
            onClose={() => setSelectedStation(null)}
          />

          {/* AQI Colorblind-Safe Legend Footer */}
          <footer className="absolute bottom-4 left-4 z-20 hidden md:flex items-center space-x-2 p-2 rounded-xl bg-slate-950/90 backdrop-blur-md border border-neutral-800 text-[11px] text-neutral-300">
            <span className="text-neutral-500 font-semibold flex items-center space-x-1 pr-1">
              <Info className="w-3 h-3 text-neutral-400" />
              <span>Quy chuẩn:</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              ● Trong lành
            </span>
            <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 font-medium">
              ◆ Trung bình
            </span>
            <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20 font-medium">
              ▲ Kém
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
              ⬣ Ô nhiễm cao
            </span>
          </footer>
        </main>
      </div>

      {/* 2. CHẾ ĐỘ DASHBOARD STUDIO (Toàn màn hình chuyên biệt) */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-150 ${
          viewMode === "studio"
            ? "opacity-100 z-20 pointer-events-auto"
            : "opacity-0 z-0 pointer-events-none"
        }`}
      >
        <DashboardStudio
          data={studioData}
          onSwitchToMap={() => setViewMode("map")}
          onOpenAgent={() => setIsAgentOpen(true)}
          onSelectCity={(id) => setSelectedCityId(id)}
          selectedCityId={selectedCityId}
          allCities={cities}
          onSelectRoute={(route) => {
            setActiveRoute(route);
            setViewMode("map");
          }}
        />
      </div>

      {/* AI Agent Drawer dùng chung */}
      <AgentAssistDrawer
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        cityContext={selectedCityId}
        cityName={selectedCity?.name || "TP. Hồ Chí Minh"}
      />
    </div>
  );
}
