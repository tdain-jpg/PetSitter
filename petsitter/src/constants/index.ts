export const APP_NAME = 'Pawstructions';
export const APP_VERSION = '2.0.0';

// Base URL for the deployed web app (share links, marketing)
export const WEB_BASE_URL = 'https://pawstructions.com';

// Castles & Currents brand palette
export const COLORS = {
  // Castles & Currents brand — teal (CTAs, active states, links)
  primary: '#4A7D90',
  primaryLight: '#5B95A8',
  primaryDark: '#3C6779',
  primary50: '#F0F6F8',
  primary100: '#DCEAEE',
  primary200: '#BBD5DD',

  // Castles & Currents brand — navy (headings-adjacent, secondary buttons)
  secondary: '#1E3A5F',
  secondaryLight: '#4C6E9E',
  secondaryDark: '#182F4E',

  // Castles & Currents brand — coral-red (destructive only)
  accent: '#A6453F',
  accentLight: '#C4655E',
  accentDark: '#8B3833',

  // Castles & Currents brand — gold (highlights, decorative)
  warm: '#C6A75E',
  warmLight: '#DCC488',
  warmDark: '#97783B',

  // Castles & Currents brand — warm cream backgrounds
  cream: '#F5EDD6',
  creamLight: '#FEFDF9',
  creamDark: '#EDE0BC',

  // Castles & Currents brand — navy-slate ink (all text)
  brown: '#304254',
  brownLight: '#56687C',
  brownDark: '#263544',

  // Castles & Currents brand — blue-gray mist (secondary text, borders)
  tan: '#62758B',
  tanLight: '#9FAEBF',
  tanDark: '#4F6072',

  // Semantic colors
  success: '#3E7A5E',
  successLight: '#5E9A7C',
  warning: '#B3924A',
  warningLight: '#C6A75E',
  error: '#A6453F',
  errorLight: '#C4655E',
  info: '#4A7D90',
  infoLight: '#5B95A8',

  // Base colors
  background: '#F5EDD6',
  backgroundLight: '#FAF6EA',
  cardBackground: '#FEFDF9',
  white: '#ffffff',
  black: '#000000',

  // Text colors
  text: '#263544',
  textLight: '#56687C',
  textMuted: '#62758B',

  // Border colors
  border: '#DCE3EB',
  borderLight: '#ECF0F5',
  borderDark: '#C2CDD9',
};

export const PET_SPECIES = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'fish', label: 'Fish' },
  { value: 'reptile', label: 'Reptile' },
  { value: 'rabbit', label: 'Rabbit' },
  { value: 'hamster', label: 'Hamster' },
  { value: 'other', label: 'Other' },
] as const;
