/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./public/**/*.html"],
  theme: {
    extend: {
      // SafeRent palette tokens (used sparingly in Tailwind classes).
      // Most theming comes from CSS vars in src/styles.css.
      colors: {
        ink: "#070B13", // app background
        panel: "#0B1320", // card surface
        glow: "#0C6C86", // primary
        aqua: "#18B5C9", // accent
      },
    },
  },
  plugins: [],
};
