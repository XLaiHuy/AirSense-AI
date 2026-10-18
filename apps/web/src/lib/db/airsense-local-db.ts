import Dexie, { type Table } from "dexie";

export interface LocalStation {
  id: string;
  name: string;
  provider: string;
  latitude: number;
  longitude: number;
  status: string;
  latest_aqi?: {
    aqi_value: number;
    category: string;
    label_vi: string;
    color_hex: string;
    symbol: string;
    health_advice_vi: string;
    dominant_pollutant: string;
    sub_indices: Record<string, number>;
  };
  latest_measurements?: Record<string, any>;
  last_updated?: string;
  synced_at: number;
}

export interface LocalStationHistory {
  id?: number;
  station_id: string;
  data: {
    station_id: string;
    station_name: string;
    last_updated: string;
    time_labels: string[];
    pm25: number[];
    pm10: number[];
    latest_aqi?: any;
  };
  synced_at: number;
}

export class AirSenseLocalDatabase extends Dexie {
  stations!: Table<LocalStation, string>;
  history!: Table<LocalStationHistory, number>;

  constructor() {
    super("AirSenseLocalDB");
    this.version(1).stores({
      stations: "id, last_updated, synced_at",
      history: "++id, station_id, synced_at",
    });
  }
}

export const localDB = new AirSenseLocalDatabase();

// Đăng ký quyền lưu trữ bền vững (Persistent Storage)
if (typeof window !== "undefined" && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((isPersisted) => {
    if (isPersisted) {
      console.info("[AirSense LocalDB] Bộ nhớ đệm IndexedDB đã được cấp quyền Persistent Storage.");
    }
  });
}
