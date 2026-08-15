import { Image } from 'react-native';

/**
 * The commissioned Pawstructions icon set — 53 custom pet icons (see
 * brand/icon-inventory.md for what each one means). Names match the delivered
 * asset filenames with the `icon-` prefix stripped.
 */
export type IconName =
  | 'ai-flourish'
  | 'arrival'
  | 'avatar-bird'
  | 'avatar-cat'
  | 'avatar-dog'
  | 'avatar-fish'
  | 'avatar-gecko'
  | 'avatar-hamster'
  | 'avatar-hedgehog'
  | 'avatar-rabbit'
  | 'bedtime'
  | 'calendar'
  | 'celebration'
  | 'check'
  | 'close'
  | 'crown-ai'
  | 'delete'
  | 'desktop-install'
  | 'document'
  | 'email'
  | 'emergency'
  | 'evening'
  | 'export'
  | 'feature-check'
  | 'feeding'
  | 'guide'
  | 'hide'
  | 'home'
  | 'id-tag'
  | 'import'
  | 'insurance'
  | 'invite'
  | 'key'
  | 'location'
  | 'medication'
  | 'memorial-dove'
  | 'memorial-rainbow'
  | 'midday'
  | 'mobile-install'
  | 'morning'
  | 'notes'
  | 'paw'
  | 'phone'
  | 'print'
  | 'privacy'
  | 'regenerate'
  | 'reveal'
  | 'share-link'
  | 'testimonial'
  | 'tip'
  | 'toys'
  | 'travel'
  | 'vet';

/**
 * React Native's require() cannot take a dynamic path, so every icon is
 * required statically here. The 96px tier is used for every slot — the Image
 * scales it down crisply at the smaller sizes.
 */
const ICONS: Record<IconName, any> = {
  'ai-flourish': require('../../assets/icons/png/96/icon-ai-flourish.png'),
  'arrival': require('../../assets/icons/png/96/icon-arrival.png'),
  'avatar-bird': require('../../assets/icons/png/96/icon-avatar-bird.png'),
  'avatar-cat': require('../../assets/icons/png/96/icon-avatar-cat.png'),
  'avatar-dog': require('../../assets/icons/png/96/icon-avatar-dog.png'),
  'avatar-fish': require('../../assets/icons/png/96/icon-avatar-fish.png'),
  'avatar-gecko': require('../../assets/icons/png/96/icon-avatar-gecko.png'),
  'avatar-hamster': require('../../assets/icons/png/96/icon-avatar-hamster.png'),
  'avatar-hedgehog': require('../../assets/icons/png/96/icon-avatar-hedgehog.png'),
  'avatar-rabbit': require('../../assets/icons/png/96/icon-avatar-rabbit.png'),
  'bedtime': require('../../assets/icons/png/96/icon-bedtime.png'),
  'calendar': require('../../assets/icons/png/96/icon-calendar.png'),
  'celebration': require('../../assets/icons/png/96/icon-celebration.png'),
  'check': require('../../assets/icons/png/96/icon-check.png'),
  'close': require('../../assets/icons/png/96/icon-close.png'),
  'crown-ai': require('../../assets/icons/png/96/icon-crown-ai.png'),
  'delete': require('../../assets/icons/png/96/icon-delete.png'),
  'desktop-install': require('../../assets/icons/png/96/icon-desktop-install.png'),
  'document': require('../../assets/icons/png/96/icon-document.png'),
  'email': require('../../assets/icons/png/96/icon-email.png'),
  'emergency': require('../../assets/icons/png/96/icon-emergency.png'),
  'evening': require('../../assets/icons/png/96/icon-evening.png'),
  'export': require('../../assets/icons/png/96/icon-export.png'),
  'feature-check': require('../../assets/icons/png/96/icon-feature-check.png'),
  'feeding': require('../../assets/icons/png/96/icon-feeding.png'),
  'guide': require('../../assets/icons/png/96/icon-guide.png'),
  'hide': require('../../assets/icons/png/96/icon-hide.png'),
  'home': require('../../assets/icons/png/96/icon-home.png'),
  'id-tag': require('../../assets/icons/png/96/icon-id-tag.png'),
  'import': require('../../assets/icons/png/96/icon-import.png'),
  'insurance': require('../../assets/icons/png/96/icon-insurance.png'),
  'invite': require('../../assets/icons/png/96/icon-invite.png'),
  'key': require('../../assets/icons/png/96/icon-key.png'),
  'location': require('../../assets/icons/png/96/icon-location.png'),
  'medication': require('../../assets/icons/png/96/icon-medication.png'),
  'memorial-dove': require('../../assets/icons/png/96/icon-memorial-dove.png'),
  'memorial-rainbow': require('../../assets/icons/png/96/icon-memorial-rainbow.png'),
  'midday': require('../../assets/icons/png/96/icon-midday.png'),
  'mobile-install': require('../../assets/icons/png/96/icon-mobile-install.png'),
  'morning': require('../../assets/icons/png/96/icon-morning.png'),
  'notes': require('../../assets/icons/png/96/icon-notes.png'),
  'paw': require('../../assets/icons/png/96/icon-paw.png'),
  'phone': require('../../assets/icons/png/96/icon-phone.png'),
  'print': require('../../assets/icons/png/96/icon-print.png'),
  'privacy': require('../../assets/icons/png/96/icon-privacy.png'),
  'regenerate': require('../../assets/icons/png/96/icon-regenerate.png'),
  'reveal': require('../../assets/icons/png/96/icon-reveal.png'),
  'share-link': require('../../assets/icons/png/96/icon-share-link.png'),
  'testimonial': require('../../assets/icons/png/96/icon-testimonial.png'),
  'tip': require('../../assets/icons/png/96/icon-tip.png'),
  'toys': require('../../assets/icons/png/96/icon-toys.png'),
  'travel': require('../../assets/icons/png/96/icon-travel.png'),
  'vet': require('../../assets/icons/png/96/icon-vet.png'),
};

/** Species avatars — the commissioned cast. Anything unrecognized falls back to the brand paw. */
const SPECIES_ICONS: Record<string, IconName> = {
  dog: 'avatar-dog',
  cat: 'avatar-cat',
  bird: 'avatar-bird',
  fish: 'avatar-fish',
  reptile: 'avatar-gecko',
  rabbit: 'avatar-rabbit',
  hamster: 'avatar-hamster',
  other: 'avatar-hedgehog',
};

export function speciesIconName(species: string): IconName {
  return SPECIES_ICONS[(species || '').toLowerCase()] ?? 'paw';
}

export function Icon({
  name,
  size = 24,
  style,
}: {
  name: IconName;
  size?: number;
  style?: any;
}) {
  return (
    <Image
      source={ICONS[name]}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
