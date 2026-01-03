export const APP_NAME = 'Pet Sitter Guide Pro';
export const APP_VERSION = '2.0.0';

export const COLORS = {
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  secondary: '#6b7280',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  background: '#f9fafb',
  white: '#ffffff',
  black: '#000000',
};

export const PET_SPECIES = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'fish', label: 'Fish' },
  { value: 'reptile', label: 'Reptile' },
  { value: 'other', label: 'Other' },
] as const;
