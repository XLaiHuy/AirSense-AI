"use client";

import { useEffect, useState } from "react";
import { localDB, LocalStation, LocalStationHistory } from "@/lib/db/airsense-local-db";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const [cities, setCities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadCities() {
      try {
        const res = await fetch(`${API_BASE}/v1/air/cities`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setCities(data);
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.warn("[Cities] Không load được danh sách đô thị:", err);
        if (isMounted) setIsLoading(false);
      }
    }
    loadCities();
    return () => { isMounted = false; };
  }, []);

  return { cities, isLoading };
}

export function useDashboardStudio(cityId: string = "tp-ho-chi-minh") {
  const [studioData, setStudioData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchStudioData() {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/v1/air/cities/${cityId}/dashboard`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setStudioData(data);
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.warn("[DashboardStudio] Lỗi tải dữ liệu studio:", err);
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


