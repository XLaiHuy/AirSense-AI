---
name: airsense-offline-local-cache
description: "Quy chuẩn thiết kế Local Caching & Offline-First cho Web Client: Tự động lưu dữ liệu quan trắc và tiles vào IndexedDB (Dexie.js) / CacheStorage, chiến lược Stale-While-Revalidate, HTTP ETag / 304, giúp vào app hiển thị tức thì không cần gọi lại API."
---

# AirSense AI — Client-Side Local Caching & Offline Resilience Skill

Kỹ năng chuyên sâu về **Lưu trữ Cục bộ (Local Persistence) và Cơ chế Offline-First** trên giao diện Web/PWA của AirSense AI. Đảm bảo toàn bộ dữ liệu quan trắc, lịch sử trạm, dự báo thời tiết và bản đồ sau khi tải về được lưu bền vững trên thiết bị người dùng, mở app là thấy ngay tức thì mà không cần gọi lại API.

---

## 1. Kiến trúc Lưu trữ Cục bộ 3 Tầng (3-Tier Local Storage)

```
                       NGƯỜI DÙNG MỞ LẠI APP
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼ (< 50ms)                                      ▼ (Chạy ngầm)
Hiển thị ngay từ IndexedDB                      Background Revalidation
(Bản đồ, trạm, chỉ số gần nhất)                 Gửi request ETag / If-Modified-Since
        │                                               │
        │                                ┌──────────────┴──────────────┐
        │                                ▼ (HTTP 304)                  ▼ (Có dữ liệu mới)
        └────────────────────────► Giữ nguyên local              Ghi đè IndexedDB
                                  (0 byte băng thông)            & cập nhật số liệu UI
```

| Tầng lưu trữ | Công nghệ | Dữ liệu quản lý | Chiến lược lưu trữ |
| :--- | :--- | :--- | :--- |
| **Tầng 1: CSDL Cấu trúc** | **Dexie.js (IndexedDB)** | Danh sách trạm, nồng độ gần nhất, lịch sử 24h, dự báo, bookmark | Bền vững (Persistent Storage), dung lượng lớn (>100MB), không bị giới hạn 5MB như localStorage. |
| **Tầng 2: Bản đồ & Tài nguyên** | **CacheStorage (Service Worker)** | Tile nền MapLibre, font Be Vietnam Pro, app shell, icons | **Cache-First** cho Vector Tiles & Fonts; **Stale-While-Revalidate** cho Stylesheet. |
| **Tầng 3: Bộ nhớ Phiên** | **TanStack Query (Memory Cache)** | Dữ liệu phiên hiện tại, trạng thái hover trạm, UI state | Giữ phản hồi tức thời giữa các component trong cùng phiên duyệt. |

---

## 2. Thiết kế Schema Cơ sở Dữ liệu Local (Dexie.js)

```typescript
// apps/web/lib/db/airsense-local-db.ts
import Dexie, { Table } from 'dexie';

export interface LocalStation {
  id: string;               // Mã trạm (vd: us-consulate-hcm)
  name: string;             // Tên hiển thị
  lat: number;
  lon: number;
  lastAqi: number | null;
  lastPollutant: string;
  observedAt: string;       // Timestamp UTC
  syncedAt: number;         // Timestamp local lúc lưu cache
}

export interface LocalMeasurementHistory {
  id?: number;
  stationId: string;
  pollutant: string;
  observedAt: string;
  value: number;
  unit: string;
}

export interface LocalForecastSnapshot {
  gridOrStationId: string;
  issuedAt: string;
  validAt: string;
  pollutant: string;
  value: number;
  uncertainty?: number;
}

export class AirSenseLocalDatabase extends Dexie {
  stations!: Table<LocalStation, string>;
  history!: Table<LocalMeasurementHistory, number>;
  forecasts!: Table<LocalForecastSnapshot, string>;

  constructor() {
    super('AirSenseLocalDB');
    this.version(1).stores({
      stations: 'id, lastAqi, observedAt, syncedAt',
      history: '++id, [stationId+pollutant], observedAt',
      forecasts: '[gridOrStationId+pollutant+validAt], issuedAt',
    });
  }
}

export const localDB = new AirSenseLocalDatabase();
```

---

## 3. Chiến lược Đồng bộ: Stale-While-Revalidate với HTTP ETag & 304

