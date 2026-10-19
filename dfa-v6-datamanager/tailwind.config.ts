import type { Config } from "tailwindcss";
import styleguidePreset from "@dfa-v6/styleguide/tailwind-preset";

export default {
  presets: [styleguidePreset],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  plugins: [],
} satisfies Config;
