/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Switchback runs dark on purpose: it is played outdoors, at dusk, by
        // people whose phones are already at 20%. One palette, no light mode.
        ink: {
          900: '#0A0C18', // page
          800: '#121729', // cards and sheets
          700: '#1C2340', // raised surfaces
          600: '#2B3358', // borders
          500: '#4A5583', // muted text
          400: '#8B95BC', // secondary text
        },
        // Marquee-bulb amber: the primary action colour.
        marquee: {
          300: '#FFE1A3',
          400: '#FFC759',
          500: '#F0A81E',
          600: '#C4820F',
        },
        // Verdict colours, used full-bleed during play.
        hit: {
          400: '#4ADE80',
          500: '#22C55E',
          600: '#15803D',
        },
        skip: {
          400: '#FB923C',
          500: '#F97316',
          600: '#C2410C',
        },
      },
    },
  },
  plugins: [],
};
