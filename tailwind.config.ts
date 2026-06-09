import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        fukamidori: {
          DEFAULT: '#1f3d2f',
          dark: '#16301f',
        },
        kinari: '#efe9dc',
        kincha: '#c9a24a',
      },
      fontFamily: {
        serif: ['var(--font-noto-serif-jp)', 'serif'],
      },
    },
  },
  plugins: [],
};
export default config;
