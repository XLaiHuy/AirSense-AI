"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
// @ts-ignore
import maplibregl from "maplibre-gl";
// @ts-ignore
import "maplibre-gl/dist/maplibre-gl.css";
import { LocalStation } from "@/lib/db/airsense-local-db";
import { MapPin, Navigation, Wind, CheckCircle2, X } from "lucide-react";

interface MapLibreViewProps {
  stations: LocalStation[];
  selectedStation: LocalStation | null;
  onSelectStation: (station: LocalStation) => void;
  selectedCity?: any;
  onInspectCoordinate?: (lat: number, lon: number) => void;
  inspectedPoint?: { lat: number; lon: number; data?: any } | null;
  showHeatmap: boolean;
  showWindStream?: boolean;
  currentTheme: "dark" | "light";
  activeRoute?: {
    fromWard: string;
    toWard: string;
    coordinates: [number, number][];
    avgAqi: number;
    distanceKm: number;
    avoidedExposurePercent: number;
  } | null;
  onClearRoute?: () => void;
}

const STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

export default function MapLibreView({
  stations,
  selectedStation,
  onSelectStation,
  selectedCity,
  onInspectCoordinate,
  inspectedPoint,
  showHeatmap,
  showWindStream = false,
  currentTheme,
  activeRoute,
  onClearRoute,
}: MapLibreViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersMapRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const inspectMarkerRef = useRef<maplibregl.Marker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isClickingStationRef = useRef<boolean>(false);

  // Helper tạo GeoJSON cho lớp phủ Heatmap
  const generateHeatmapGeoJSON = useCallback(() => {
    const features: any[] = [];

    // 1. Thêm các trạm quan trắc thực tế theo Phường
    stations.forEach((s) => {
      const aqi = s.latest_aqi?.aqi_value || 50;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [s.longitude, s.latitude],
        },
        properties: {
          aqi: aqi,
          weight: Math.min(1.0, Math.max(0.1, aqi / 180)),
        },
      });
    });

    // 2. Thêm các điểm trọng điểm của đô thị đang chọn
    if (selectedCity && selectedCity.districts) {
      selectedCity.districts.forEach((d: any) => {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [d.longitude, d.latitude],
          },
          properties: {
            aqi: d.aqi_value || selectedCity.current_aqi || 60,
            weight: Math.min(1.0, Math.max(0.1, (d.aqi_value || 60) / 180)),
          },
        });
      });
    }

    return {
      type: "FeatureCollection",
      features,
    };
  }, [stations, selectedCity]);

  // Khởi tạo bản đồ MapLibre
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const initialCenter = selectedCity
      ? [selectedCity.center_lon, selectedCity.center_lat]
      : [106.7009, 10.7769];

    const initialZoom = selectedCity ? selectedCity.zoom_level : 11.2;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLES[currentTheme],
      center: initialCenter as [number, number],
      zoom: initialZoom,
      attributionControl: false,
      dragRotate: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    // Lắng nghe sự kiện Click trên bản đồ (Click-to-Inspect)
    map.on("click", (e: any) => {
      // Nếu vừa click vào trạm thực tế thì bỏ qua
      if (isClickingStationRef.current) return;
      if (onInspectCoordinate) {
        onInspectCoordinate(e.lngLat.lat, e.lngLat.lng);
      }
    });

    // Khi map style nạp xong -> Đăng ký WebGL Heatmap layer
    map.on("load", () => {
      setupLayers(map);
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Thiết lập Layer Heatmap & Clean Air Route
  const setupLayers = (map: maplibregl.Map) => {
    const geojsonData = generateHeatmapGeoJSON();

    // 1. Heatmap Source & Layer
    if (!map.getSource("airsense-heatmap-source")) {
      map.addSource("airsense-heatmap-source", {
        type: "geojson",
        data: geojsonData as any,
      });
    }

    if (!map.getLayer("airsense-heatmap-layer")) {
      map.addLayer(
        {
          id: "airsense-heatmap-layer",
          type: "heatmap",
          source: "airsense-heatmap-source",
          maxzoom: 15,
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["get", "aqi"],
              0, 0,
              40, 0.25,
              80, 0.55,
              120, 0.8,
              180, 1.0,
            ],
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 0.8,
              11, 1.3,
              14, 2.4,
            ],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(0, 0, 0, 0)",
              0.15, "rgba(16, 185, 129, 0.4)",
              0.4, "rgba(234, 179, 8, 0.55)",
              0.65, "rgba(249, 115, 22, 0.7)",
              0.85, "rgba(239, 68, 68, 0.8)",
              1.0, "rgba(168, 85, 247, 0.9)",
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 25,
              11, 45,
              14, 85,
            ],
            "heatmap-opacity": 0.7,
          },
          layout: {
            visibility: showHeatmap ? "visible" : "none",
          },
        },
        map.getStyle().layers?.[0]?.id
      );
    }

    // 2. Clean Air Route Source & Layer
    if (!map.getSource("clean-air-route-source")) {
      map.addSource("clean-air-route-source", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    if (!map.getLayer("clean-air-route-line-bg")) {
      map.addLayer({
        id: "clean-air-route-line-bg",
        type: "line",
        source: "clean-air-route-source",
        paint: {
          "line-color": "#064e3b",
          "line-width": 8,
          "line-opacity": 0.5,
        },
      });
    }

    if (!map.getLayer("clean-air-route-line")) {
      map.addLayer({
        id: "clean-air-route-line",
        type: "line",
        source: "clean-air-route-source",
        paint: {
          "line-color": "#10B981",
          "line-width": 4,
          "line-dasharray": [1, 1.5],
        },
      });
    }
  };

  // Cập nhật Heatmap Data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("airsense-heatmap-source") as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(generateHeatmapGeoJSON() as any);
    } else {
      setupLayers(map);
    }
  }, [stations, selectedCity, generateHeatmapGeoJSON]);

  // Cập nhật Hiển thị Clean Air Route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("clean-air-route-source") as maplibregl.GeoJSONSource;
    if (!source) return;

    if (activeRoute && activeRoute.coordinates.length > 1) {
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: activeRoute.coordinates,
            },
            properties: {
              title: "Lộ trình Không khí Sạch",
            },
          },
        ],
      });

      // Fit bounds bao quát lộ trình
      const bounds = new maplibregl.LngLatBounds();
      activeRoute.coordinates.forEach((coord) => bounds.extend(coord));
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
    } else {
      source.setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, [activeRoute]);

  // Bật/Tắt Lớp phủ Heatmap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer("airsense-heatmap-layer")) {
      map.setLayoutProperty(
        "airsense-heatmap-layer",
        "visibility",
        showHeatmap ? "visible" : "none"
      );
    }
  }, [showHeatmap]);

  // Thay đổi Theme (Dark / Light)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(STYLES[currentTheme]);
    map.once("style.load", () => {
      setupLayers(map);
    });
  }, [currentTheme]);

  // Camera bay khi đổi thành phố
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCity) return;

    map.flyTo({
      center: [selectedCity.center_lon, selectedCity.center_lat],
      zoom: selectedCity.zoom_level || 11.2,
      speed: 1.2,
      curve: 1.2,
      essential: true,
    });
  }, [selectedCity]);

  // Điểm kiểm tra ảo Click-to-Inspect (Cột Cờ Định Vị & Sóng Radar Chuẩn Xác)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (inspectMarkerRef.current) {
      inspectMarkerRef.current.remove();
      inspectMarkerRef.current = null;
    }

    if (inspectedPoint) {
      const el = document.createElement("div");
      // Element gốc có kích thước 0x0 để điểm neo (0, 0) trùng khớp 100% với pixel tọa độ click
      el.style.width = "0px";
      el.style.height = "0px";
      el.style.position = "relative";
      el.className = "z-50 pointer-events-auto cursor-pointer";
      el.innerHTML = `
        <!-- 1. Điểm Chạm Mặt Đất & Vòng Sóng Radar: TÂM CHUẨN XÁC 100% TẠI (0, 0) -->
        <div style="position: absolute; left: 0px; top: 0px; transform: translate(-50%, -50%);" class="flex items-center justify-center w-6 h-6 pointer-events-none">
          <div class="absolute inset-0 rounded-full bg-amber-400/60 animate-radar-pulse"></div>
          <div class="w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow-2xl"></div>
        </div>

        <!-- 2. Thân Cột Cờ thẳng đứng vươn lên từ (0, 0) đến (0, -32px) -->
        <div style="position: absolute; left: -1px; bottom: 0px; width: 2px; height: 32px;" class="bg-gradient-to-t from-amber-400 via-amber-300 to-amber-500 shadow pointer-events-none"></div>

        <!-- 3. Thẻ Cờ nằm ngay trên đỉnh cột cờ tại y = -32px -->
        <div style="position: absolute; left: 0px; bottom: 32px; transform: translateX(-50%);" class="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-950/95 border-2 border-amber-400 text-white shadow-2xl text-[11px] font-bold tracking-wide whitespace-nowrap">
          <span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span>🚩 Điểm bạn vừa chọn</span>
        </div>
      `;

      inspectMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([inspectedPoint.lon, inspectedPoint.lat])
        .addTo(map);
    }
  }, [inspectedPoint]);

  // TÍNH NĂNG 3: DÒNG GIÓ ĐỘNG 60FPS (WIND STREAM LAYER)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showWindStream) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Kích thước canvas đồng bộ viewport
    canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
    canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;

    // Tạo các hạt gió (particles)
    const particleCount = 75;
    const particles: { x: number; y: number; length: number; speed: number; opacity: number }[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        length: Math.random() * 18 + 12,
        speed: Math.random() * 1.5 + 1.2,
        opacity: Math.random() * 0.5 + 0.3,
      });
    }

    // Góc gió Tây Nam sang Đông Bắc (~45 độ)
    const angle = (45 * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle); // Hướng lên trên và sang phải

    let isRunning = true;

    function renderWind() {
      if (!isRunning || !ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";

      particles.forEach((p) => {
        ctx.strokeStyle = `rgba(56, 189, 248, ${p.opacity})`;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + dx * p.length, p.y + dy * p.length);
        ctx.stroke();

        // Di chuyển hạt
        p.x += dx * p.speed;
        p.y += dy * p.speed;

        // Vòng lặp khi ra ngoài màn hình
        if (p.x > canvas.width + 30 || p.y < -30) {
          p.x = Math.random() * canvas.width * 0.8;
          p.y = canvas.height + Math.random() * 20;
        }
      });

      animationFrameRef.current = requestAnimationFrame(renderWind);
    }

    renderWind();

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [showWindStream]);

  // ĐỒNG BỘ 100% CẤP PHƯỜNG / XÃ TRÊN TOÀN BỘ MARKER
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existingMarkers = markersMapRef.current;
    const currentStationIds = new Set(stations.map((s) => s.id));

    // Xóa marker không còn
    existingMarkers.forEach((marker, id) => {
      if (!currentStationIds.has(id)) {
        marker.remove();
        existingMarkers.delete(id);
      }
    });

    // Cập nhật hoặc tạo mới marker với TÊN PHƯỜNG / XÃ CHUẨN XÁC
    stations.forEach((station) => {
      const aqi = station.latest_aqi?.aqi_value ?? 0;
      const color = station.latest_aqi?.color_hex ?? "#EAB308";
      const symbol = station.latest_aqi?.symbol ?? "●";
      const isSelected = selectedStation?.id === station.id;

      // Trích xuất TÊN PHƯỜNG / XÃ gọn gàng: Bỏ chữ "Trạm", bỏ dấu ngoặc đơn
      const cleanWardName = station.name
        .replace(/^Trạm\s+/i, "")
        .split("(")[0]
        .trim();

      let marker = existingMarkers.get(station.id);

      if (!marker) {
        const el = document.createElement("div");
        el.className = "station-marker cursor-pointer flex flex-col items-center transition-transform duration-150";
        el.style.willChange = "transform";
        el.innerHTML = `
          <div class="badge flex items-center justify-center w-9 h-9 rounded-full font-bold text-xs text-neutral-950 border border-white/80 shadow-md transition-all duration-200"
               style="background-color: ${color};">
            <span class="mr-0.5 text-[10px]">${symbol}</span>
            <span>${aqi}</span>
          </div>
          <div class="name-tag mt-0.5 px-2 py-0.5 rounded-full bg-slate-950/90 border border-neutral-800 text-[10px] font-semibold text-neutral-200 whitespace-nowrap shadow pointer-events-none">
            ${cleanWardName}
          </div>
        `;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          isClickingStationRef.current = true;
          setTimeout(() => {
            isClickingStationRef.current = false;
          }, 300);
          onSelectStation(station);
        });

        marker = new maplibregl.Marker({ element: el })
          .setLngLat([station.longitude, station.latitude])
          .addTo(map);

        existingMarkers.set(station.id, marker);
      } else {
        marker.setLngLat([station.longitude, station.latitude]);
      }

      const el = marker.getElement();
      if (isSelected) {
        el.classList.add("scale-125", "z-30");
      } else {
        el.classList.remove("scale-125", "z-30");
      }
    });
  }, [stations, selectedStation, onSelectStation]);

  // Di chuyển tới trạm được chọn (chỉ trạm thực tế, không can thiệp điểm ảo để camera đứng yên)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStation) return;
    if ((selectedStation as any).metadata?.is_virtual) return;

    map.flyTo({
      center: [selectedStation.longitude, selectedStation.latitude],
      zoom: 13,
      speed: 1.2,
      curve: 1.2,
    });
  }, [selectedStation]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Canvas Lớp phủ Dòng Gió Động (Wind Stream Particle Layer) */}
      {showWindStream && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-10 w-full h-full"
        />
      )}

      {/* Floating Widget: Thẻ Hiển Thị Lộ Trình Không Khí Sạch Đang Kích Hoạt */}
      {activeRoute && (
        <div className="absolute top-20 left-4 z-20 p-3.5 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-emerald-500/40 shadow-2xl flex flex-col space-y-2 max-w-sm font-sans animate-in fade-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between">
            <span className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400">
              <Navigation className="w-4 h-4" />
              <span>Lộ Trình Không Khí Sạch</span>
            </span>
            {onClearRoute && (
              <button
                onClick={onClearRoute}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"
                aria-label="Xóa lộ trình"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-[11px] text-neutral-300">
            Từ: <strong className="text-white">{activeRoute.fromWard}</strong> → Đến:{" "}
            <strong className="text-white">{activeRoute.toWard}</strong>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-1 border-t border-neutral-800/80">
            <div className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800">
              <span className="text-neutral-500 block">Khoảng cách</span>
              <span className="font-bold text-white text-xs">{activeRoute.distanceKm} km</span>
            </div>
            <div className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800">
              <span className="text-neutral-500 block">Độ sạch AQI</span>
              <span className="font-bold text-emerald-400 text-xs">{activeRoute.avgAqi}</span>
            </div>
            <div className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800">
              <span className="text-neutral-500 block">Hít ít bụi hơn</span>
              <span className="font-bold text-sky-400 text-xs">-{activeRoute.avoidedExposurePercent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Spatial Inspection Prompt Banner */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-slate-950/90 backdrop-blur-md border border-neutral-800 shadow-xl flex items-center space-x-2 text-xs text-neutral-300">
        <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span>Chạm vào bất kỳ điểm nào trên bản đồ để cắm cờ xem độ sạch không khí tại đó</span>
      </div>
    </div>
  );
}
