import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          500: "#64748b",
          700: "#334155",
          900: "#0f172a"
        },
        petrol: {
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7"
        },
        signal: {
          500: "#f59e0b",
          600: "#d97706"
        },
        // Gamification palette.
        gold: {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706"
        },
        combo: {
          400: "#34d399",
          500: "#10b981",
          600: "#059669"
        },
        flame: {
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c"
        }
      },
      boxShadow: {
        line: "inset 0 0 0 1px rgb(15 23 42 / 0.08)",
        glow: "0 0 0 3px rgba(245, 158, 11, 0.35), 0 8px 24px rgba(245, 158, 11, 0.25)"
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.9)" },
          "50%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)" }
        },
        "float-up": {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "15%": { transform: "translateY(0)", opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translateY(-42px)", opacity: "0" }
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-160% 0" },
          "100%": { backgroundPosition: "260% 0" }
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(245, 158, 11, 0.5)" },
          "70%": { boxShadow: "0 0 0 12px rgba(245, 158, 11, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(245, 158, 11, 0)" }
        },
        "banner-in": {
          "0%": { transform: "translateY(-14px) scale(0.96)", opacity: "0" },
          "60%": { transform: "translateY(0) scale(1.02)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" }
        }
      },
      animation: {
        pop: "pop 260ms ease-out",
        "float-up": "float-up 1000ms ease-out forwards",
        shake: "shake 380ms ease-in-out",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-ring": "pulse-ring 1.4s ease-out infinite",
        "banner-in": "banner-in 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2)"
      }
    }
  },
  plugins: []
};

export default config;
