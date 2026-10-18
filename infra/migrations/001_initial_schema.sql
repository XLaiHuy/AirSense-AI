-- AirSense AI - Initial Database Schema (PostgreSQL + PostGIS)
-- Tuân thủ QCVN 05:2023/BTNMT & Quyết định 1459/QĐ-TCMT

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Bảng danh mục trạm quan trắc (stations)
CREATE TABLE IF NOT EXISTS stations (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stations_gist ON stations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_stations_provider ON stations(provider);

-- 2. Bảng chuỗi số đo quan trắc (air_measurements)
CREATE TABLE IF NOT EXISTS air_measurements (
    id BIGSERIAL PRIMARY KEY,
    station_id VARCHAR(64) NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    observed_at TIMESTAMPTZ NOT NULL,
    pollutant VARCHAR(32) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(32) NOT NULL DEFAULT 'ug/m3',
    data_kind VARCHAR(32) NOT NULL DEFAULT 'observed',
    quality_flag VARCHAR(32) NOT NULL DEFAULT 'good',
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_station_pollutant_observed UNIQUE (station_id, pollutant, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_measurements_lookup 
    ON air_measurements(station_id, pollutant, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_observed_at 
    ON air_measurements(observed_at DESC);

-- 3. Bảng ảnh chụp AQI tổng hợp (aqi_snapshots)
CREATE TABLE IF NOT EXISTS aqi_snapshots (
    id BIGSERIAL PRIMARY KEY,
    station_id VARCHAR(64) NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    aqi_value INTEGER NOT NULL,
    dominant_pollutant VARCHAR(32) NOT NULL,
    aqi_category VARCHAR(32) NOT NULL,
    category_label_vi VARCHAR(64) NOT NULL,
    calculation_method VARCHAR(64) NOT NULL DEFAULT 'NOWCAST_QCVN_05_2023',
    completeness_flag VARCHAR(32) NOT NULL DEFAULT 'FULL'
);

CREATE INDEX IF NOT EXISTS idx_aqi_station_calculated 
    ON aqi_snapshots(station_id, calculated_at DESC);

-- 4. Bảng Landing Zone lưu JSON thô (raw_ingest_payloads)
CREATE TABLE IF NOT EXISTS raw_ingest_payloads (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    raw_data JSONB NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_payload_hash 
    ON raw_ingest_payloads(provider, payload_hash);

-- 5. Bảng Dead-Letter Queue xử lý dữ liệu lỗi/dị thường (ingest_dead_letter)
CREATE TABLE IF NOT EXISTS ingest_dead_letter (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    station_id VARCHAR(64),
    payload JSONB NOT NULL,
    error_reason TEXT NOT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_pending 
    ON ingest_dead_letter(status, next_retry_at) 
    WHERE status = 'PENDING';