### Pattern: Hook Tải Dữ liệu Thông minh
Khi mở trang web hoặc bấm vào một trạm quan trắc:

```typescript
// apps/web/hooks/useStationData.ts
import { useEffect, useState } from 'react';
import { localDB, LocalStation } from '@/lib/db/airsense-local-db';

export function useStationData(stationId: string) {
  const [data, setData] = useState<LocalStation | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadWithCache() {
      // 1. ĐỌC NGAY TỪ INDEXEDDB (Tốc độ < 50ms - Zero-latency first paint)
      const cached = await localDB.stations.get(stationId);
      if (cached && isMounted) {
        setData(cached);
      }

      // Nếu người dùng đang offline, dừng tại đây và hiển thị dữ liệu cache
      if (!navigator.onLine) {
        setIsOffline(true);
        return;
      }

      // 2. GỬI REQUEST NGẦM KIỂM TRA BẢN MỚI (Background Revalidation)
      try {
        setIsRefreshing(true);
        const headers: HeadersInit = {};
        if (cached?.observedAt) {
          headers['If-Modified-Since'] = new Date(cached.observedAt).toUTCString();
        }

        const res = await fetch(`/v1/air/stations/${stationId}`, { headers });

        // Trường hợp server báo chưa có dữ liệu mới (HTTP 304): KHÔNG CẦN TẢI LẠI
        if (res.status === 304) {
          console.info(`[Cache] Dữ liệu trạm ${stationId} vẫn mới nhất, giữ nguyên local.`);
          return;
        }

        if (res.ok) {
          const fresh = await res.json();
          // Cập nhật vào IndexedDB để lần sau dùng
          await localDB.stations.put({
            ...fresh,
            syncedAt: Date.now(),
          });
          if (isMounted) setData(fresh);
        }
      } catch (err) {
        console.warn(`[Network] Mất kết nối, sử dụng dữ liệu local:`, err);
        setIsOffline(true);
      } finally {
        if (isMounted) setIsRefreshing(false);
      }
    }

    loadWithCache();
    return () => { isMounted = false; };
  }, [stationId]);

  return { data, isOffline, isRefreshing };
}
```

---

## 4. Cache Nền Bản đồ (Map Tiles CacheStorage)

Để tránh mỗi lần cuộn bản đồ phải tải lại hàng trăm vector tiles:
1. **Đăng ký Service Worker Cache Rule**:
   - URL mẫu: `https://tile.openstreetmap.org/*` hoặc `/v1/maps/*`.
   - Sử dụng chiến lược **Cache-First** với thời gian hết hạn (TTL) là 7 ngày:
     ```javascript
     // sw.js
     workbox.routing.registerRoute(
       ({ url }) => url.pathname.includes('/v1/maps/tiles/'),
       new workbox.strategies.CacheFirst({
         cacheName: 'airsense-map-tiles-v1',
         plugins: [
           new workbox.expiration.ExpirationPlugin({
             maxEntries: 1000,
             maxAgeSeconds: 7 * 24 * 60 * 60, // 7 ngày
           }),
         ],
       })
     );
     ```
2. **Yêu cầu Quyền Lưu trữ Bền vững (Persistent Storage)**:
   ```typescript
   if (navigator.storage && navigator.storage.persist) {
     const isPersisted = await navigator.storage.persist();
     console.info(`[Storage] Trạng thái lưu trữ bền vững: ${isPersisted}`);
   }
   ```
   *Điều này ngăn chặn trình duyệt (đặc biệt là Safari iOS và Chrome Android) tự ý xóa bộ nhớ đệm khi thiết bị gần đầy dung lượng.*

---

## 5. Trải nghiệm Người dùng khi Chạy Offline (UX Protocol)

- **Biểu ngữ Trạng thái (Status Banner)**: Khi mất mạng, hiển thị dải thông báo mờ tinh tế ở đầu màn hình:
  > *"📶 Đang hiển thị dữ liệu lưu cục bộ lúc 14:30 (Chế độ ngoại tuyến). Dữ liệu sẽ tự động làm mới khi có mạng trở lại."*
- **Không bao giờ khóa tương tác**: Người dùng vẫn có thể phóng to/thu nhỏ các khu vực đã tải, xem biểu đồ lịch sử 24h đã lưu và đọc các khuyến cáo sức khỏe có sẵn.
