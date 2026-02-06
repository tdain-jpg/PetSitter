export const APP_NAME = 'Pet Sitter Guide Pro';
export const APP_VERSION = '2.0.0';

// Color palette extracted from the Pet Sitter Pro logo
export const COLORS = {
  // Primary - Gold/Bronze (from logo border)
  primary: '#C4913D',
  primaryLight: '#D4A84A',
  primaryDark: '#A67432',
  primary50: '#FDF8F0',
  primary100: '#FAF0DC',
  primary200: '#F5E1B8',

  // Secondary - Royal Blue (from parrot/flag)
  secondary: '#2E5090',
  secondaryLight: '#4A7DC4',
  secondaryDark: '#264278',

  // Accent - Warm Red (from parrot)
  accent: '#B84233',
  accentLight: '#E06B5C',
  accentDark: '#9A3529',

  // Warm - Orange/Ginger (from cat)
  warm: '#D2783C',
  warmLight: '#E8944D',
  warmDark: '#B35F2D',

  // Cream - Background tones (from logo background)
  cream: '#FAF3E3',
  creamLight: '#FDF8F0',
  creamDark: '#F5E6C8',

  // Brown - Text and dark elements (from dog/outlines)
  brown: '#5D4037',
  brownLight: '#7D6555',
  brownDark: '#4A3328',

  // Tan - Secondary text, borders (from rabbit/ferret)
  tan: '#A08060',
  tanLight: '#BDA888',
  tanDark: '#86694D',

  // Semantic colors
  success: '#5D7A3D',
  successLight: '#7A9E4D',
  warning: '#D2783C',
  warningLight: '#E8944D',
  error: '#B84233',
  errorLight: '#E06B5C',
  info: '#2E5090',
  infoLight: '#4A7DC4',

  // Base colors
  background: '#FAF3E3',
  backgroundLight: '#FDF8F0',
  cardBackground: '#FFFEFB',
  white: '#ffffff',
  black: '#000000',

  // Text colors
  text: '#3D2E24',
  textLight: '#7D6555',
  textMuted: '#A08060',

  // Border colors
  border: '#E8DCC8',
  borderLight: '#F2EBE4',
  borderDark: '#D4C4A8',
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
