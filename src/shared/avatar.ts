// Character customization model shared by client (rendering/editor) and server (validation).

export const SKIN_TONES = [
  '#FFE0C7', '#F9D2B4', '#F1C27D', '#E0AC69', '#C68642', '#A86B3C', '#8D5524', '#6B3E1E', '#4A2A14',
] as const;

export const HAIR_COLORS = [
  '#1B1B1F', '#3B2417', '#6A3E1F', '#A0612B', '#D9A55B', '#F3D38A', '#B8B8C2', '#F2F2F2',
  '#C0392B', '#FF6FA8', '#8E5CF7', '#3D7BF7', '#2BC79F', '#FF9F1C',
] as const;

export const EYE_COLORS = ['#3B2417', '#1B1B1F', '#2E7DD7', '#2BA36B', '#8A6A3C', '#7B4FD8'] as const;

export const CLOTH_COLORS = [
  '#FF4D6D', '#FF8A3D', '#FFD23F', '#3DDC97', '#2EC4F1', '#4D6BFF', '#9B5DE5', '#F15BB5',
  '#FFFFFF', '#D9DCE3', '#6C7080', '#2B2D3A', '#14151C', '#8B5E3C', '#C9A27C', '#2F6B4F',
] as const;

export const HAIR_STYLES = [
  'short', 'buzz', 'spiky', 'curly', 'afro', 'wavy', 'long', 'bob', 'ponytail', 'bun', 'braids', 'locs', 'mohawk', 'bald',
] as const;
export const EYE_STYLES = ['round', 'happy', 'sleepy', 'wink', 'lashes', 'cool'] as const;
export const BROW_STYLES = ['normal', 'thick', 'arched', 'none'] as const;
export const MOUTH_STYLES = ['smile', 'grin', 'neutral', 'smirk', 'open', 'tongue'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'goatee', 'beard'] as const;
export const GLASSES = ['none', 'round', 'square', 'shades', 'stars'] as const;
export const HATS = ['none', 'cap', 'beanie', 'party', 'crown', 'headphones', 'bow', 'cowboy', 'flower'] as const;
export const TOPS = ['tee', 'hoodie', 'jacket', 'tank', 'sweater', 'suit', 'dress', 'jersey'] as const;
export const BOTTOMS = ['jeans', 'pants', 'shorts', 'skirt'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type BrowStyle = (typeof BROW_STYLES)[number];
export type MouthStyle = (typeof MOUTH_STYLES)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type GlassesStyle = (typeof GLASSES)[number];
export type HatStyle = (typeof HATS)[number];
export type TopStyle = (typeof TOPS)[number];
export type BottomStyle = (typeof BOTTOMS)[number];

export interface Avatar {
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyes: EyeStyle;
  eyeColor: string;
  brows: BrowStyle;
  mouth: MouthStyle;
  facialHair: FacialHair;
  glasses: GlassesStyle;
  hat: HatStyle;
  hatColor: string;
  top: TopStyle;
  topColor: string;
  accentColor: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoeColor: string;
  freckles: boolean;
  blush: boolean;
  earrings: boolean;
}

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function randomAvatar(): Avatar {
  const top = pick(TOPS);
  return {
    skin: pick(SKIN_TONES),
    hairStyle: pick(HAIR_STYLES.filter((h) => h !== 'bald')),
    hairColor: pick(HAIR_COLORS.slice(0, 9)),
    eyes: pick(['round', 'happy', 'lashes', 'round'] as const),
    eyeColor: pick(EYE_COLORS),
    brows: pick(['normal', 'thick', 'arched'] as const),
    mouth: pick(['smile', 'grin', 'smile', 'smirk'] as const),
    facialHair: Math.random() < 0.2 ? pick(FACIAL_HAIR.slice(1)) : 'none',
    glasses: Math.random() < 0.25 ? pick(GLASSES.slice(1)) : 'none',
    hat: Math.random() < 0.3 ? pick(HATS.slice(1)) : 'none',
    hatColor: pick(CLOTH_COLORS),
    top,
    topColor: pick(CLOTH_COLORS.slice(0, 8)),
    accentColor: pick(CLOTH_COLORS),
    bottom: top === 'dress' ? 'skirt' : pick(BOTTOMS),
    bottomColor: pick(['#2B2D3A', '#3A5BA0', '#6C7080', '#C9A27C', '#14151C', '#2F6B4F'] as const),
    shoeColor: pick(['#FFFFFF', '#14151C', '#FF4D6D', '#8B5E3C', '#4D6BFF'] as const),
    freckles: Math.random() < 0.15,
    blush: Math.random() < 0.4,
    earrings: Math.random() < 0.2,
  };
}

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** Coerce untrusted input into a valid Avatar (used by the server). */
export function sanitizeAvatar(input: unknown): Avatar {
  const base = randomAvatar();
  if (!input || typeof input !== 'object') return base;
  const a = input as Record<string, unknown>;
  return {
    skin: isColor(a.skin) ? a.skin : base.skin,
    hairStyle: oneOf(a.hairStyle, HAIR_STYLES, base.hairStyle),
    hairColor: isColor(a.hairColor) ? a.hairColor : base.hairColor,
    eyes: oneOf(a.eyes, EYE_STYLES, base.eyes),
    eyeColor: isColor(a.eyeColor) ? a.eyeColor : base.eyeColor,
    brows: oneOf(a.brows, BROW_STYLES, base.brows),
    mouth: oneOf(a.mouth, MOUTH_STYLES, base.mouth),
    facialHair: oneOf(a.facialHair, FACIAL_HAIR, base.facialHair),
    glasses: oneOf(a.glasses, GLASSES, base.glasses),
    hat: oneOf(a.hat, HATS, base.hat),
    hatColor: isColor(a.hatColor) ? a.hatColor : base.hatColor,
    top: oneOf(a.top, TOPS, base.top),
    topColor: isColor(a.topColor) ? a.topColor : base.topColor,
    accentColor: isColor(a.accentColor) ? a.accentColor : base.accentColor,
    bottom: oneOf(a.bottom, BOTTOMS, base.bottom),
    bottomColor: isColor(a.bottomColor) ? a.bottomColor : base.bottomColor,
    shoeColor: isColor(a.shoeColor) ? a.shoeColor : base.shoeColor,
    freckles: a.freckles === true,
    blush: a.blush === true,
    earrings: a.earrings === true,
  };
}
