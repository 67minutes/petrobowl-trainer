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
        }
      },
      boxShadow: {
        line: "inset 0 0 0 1px rgb(15 23 42 / 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
