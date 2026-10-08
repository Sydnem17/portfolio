import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        ink: { DEFAULT: "#0B0D12", soft: "#3A3F4B", muted: "#6B7280" },
        line: "#E6E8EC",
        brand: { DEFAULT: "#2F5BFF", soft: "#EEF2FF" },
        good: "#0E9F6E",
        warn: "#D97706",
        bad: "#DC2626",
      },
    },
  },
  plugins: [],
} satisfies Config;
