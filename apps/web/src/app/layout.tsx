import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AirSense AI — Giám sát & Dự báo Ô nhiễm Không khí Web GIS",
  description:
    "Nền tảng Web GIS giám sát chất lượng không khí thời gian thực, tính toán VN_AQI NowCast chuẩn QCVN 05:2023 và lưu trữ cục bộ Offline-First.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="antialiased min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
