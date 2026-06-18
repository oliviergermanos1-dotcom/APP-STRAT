import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#0D2243",
        gold: "#C9A84C",
        aglgreen: "#1A7C4F",
        aglorange: "#E05A00",
        aglblue: "#2563A8",
        aglteal: "#0E7490",
        aglred: "#CC2200",
      },
      fontFamily: {
        sans: ["Calibri", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
