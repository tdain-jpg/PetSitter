/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Castles & Currents brand — teal (CTAs, active states, links)
        primary: {
          50: '#F0F6F8',
          100: '#DCEAEE',
          200: '#BBD5DD',
          300: '#8FB8C5',
          400: '#5B95A8',
          500: '#4A7D90',
          600: '#3C6779',
          700: '#2F5261',
          800: '#243F4B',
          900: '#1A2E37',
        },
        // Castles & Currents brand — navy (headings-adjacent, secondary buttons)
        secondary: {
          50: '#EDF1F7',
          100: '#D8E1EE',
          200: '#B3C4DD',
          300: '#7E9BC2',
          400: '#4C6E9E',
          500: '#2C4E7E',
          600: '#1E3A5F',
          700: '#182F4E',
          800: '#12243C',
          900: '#0C192B',
        },
        // Castles & Currents brand — coral-red (destructive only)
        accent: {
          50: '#FBF0EF',
          100: '#F6DEDC',
          200: '#ECBCB8',
          300: '#DC908A',
          400: '#C4655E',
          500: '#A6453F',
          600: '#8B3833',
          700: '#6F2C28',
          800: '#54211E',
          900: '#3A1614',
        },
        // Castles & Currents brand — gold (highlights, decorative)
        warm: {
          50: '#FBF7EE',
          100: '#F5ECD8',
          200: '#EBDBB2',
          300: '#DCC488',
          400: '#C6A75E',
          500: '#B3924A',
          600: '#97783B',
          700: '#7A5F2F',
          800: '#5D4824',
          900: '#423319',
        },
        // Castles & Currents brand — warm cream backgrounds
        cream: {
          50: '#FEFDF9',
          100: '#FAF6EA',
          200: '#F5EDD6',
          300: '#EDE0BC',
          400: '#DFCC9A',
          500: '#CDB57C',
          600: '#B29A62',
          700: '#8F7B4D',
          800: '#6C5C3A',
          900: '#4A3F28',
        },
        // Castles & Currents brand — navy-slate ink (all text)
        brown: {
          50: '#F4F6F8',
          100: '#E4E9EE',
          200: '#C9D3DC',
          300: '#A3B2C0',
          400: '#7A8CA0',
          500: '#56687C',
          600: '#405062',
          700: '#304254',
          800: '#263544',
          900: '#182229',
        },
        // Castles & Currents brand — blue-gray mist (secondary text, borders)
        tan: {
          50: '#F7F9FB',
          100: '#ECF0F5',
          200: '#DCE3EB',
          300: '#C2CDD9',
          400: '#9FAEBF',
          500: '#62758B',
          600: '#4F6072',
          700: '#3E4C5B',
          800: '#2F3A46',
          900: '#212932',
        },
        // Castles & Currents brand — cool neutrals
        gray: {
          50: '#F8F9FA',
          100: '#EFF1F4',
          200: '#E2E6EB',
          300: '#CDD3DB',
          400: '#ABB4C0',
          500: '#8792A0',
          600: '#6A7583',
          700: '#525C68',
          800: '#3A424C',
          900: '#23282F',
        },
      },
    },
  },
  plugins: [],
};
