import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#dce6ff",
          200: "#b9ccff",
          300: "#8aaaff",
          400: "#5c85ff",
          500: "#3a5fff",
          600: "#2540f5",
          700: "#1d30d6",
          800: "#1c2cac",
          900: "#1c2b87",
          950: "#141a52",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
        "pulse-fast": "pulse 1s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
