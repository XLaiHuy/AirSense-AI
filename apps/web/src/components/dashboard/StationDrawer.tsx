"use client";

import React, { useState } from "react";
import { LocalStation } from "@/lib/db/airsense-local-db";
import { useStationHistory } from "@/hooks/useAirQuality";
import {
  X,
  ShieldCheck,
  Activity,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";

interface StationDrawerProps {
  station: LocalStation | null;
  onClose: () => void;
}

export default function StationDrawer({ station, onClose }: StationDrawerProps) {
  const { history, isLoading } = useStationHistory(station?.id || null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!station) return null;

  const aqi = station.latest_aqi?.aqi_value ?? 0;
  const labelVi = station.latest_aqi?.label_vi ?? "Trung bình";
  const color = station.latest_aqi?.color_hex ?? "#EAB308";
  const symbol = station.latest_aqi?.symbol ?? "◆";
  const dominant = station.latest_aqi?.dominant_pollutant ?? "pm25";

  // Lời khuyên đời sống gần gũi (Human-centric)
  const getCitizenAdvice = (aqiValue: number) => {
    if (aqiValue <= 50) {
      return {
        statusText: "Không khí Trong lành",
        recommendation: "Thời điểm lý tưởng để chạy bộ, tập thể dục và mở toang cửa sổ đón gió tự nhiên vào nhà.",
        actionIcon: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
        badgeBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
      };
    }
    if (aqiValue <= 100) {
      return {
        statusText: "Không khí Trung bình",
        recommendation: "Chất lượng không khí ở mức chấp nhận được. Người có tiền sử hô hấp hoặc trẻ nhỏ nên hạn chế vận động gắng sức vào giờ cao điểm xe cộ.",
        actionIcon: <Info className="w-4 h-4 text-yellow-400 flex-shrink-0" />,
        badgeBg: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
      };
    }
    if (aqiValue <= 150) {
      return {
        statusText: "Chất lượng Không khí Kém",
        recommendation: "Nên đeo khẩu trang chống bụi mịn khi di chuyển trên đường. Hạn chế tập thể dục ngoài trời, ưu tiên rèn luyện trong nhà.",
        actionIcon: <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />,
        badgeBg: "bg-orange-500/15 border-orange-500/30 text-orange-300",
      };
    }
    return {
      statusText: "Chất lượng Không khí Xấu",
      recommendation: "Mức ô nhiễm có hại cho sức khỏe mọi người. Khuyến nghị đóng kín cửa sổ sổ, bật máy lọc không khí và hạn chế ra ngoài.",
      actionIcon: <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />,
      badgeBg: "bg-rose-500/15 border-rose-500/30 text-rose-300",
    };
  };

  const adviceMeta = getCitizenAdvice(aqi);

  return (
    <aside
      className="absolute top-20 right-4 z-30 w-[360px] sm:w-[400px] max-h-[calc(100vh-6rem)] overflow-y-auto bg-slate-950/95 backdrop-blur-2xl border border-neutral-800 rounded-2xl shadow-2xl p-5 text-neutral-100 flex flex-col space-y-4 font-sans animate-in fade-in slide-in-from-right-4 duration-200"
      aria-label="Thông tin chất lượng không khí"
    >
      {/* 1. Header vị trí tinh giản */}
      <div className="flex items-start justify-between border-b border-neutral-800/80 pb-3">
        <div className="pr-3">
          <div className="flex items-center space-x-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-semibold tracking-wider text-amber-300">
              {(station as any).metadata?.is_virtual ? "🚩 Điểm bạn vừa chọn (Ước lượng Vệ tinh)" : `Trạm đo chuẩn ${station.provider.toUpperCase()}`}
            </span>
          </div>
          <h2 className="text-base font-bold text-white tracking-tight leading-snug">
            {station.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition"
          aria-label="Đóng bảng"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 2. THẺ CHÍNH CHO NGƯỜI DÂN THƯỜNG (Editorial Minimalist) */}
      <div className="p-4 rounded-xl bg-neutral-900/90 border border-neutral-800 flex flex-col space-y-3">
        {/* Hàng trên: Trạng thái & 1 Chỉ số AQI duy nhất */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-400 font-medium">Chất lượng không khí</div>
            <div className={`mt-1 inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${adviceMeta.badgeBg}`}>
              <span>{symbol}</span>
              <span>{adviceMeta.statusText}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: color }}>
              {aqi}
            </div>
            <div className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider mt-0.5">
              Chỉ số VN_AQI
            </div>
          </div>
        </div>

        {/* Khuyến cáo hành động sức khỏe đời sống */}
        <div className="pt-2 border-t border-neutral-800/60 flex items-start space-x-2.5 text-xs text-neutral-300 leading-relaxed">
          {adviceMeta.actionIcon}
          <p>{adviceMeta.recommendation}</p>
        </div>
      </div>

      {/* 3. NÚT MỞ RỘNG THÔNG SỐ CHUYÊN SÂU */}
      <button
        onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-900 text-xs font-semibold text-neutral-300 border border-neutral-800 transition"
      >
        <div className="flex items-center space-x-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
          <span>Thông số kỹ thuật & Biểu đồ phân tích</span>
        </div>
        {showTechnicalDetails ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>

      {/* 4. PHẦN MỞ RỘNG (CHỈ KHI NGƯỜI DÙNG BẤM MỞ) */}
      {showTechnicalDetails && (
        <div className="flex flex-col space-y-3 pt-1 animate-in fade-in duration-200">
          {/* Thông số vị trí kỹ thuật */}
          <div className="px-3 py-2 rounded-lg bg-neutral-900/40 border border-neutral-800/60 text-[11px] text-neutral-400 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-neutral-500" />
              <span>Tọa độ quan trắc:</span>
            </span>
            <span className="font-mono text-neutral-300">
              {station.latitude.toFixed(4)}°N, {station.longitude.toFixed(4)}°E
            </span>
          </div>

          {/* Lưới các chất ô nhiễm đo được */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {station.latest_measurements && station.latest_measurements.length > 0 ? (
              station.latest_measurements.map((m: any, idx: number) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800/80 flex items-center justify-between"
                >
                  <span className="uppercase font-semibold text-neutral-400">{m.pollutant}</span>
                  <span className="font-bold text-white">
                    {m.value.toFixed(1)} <span className="text-[10px] text-neutral-400 font-normal">{m.unit}</span>
                  </span>
                </div>
              ))
            ) : (
              <div className="col-span-2 p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800/80 text-center text-neutral-400 text-xs">
                Chất quyết định chính: <strong className="uppercase text-white">{dominant}</strong>
              </div>
            )}
          </div>

          {/* Diễn biến nồng độ 12 giờ qua */}
          <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 flex flex-col space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5 font-semibold text-neutral-300">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>Diễn biến PM2.5 (12 giờ gần nhất)</span>
              </span>
              {isLoading && <span className="text-[10px] text-neutral-400 animate-pulse">Đang nạp...</span>}
            </div>

            {history && history.pm25 && history.pm25.length > 0 ? (
              <div className="h-20 flex items-end justify-between space-x-1 pt-2">
                {history.pm25.map((val: number, idx: number) => {
                  const maxVal = Math.max(...history.pm25, 60);
                  const heightPercent = Math.min(100, Math.max(15, (val / maxVal) * 100));
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group relative">
                      <div
                        className="w-full rounded-t transition-all duration-200 group-hover:brightness-125"
                        style={{
                          height: `${heightPercent}%`,
                          backgroundColor: val > 50 ? "#EF4444" : val > 25 ? "#EAB308" : "#10B981",
                        }}
                      />
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/95 border border-neutral-800 text-[10px] text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-40 transition">
                        {val} µg/m³
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-14 flex items-center justify-center text-xs text-neutral-500">
                Chưa có lịch sử chuỗi giờ
              </div>
            )}

            <div className="text-[10px] text-neutral-400 pt-1 text-right">
              Quy chuẩn: QCVN 05:2023/BTNMT
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
