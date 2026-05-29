import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sage: {
          DEFAULT: "#4A5D4F",
          dark: "#2C3A2E",
          light: "#8A9580",
        },
        cream: {
          DEFAULT: "#FAF7F2",
          warm: "#F2EDE3",
          edge: "#E0D9CC",
        },
        ink: "#2C3A2E",
        mute: "#B5B1A4",
        crisis: "#C75151",
      },
      fontFamily: {
        serif: ["Georgia", "ui-serif", "serif"],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        bubble: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
