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

  // --------------------------------------------------------------------------
  // BỘ NỘI SUY TRƯỜNG GIÓ ĐỊA LÝ & CHẤT LƯỢNG KHÔNG KHÍ (SPATIAL WIND & AQI FIELD)
  // --------------------------------------------------------------------------
  const getWindAndAqiAt = useCallback((lng: number, lat: number) => {
    // Xác định macro wind cơ bản theo vĩ độ Việt Nam
    // Miền Nam (<12.0): Gió Tây Nam (thổi TỚI Đông Bắc ~45°)
    // Miền Trung (12.0 - 18.0): Gió Biển Đông (thổi TỚI Tây Tây Nam ~250°)
    // Miền Bắc (>18.0): Gió Đông Bắc (thổi TỚI Tây Nam ~225°)
    let baseDeg = 225; // Thổi TỪ Tây Nam
    let baseSpeed = 8.5; // km/h
    if (lat > 18.0) {
      baseDeg = 45; // Thổi TỪ Đông Bắc (Hà Nội, Hải Phòng)
      baseSpeed = 10.2;
    } else if (lat > 13.0) {
      baseDeg = 85; // Thổi TỪ Biển Đông vào (Đà Nẵng, Huế)
      baseSpeed = 12.0;
    }

    // Góc gió thổi TỚI (wind blows TOWARDS)
    const baseTowardsRad = ((baseDeg + 180) % 360) * (Math.PI / 180);

    // Tính toán ảnh hưởng vi khí hậu từ các trạm quan trắc xung quanh
    let totalWeight = 0;
    let weightedU = 0;
    let weightedV = 0;
    let weightedAqi = 0;

    for (const s of stations) {
      const dLng = s.longitude - lng;
      const dLat = s.latitude - lat;
      const distSq = dLng * dLng + dLat * dLat;
      const dist = Math.sqrt(distSq);

      // Bán kính ảnh hưởng vi khí hậu địa phương ~35km (0.35 độ)
      if (dist < 0.35) {
        const weight = 1 / Math.max(0.0005, dist * dist);
        totalWeight += weight;

        // Góc vi khí hậu uốn lượn theo địa hình trạm (sông ngòi, ven biển)
        const localAngleOffset = Math.sin(s.latitude * 24 + s.longitude * 16) * 0.4;
        const localTowardsRad = baseTowardsRad + localAngleOffset;
        const localSpeed = baseSpeed + (Math.sin(s.latitude * 35) * 2.2);

        weightedU += Math.sin(localTowardsRad) * localSpeed * weight;
        weightedV += Math.cos(localTowardsRad) * localSpeed * weight;

        const aqiVal = s.latest_aqi?.aqi_value || 65;
        weightedAqi += aqiVal * weight;
      }
    }

    if (totalWeight > 0) {
      return {
        u: weightedU / totalWeight,
        v: weightedV / totalWeight,
        aqi: weightedAqi / totalWeight,
      };
    }

    // Ngoại suy ngoài xa: Macro wind có nhiễu xoáy nhẹ
    const macroOffset = Math.sin(lat * 16 + lng * 14) * 0.25;
    const finalTowardsRad = baseTowardsRad + macroOffset;
    return {
      u: Math.sin(finalTowardsRad) * baseSpeed,
      v: Math.cos(finalTowardsRad) * baseSpeed,
      aqi: 60,
    };
  }, [stations]);

  // --------------------------------------------------------------------------
  // TÍNH NĂNG 3: DÒNG GIÓ ĐỊA LÝ ĐỐI LƯU BỤI MỊN 60FPS (GEOREFERENCED WIND STREAM)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !showWindStream || !map) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Kích thước canvas đồng bộ khung nhìn
    const updateCanvasSize = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth || window.innerWidth;
      const height = parent?.clientHeight || window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    updateCanvasSize();

    // Giới hạn địa lý hiện tại của viewport (kèm padding 15% để sinh hạt ngoài mép)
    const getActiveBounds = () => {
      const b = map.getBounds();
      const lngPadding = (b.getEast() - b.getWest()) * 0.15;
      const latPadding = (b.getNorth() - b.getSouth()) * 0.15;
      return {
        minLng: b.getWest() - lngPadding,
        maxLng: b.getEast() + lngPadding,
        minLat: b.getSouth() - latPadding,
        maxLat: b.getNorth() + latPadding,
      };
    };

    interface GeoParticle {
      lng: number;
      lat: number;
      age: number;
      maxAge: number;
      speedMult: number;
      trail: { x: number; y: number }[];
    }

    const particleCount = 120;
    const particles: GeoParticle[] = [];

    const spawnParticle = (p?: GeoParticle): GeoParticle => {
      const bounds = getActiveBounds();
      const lng = bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng);
      const lat = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
      const maxAge = Math.floor(Math.random() * 85 + 65);
      const speedMult = Math.random() * 0.4 + 0.8;

      if (p) {
        p.lng = lng;
        p.lat = lat;
        p.age = 0;
        p.maxAge = maxAge;
        p.speedMult = speedMult;
        p.trail = [];
        return p;
      }

      return {
        lng,
        lat,
        age: Math.floor(Math.random() * maxAge),
        maxAge,
        speedMult,
        trail: [],
      };
    };

    for (let i = 0; i < particleCount; i++) {
      particles.push(spawnParticle());
    }

    let isRunning = true;

    // Reset trail khi người dùng kéo/zoom bản đồ để loại bỏ vệt kéo dài đột ngột
    const handleMapMove = () => {
      particles.forEach((p) => {
        p.trail = [];
      });
    };
    map.on("movestart", handleMapMove);
    map.on("zoomstart", handleMapMove);

    function renderWind() {
      if (!isRunning || !ctx || !canvas || !map) return;

      // Xóa khung hình Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bounds = getActiveBounds();

      particles.forEach((p) => {
        // 1. Lấy vector vận tốc và chỉ số AQI cục bộ tại tọa độ địa lý của hạt
        const { u, v, aqi } = getWindAndAqiAt(p.lng, p.lat);

        // 2. Di chuyển hạt theo kinh/vĩ độ thực tế (1 độ ~ 111km)
        const dt = 0.000075 * p.speedMult;
        p.lng += u * dt;
        p.lat += v * dt;
        p.age++;

        // 3. Chiếu tọa độ địa lý sang pixel màn hình hiện tại
        const screenPt = map.project([p.lng, p.lat]);

        // Nếu hạt vượt ra ngoài khung nhìn địa lý hoặc hết vòng đời -> Tái sinh
        if (
          p.age >= p.maxAge ||
          p.lng < bounds.minLng ||
          p.lng > bounds.maxLng ||
          p.lat < bounds.minLat ||
          p.lat > bounds.maxLat ||
          screenPt.x < -60 ||
          screenPt.x > canvas.width + 60 ||
          screenPt.y < -60 ||
          screenPt.y > canvas.height + 60
        ) {
          spawnParticle(p);
          return;
        }

        // Lưu vết vệt gió (Trail)
        p.trail.push({ x: screenPt.x, y: screenPt.y });
        if (p.trail.length > 7) {
          p.trail.shift();
        }

        if (p.trail.length < 2) return;

        // 4. Đổi màu hạt theo mức độ ô nhiễm AQI (Pollution Advection Flow)
        let strokeColor = "rgba(56, 189, 248, 0.65)"; // Sky blue
        if (aqi <= 50) {
          strokeColor = "rgba(16, 185, 129, 0.75)"; // Trong lành - Xanh ngọc
        } else if (aqi <= 100) {
          strokeColor = "rgba(234, 179, 8, 0.8)"; // Trung bình - Vàng hổ phách
        } else if (aqi <= 150) {
          strokeColor = "rgba(249, 115, 22, 0.9)"; // Kém - Cam nóng
        } else {
          strokeColor = "rgba(239, 68, 68, 0.95)"; // Xấu/Nguy hại - Đỏ
        }

        // 5. Vẽ vệt uốn lượn mềm mại
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let j = 1; j < p.trail.length; j++) {
          ctx.lineTo(p.trail[j].x, p.trail[j].y);
        }
        ctx.stroke();

        // 6. Điểm sáng nhẹ ở đầu hạt gió
        const head = p.trail[p.trail.length - 1];
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(renderWind);
    }

    renderWind();

    window.addEventListener("resize", updateCanvasSize);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      map.off("movestart", handleMapMove);
      map.off("zoomstart", handleMapMove);
      window.removeEventListener("resize", updateCanvasSize);
    };
  }, [showWindStream, getWindAndAqiAt]);

  // ĐỒNG BỘ 100% CẤP PHƯỜNG / XÃ TRÊN TOÀN BỘ MARKER (KHÔNG CÓ ĐỘ TRỄ CSS TRANSFORM)
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
        // LOẠI BỎ transition-transform để marker bám chặt 60fps tức thì khi kéo bản đồ
        el.className = "station-marker cursor-pointer flex flex-col items-center select-none pointer-events-auto";
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
      const badge = el.querySelector(".badge");
      if (isSelected) {
        badge?.classList.add("scale-125", "ring-2", "ring-white");
        el.classList.add("z-30");
      } else {
        badge?.classList.remove("scale-125", "ring-2", "ring-white");
        el.classList.remove("z-30");
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
