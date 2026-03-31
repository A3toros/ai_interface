/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Arial",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.6), 0 12px 40px rgba(56,189,248,0.25)",
      },
      backgroundImage: {
        "futuristic-radial":
          "radial-gradient(1200px 800px at 15% 10%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(900px 700px at 85% 15%, rgba(34,197,94,0.18), transparent 55%), radial-gradient(900px 700px at 50% 100%, rgba(236,72,153,0.15), transparent 60%)",
      },
    },
  },
  plugins: [],
};

