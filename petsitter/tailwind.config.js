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
        // Primary - Gold/Bronze (from logo border)
        primary: {
          50: '#FDF8F0',
          100: '#FAF0DC',
          200: '#F5E1B8',
          300: '#EACA7A',
          400: '#D4A84A',
          500: '#C4913D',
          600: '#A67432',
          700: '#8B5A2B',
          800: '#704624',
          900: '#5D3A1F',
        },
        // Secondary - Royal Blue (from parrot/flag)
        secondary: {
          50: '#EEF3FA',
          100: '#D9E4F5',
          200: '#B3C9EB',
          300: '#7AA3D9',
          400: '#4A7DC4',
          500: '#2E5090',
          600: '#264278',
          700: '#1E3460',
          800: '#172848',
          900: '#101C32',
        },
        // Accent - Warm Red (from parrot)
        accent: {
          50: '#FDF2F1',
          100: '#FCE4E2',
          200: '#F9C9C4',
          300: '#F2A097',
          400: '#E06B5C',
          500: '#B84233',
          600: '#9A3529',
          700: '#7C2B22',
          800: '#5E211A',
          900: '#401712',
        },
        // Warm - Orange/Ginger (from cat)
        warm: {
          50: '#FEF6F0',
          100: '#FDECDC',
          200: '#FAD5B5',
          300: '#F5B580',
          400: '#E8944D',
          500: '#D2783C',
          600: '#B35F2D',
          700: '#944A24',
          800: '#75391C',
          900: '#562A15',
        },
        // Cream - Background tones (from logo background)
        cream: {
          50: '#FFFEFB',
          100: '#FDF8F0',
          200: '#FAF3E3',
          300: '#F5E6C8',
          400: '#E8D4A8',
          500: '#D9C08C',
          600: '#C4A870',
          700: '#A68B55',
          800: '#86703F',
          900: '#665530',
        },
        // Brown - Text and dark elements (from dog/outlines)
        brown: {
          50: '#F8F5F3',
          100: '#EDE6E1',
          200: '#DDD1C7',
          300: '#C4B3A3',
          400: '#A08978',
          500: '#7D6555',
          600: '#5D4037',
          700: '#4A3328',
          800: '#3D2E24',
          900: '#2E221B',
        },
        // Tan - Secondary text, borders (from rabbit/ferret)
        tan: {
          50: '#FAF7F4',
          100: '#F2EBE4',
          200: '#E8DCC8',
          300: '#D4C4A8',
          400: '#BDA888',
          500: '#A08060',
          600: '#86694D',
          700: '#6B533D',
          800: '#52402F',
          900: '#3B2E22',
        },
        // Override gray with warm grays
        gray: {
          50: '#FAF9F7',
          100: '#F3F1ED',
          200: '#E8E4DD',
          300: '#D5CFC4',
          400: '#B8AFA0',
          500: '#958A7A',
          600: '#756B5D',
          700: '#5A524A',
          800: '#3F3A35',
          900: '#252320',
        },
      },
    },
  },
  plugins: [],
};
