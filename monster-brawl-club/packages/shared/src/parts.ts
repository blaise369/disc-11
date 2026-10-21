// Monster parts catalogue. The web app draws each part as layered SVG; the server only
// needs ids to validate builder choices. 12 species + 5 slots x 8 + 6 patterns = 58 parts.
import type { Rng } from './ai';

export interface PartDef {
  id: string;
  name: string;
  memberOnly?: boolean;
}

export const SPECIES: readonly PartDef[] = [
  { id: 'furball', name: 'Furball' },
  { id: 'mutant', name: 'Mutant' },
  { id: 'mechanoid', name: 'Mechanoid' },
  { id: 'slime', name: 'Slime' },
  { id: 'beast', name: 'Beast' },
  { id: 'bug', name: 'Bug' },
  { id: 'ghoul', name: 'Ghoul' },
  { id: 'rockling', name: 'Rockling' },
  { id: 'sprout', name: 'Sprout' },
  { id: 'fishling', name: 'Fishling' },
  { id: 'drake', name: 'Drake', memberOnly: true },
  { id: 'cosmo', name: 'Cosmo', memberOnly: true },
];

const slot = (names: string[], memberFrom: number): PartDef[] =>
  names.map((name, i) => ({ id: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, ...(i >= memberFrom ? { memberOnly: true } : {}) }));

export const PART_SLOTS = {
  eyes: slot(['Googly', 'Angry', 'Sleepy', 'Cyclops', 'Triple', 'Stalks', 'Visor', 'Starry'], 7),
  mouth: slot(['Grin', 'Fangs', 'Chomper', 'Tusks', 'Beak', 'Zigzag', 'Tongue', 'Grille'], 7),
  head: slot(['None', 'Devil Horns', 'Antennae', 'Spikes', 'Unihorn', 'Mohawk', 'Ears', 'Crown Fin'], 7),
  arms: slot(['Stubby', 'Claws', 'Tentacles', 'Pincers', 'Wings', 'Robo', 'Noodle', 'Blades'], 7),
  legs: slot(['Stumpy', 'Feet', 'Tentacles', 'Wheels', 'Bug Legs', 'Hover', 'Paws', 'Springs'], 7),
  pattern: slot(['Plain', 'Spots', 'Stripes', 'Belly', 'Scales', 'Swirl'], 5),
} as const;

export type PartSlot = keyof typeof PART_SLOTS;
export const PART_SLOT_NAMES = Object.keys(PART_SLOTS) as PartSlot[];

/** Builder palette (16 colours). */
export const PALETTE = [
  '#e94f37', '#f28c28', '#f6c90e', '#9bd23c', '#3cb371', '#1fb5a8', '#2e9be6', '#3f5ae0',
  '#7b4fe0', '#c04fd6', '#ef5fa7', '#a0522d', '#6b7a8f', '#e8e2d0', '#3a3a4a', '#ff9eb5',
] as const;

export interface MonsterParts {
  species: string;
  eyes: string;
  mouth: string;
  head: string;
  arms: string;
  legs: string;
  pattern: string;
}

export interface MonsterPalette {
  /** Index into PALETTE for the main body. */
  body: number;
  /** Index into PALETTE for horns, spots and details. */
  accent: number;
}

function findPart(list: readonly PartDef[], id: unknown): PartDef | undefined {
  return list.find(p => p.id === id);
}

/** Parts exist and member-only parts are only used by members. */
export function isValidParts(parts: MonsterParts, palette: MonsterPalette, isMember: boolean): boolean {
  const check = (p: PartDef | undefined) => p !== undefined && (!p.memberOnly || isMember);
  if (!check(findPart(SPECIES, parts.species))) return false;
  for (const s of PART_SLOT_NAMES) if (!check(findPart(PART_SLOTS[s], parts[s]))) return false;
  const okColour = (i: number) => Number.isInteger(i) && i >= 0 && i < PALETTE.length;
  return okColour(palette.body) && okColour(palette.accent);
}

/** Random free parts and palette, for bots and the builder's dice button. */
export function randomLook(rng: Rng = Math.random, isMember = false): { parts: MonsterParts; palette: MonsterPalette } {
  const pick = (list: readonly PartDef[]) => {
    const pool = list.filter(p => isMember || !p.memberOnly);
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!.id;
  };
  const colour = () => Math.min(PALETTE.length - 1, Math.floor(rng() * PALETTE.length));
  return {
    parts: {
      species: pick(SPECIES), eyes: pick(PART_SLOTS.eyes), mouth: pick(PART_SLOTS.mouth),
      head: pick(PART_SLOTS.head), arms: pick(PART_SLOTS.arms), legs: pick(PART_SLOTS.legs),
      pattern: pick(PART_SLOTS.pattern),
    },
    palette: { body: colour(), accent: colour() },
  };
}
