"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useStations, useCities, useDashboardStudio, inspectCoordinate } from "@/hooks/useAirQuality";
import { LocalStation } from "@/lib/db/airsense-local-db";
import StationDrawer from "@/components/dashboard/StationDrawer";
import DashboardStudio from "@/components/dashboard/DashboardStudio";
import AgentAssistDrawer from "@/components/agent/AgentAssistDrawer";
import CleanRouteModal from "@/components/navigation/CleanRouteModal";
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
  Search,
  Crosshair,
  MapPin,
  Sparkles,
  X,
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

  // Smart Citizen Companion State
  const [isRoutePlannerOpen, setIsRoutePlannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; zoom?: number; timestamp: number } | null>(null);

  // Clean Air Route State
  const [activeRoute, setActiveRoute] = useState<any | null>(null);

  const { studioData } = useDashboardStudio(selectedCityId);

  // Lấy đối tượng đô thị hiện tại
  const selectedCity = useMemo(() => {
    return cities.find((c) => c.id === selectedCityId) || cities[0];
  }, [cities, selectedCityId]);

  // Danh sách các địa điểm có thể tìm kiếm: Trạm quan trắc + Phường trọng điểm
  const searchableLocations = useMemo(() => {
    const list: { id: string; name: string; lat: number; lon: number; aqi?: number; color?: string; type: "station" | "district" }[] = [];

    // 1. Trạm quan trắc
    stations.forEach((s) => {
      list.push({
        id: s.id,
        name: s.name.replace(/^Trạm\s+/i, ""),
        lat: s.latitude,
        lon: s.longitude,
        aqi: s.latest_aqi?.aqi_value,
        color: s.latest_aqi?.color_hex,
        type: "station",
      });
    });

    // 2. Các phường trọng điểm của thành phố
    if (selectedCity?.districts) {
      selectedCity.districts.forEach((d: any) => {
        if (!list.some((item) => item.name.includes(d.name))) {
          list.push({
            id: d.id,
            name: d.name,
            lat: d.latitude,
            lon: d.longitude,
            aqi: d.aqi_value,
            color: d.color_hex,
            type: "district",
          });
        }
      });
    }

    return list;
  }, [stations, selectedCity]);

  // Kết quả tìm kiếm thời gian thực
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return searchableLocations
      .filter((item) => {
        const nameNorm = item.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return nameNorm.includes(q);
      })
      .slice(0, 6);
  }, [searchQuery, searchableLocations]);

  // Xử lý chọn kết quả tìm kiếm
  function handleSelectSearchResult(item: any) {
    setSearchQuery("");
    setIsSearchOpen(false);
    setFlyToTarget({ lat: item.lat, lon: item.lon, zoom: 14.5, timestamp: Date.now() });

    const matchedStation = stations.find((s) => s.id === item.id);
    if (matchedStation) {
      setSelectedStation(matchedStation);
    } else {
      handleInspectCoordinate(item.lat, item.lon);
    }
  }

  // Xử lý Định vị GPS 1-Click ("Vị trí của tôi")
  function handleLocateMe() {
    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setFlyToTarget({ lat, lon, zoom: 14.5, timestamp: Date.now() });
        handleInspectCoordinate(lat, lon, "🚩 Vị trí của bạn (Định vị GPS)");
      },
      (err) => {
        setIsLocating(false);
        console.warn("Không lấy được GPS:", err);
        // Fallback: Bay tới trung tâm thành phố hiện tại
        setFlyToTarget({
          lat: selectedCity.center_lat,
          lon: selectedCity.center_lon,
          zoom: 12.5,
          timestamp: Date.now(),
        });
        handleInspectCoordinate(selectedCity.center_lat, selectedCity.center_lon, "Trung tâm đô thị");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // Xử lý Click-to-Inspect bất kỳ đâu trên bản đồ (xem nơi không có trạm)
  async function handleInspectCoordinate(lat: number, lon: number, customName?: string) {
    setIsInspecting(true);
    setInspectedPoint({ lat, lon });

    try {
      const inspectRes = await inspectCoordinate(lat, lon);
      setInspectedPoint({ lat, lon, data: inspectRes });

      // Chuyển kết quả nội suy thành station ảo để mở Drawer
      const virtualStation: any = {
        id: `virtual-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        name: customName || inspectRes.nearest_address,
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
          {/* Floating Header Bar Hợp Nhất (Swiss Minimalist) */}
          <header className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center justify-between px-3 sm:px-5 py-2 bg-slate-950/90 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl w-[calc(100%-1.5rem)] max-w-6xl">
            {/* Brand & City Selector */}
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-700 text-sky-400 shadow-sm flex-shrink-0">
                <Wind className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap">AirSense AI</span>
                  <span className="hidden sm:inline px-1.5 py-0.2 rounded text-[10px] font-semibold bg-neutral-800 text-emerald-400 border border-neutral-700">
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
                  <span className="hidden md:inline text-[10px] text-neutral-500">• 6 đô thị</span>
                </div>
              </div>
            </div>

            {/* Thanh Tìm Kiếm Nhanh Phường / Trạm (Search & Jump) */}
            <div className="relative hidden lg:flex items-center">
              <div className="relative flex items-center">
                <Search className="absolute left-3 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  placeholder="Tìm Phường, Quận, Trạm..."
                  className="w-52 pl-8 pr-7 py-1.5 rounded-xl bg-neutral-900/90 border border-neutral-700/80 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-sky-500 focus:w-64 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setIsSearchOpen(false);
                    }}
                    className="absolute right-2 p-0.5 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Dropdown Gợi ý Tìm kiếm */}
              {isSearchOpen && searchResults.length > 0 && (
                <div className="absolute top-full left-0 mt-2 w-72 p-1.5 rounded-2xl bg-slate-950/95 border border-neutral-700/80 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                    Gợi ý địa điểm & trạm đo
                  </div>
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectSearchResult(item)}
                      className="w-full px-2.5 py-2 rounded-xl hover:bg-neutral-800/80 flex items-center justify-between text-left transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2">
                        <MapPin className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                        <div>
                          <div className="text-xs font-semibold text-neutral-200 group-hover:text-sky-300">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-neutral-400">
                            {item.type === "station" ? "Trạm quan trắc" : "Khu vực trọng điểm"}
                          </div>
                        </div>
                      </div>
                      {item.aqi && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold text-neutral-950"
                          style={{ backgroundColor: item.color || "#EAB308" }}
                        >
                          {item.aqi}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cụm điều khiển Bản đồ Tích Hợp */}
            <div className="flex items-center space-x-1 sm:space-x-1.5">
              {/* Nút Vị trí của tôi (GPS 1-Click) */}
              <button
                onClick={handleLocateMe}
                disabled={isLocating}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-medium transition cursor-pointer"
                title="Định vị GPS vị trí hiện tại của bạn"
              >
                <Crosshair className={`w-3.5 h-3.5 ${isLocating ? "animate-spin text-sky-400" : ""}`} />
                <span className="hidden sm:inline">Vị trí của tôi</span>
              </button>

              {/* Nút Lộ trình Không khí Sạch */}
              <button
                onClick={() => setIsRoutePlannerOpen(true)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                  activeRoute
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm shadow-emerald-500/20"
                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
                title="Lập lộ trình ít khói bụi nhất"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Đường thở sạch</span>
              </button>

              {/* Nút Bật/Tắt Lớp phủ Heatmap */}
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                  showHeatmap
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "bg-neutral-900/60 text-neutral-400 hover:text-white border border-neutral-800"
                }`}
                title="Bật/Tắt Lớp phủ nhiệt độ ô nhiễm"
              >
                <Flame className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Heatmap</span>
              </button>

              {/* Nút Bật/Tắt Dòng Gió Động */}
              <button
                onClick={() => setShowWindStream(!showWindStream)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                  showWindStream
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                    : "bg-neutral-900/60 text-neutral-400 hover:text-white border border-neutral-800"
                }`}
                title="Bật/Tắt vệt gió bay trên bản đồ"
              >
                <Waves className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Gió động</span>
              </button>

              {/* Nút Đổi Theme Sáng/Tối */}
              <button
                onClick={() => setCurrentTheme(currentTheme === "dark" ? "light" : "dark")}
                className="flex items-center space-x-1 px-2 py-1.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-800/80 text-neutral-300 border border-neutral-800 text-xs font-medium transition cursor-pointer"
                title="Đổi giao diện Bản đồ Sáng / Tối"
              >
                {currentTheme === "dark" ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                )}
              </button>

              <div className="w-px h-4 bg-neutral-800 hidden sm:block" />

              {/* Nút Chuyển sang Dashboard Studio */}
              <button
                onClick={() => setViewMode("studio")}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700/80 text-xs font-semibold shadow-sm transition cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">Studio</span>
              </button>

              {/* Nút Trợ lý AI */}
              <button
                onClick={() => setIsAgentOpen(true)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sky-300 border border-neutral-700 text-xs font-semibold shadow transition cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden md:inline">AI</span>
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
              flyToTarget={flyToTarget}
            />
          </div>

          {/* Modal Lập Lộ trình Không khí Sạch */}
          <CleanRouteModal
            isOpen={isRoutePlannerOpen}
            onClose={() => setIsRoutePlannerOpen(false)}
            onSelectRoute={(route) => {
              setActiveRoute(route);
              if (route.coordinates && route.coordinates.length > 0) {
                setFlyToTarget({
                  lon: route.coordinates[0][0],
                  lat: route.coordinates[0][1],
                  zoom: 12.8,
                  timestamp: Date.now(),
                });
              }
            }}
            cityId={selectedCityId}
          />

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
