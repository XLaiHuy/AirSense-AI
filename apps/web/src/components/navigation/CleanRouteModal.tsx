"use client";

import React, { useState } from "react";
import {
  Navigation,
  X,
  Sparkles,
  MapPin,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Bike,
  Footprints,
  Car,
} from "lucide-react";
import { fetchCleanRoute } from "@/hooks/useAirQuality";

interface CleanRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRoute: (routeData: any) => void;
  cityId?: string;
}

const PRESET_ROUTES = [
  {
    from: "Phường Bến Nghé",
    to: "Phường Thảo Điền",
    label: "Bến Nghé ➔ Thảo Điền",
    desc: "Dọc hành lang sông Sài Gòn & Cầu Ba Son",
    mode: "bike",
  },
  {
    from: "Phường Bến Nghé",
    to: "Phường Gia Định",
    label: "Bến Nghé ➔ Gia Định",
    desc: "Né vòng xoay Hàng Xanh, đi qua mảng xanh",
    mode: "foot",
  },
  {
    from: "Phường Bến Nghé",
    to: "Phường Phú Mỹ",
    label: "Bến Nghé ➔ Phú Mỹ (Q.7)",
    desc: "Hành lang gió mở ven sông Nhà Bè",
    mode: "car",
  },
];

const AVAILABLE_WARDS = [
  "Phường Bến Nghé",
  "Phường Thảo Điền",
  "Phường Gia Định",
  "Phường Tân Sơn Nhất",
  "Phường Phú Mỹ",
  "Phường An Khánh",
  "Phường Hàng Mã",
  "Phường Hải Châu 1",
];

export default function CleanRouteModal({
  isOpen,
  onClose,
  onSelectRoute,
  cityId = "tp-ho-chi-minh",
}: CleanRouteModalProps) {
  const [fromWard, setFromWard] = useState<string>("Phường Bến Nghé");
  const [toWard, setToWard] = useState<string>("Phường Thảo Điền");
  const [isCalculating, setIsCalculating] = useState(false);

  if (!isOpen) return null;

  async function handleFindRoute(customFrom?: string, customTo?: string) {
    const origin = customFrom || fromWard;
    const destination = customTo || toWard;

    setIsCalculating(true);
    try {
      const res = await fetchCleanRoute(origin, destination, cityId);
      onSelectRoute({
        fromWard: res.from_ward,
        toWard: res.to_ward,
        coordinates: res.coordinates,
        avgAqi: res.avg_aqi,
        distanceKm: res.total_distance_km,
        avoidedExposurePercent: res.exposure_avoidance_percent,
        waypoints: res.waypoints,
        description: res.description,
      });
      onClose();
    } catch (err) {
      console.error("Lỗi khi tìm lộ trình sạch:", err);
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg overflow-hidden bg-slate-950 border border-emerald-500/40 rounded-3xl shadow-2xl text-neutral-100 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800/80 bg-gradient-to-r from-emerald-950/40 to-slate-950">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <Navigation className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-1.5">
                Lộ Trình Không Khí Sạch
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                  GraphRAG AI
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Tìm tuyến đường ít khói bụi nhất, giảm tiếp xúc ô nhiễm
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/70 transition-colors cursor-pointer"
            aria-label="Đóng bảng lộ trình"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Form chọn điểm đi - điểm đến */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
            <div>
              <label className="text-xs font-semibold text-neutral-400 mb-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                Điểm Xuất Phát (Phường/Khu vực)
              </label>
              <select
                value={fromWard}
                onChange={(e) => setFromWard(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-neutral-700 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                {AVAILABLE_WARDS.map((w) => (
                  <option key={`from-${w}`} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-center -my-1">
              <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 border border-neutral-700">
                <ArrowRight className="w-3.5 h-3.5 rotate-90" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-400 mb-1.5 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                Điểm Đích Đến (Phường/Khu vực)
              </label>
              <select
                value={toWard}
                onChange={(e) => setToWard(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-neutral-700 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                {AVAILABLE_WARDS.map((w) => (
                  <option key={`to-${w}`} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lộ trình đề xuất nhanh (Quick Presets) */}
          <div>
            <div className="text-xs font-semibold text-neutral-400 mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Lộ trình mẫu thường đi:
            </div>
            <div className="grid grid-cols-1 gap-2">
              {PRESET_ROUTES.map((route, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setFromWard(route.from);
                    setToWard(route.to);
                    handleFindRoute(route.from, route.to);
                  }}
                  className="w-full p-3 rounded-xl bg-neutral-900/40 hover:bg-neutral-800/80 border border-neutral-800/70 hover:border-emerald-500/40 transition-all text-left flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-neutral-800/80 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                      {route.mode === "bike" ? (
                        <Bike className="w-4 h-4" />
                      ) : route.mode === "foot" ? (
                        <Footprints className="w-4 h-4" />
                      ) : (
                        <Car className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-neutral-200 group-hover:text-emerald-300 transition-colors">
                        {route.label}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {route.desc}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold group-hover:translate-x-1 transition-transform">
                    Chọn ➔
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Lợi ích sức khỏe */}
          <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-start space-x-3 text-xs text-emerald-300">
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <span className="font-bold">Lợi ích kiểm chứng:</span> Tuyến đường sử dụng dữ liệu đối lưu gió thực tế để hướng dẫn bạn qua các tuyến đường râm mát ven kênh/công viên, giúp giảm trung bình <span className="font-bold text-emerald-200">30% - 35%</span> lượng bụi mịn PM2.5 hít vào phổi.
            </div>
          </div>

          {/* Nút hành động */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => handleFindRoute()}
              disabled={isCalculating}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-neutral-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isCalculating ? (
                <>
                  <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  <span>Đang tính toán tuyến đường...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4" />
                  <span>Vẽ Tuyến Đường Sạch Tối Ưu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
