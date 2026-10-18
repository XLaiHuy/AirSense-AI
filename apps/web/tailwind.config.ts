import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Be Vietnam Pro'", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        primary: {
          DEFAULT: "#0EA5E9", // Sky blue for air aesthetic
          foreground: "#FFFFFF",
        },
        aqi: {
          good: "#10B981",         // Xanh lục (Tốt)
          moderate: "#FBBF24",     // Vàng (Trung bình)
          sensitive: "#F97316",    // Cam (Kém)
          unhealthy: "#EF4444",    // Đỏ (Xấu)
          veryUnhealthy: "#A855F7",// Tím (Rất xấu)
          hazardous: "#881337",    // Nâu đỏ (Nguy hại)
        },
      },
    },
  },
  plugins: [],
};

export default config;
