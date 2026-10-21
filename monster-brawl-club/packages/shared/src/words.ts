// Usernames, the monster-name filter and the fixed chat phrases.
import type { Rng } from './ai';

const ADJECTIVES = [
  'Brave', 'Bouncy', 'Cosmic', 'Crafty', 'Dizzy', 'Fizzy', 'Fuzzy', 'Giant', 'Gloomy', 'Grumpy',
  'Happy', 'Jolly', 'Lucky', 'Mighty', 'Muddy', 'Nifty', 'Rapid', 'Rocket', 'Shiny', 'Sneaky',
  'Snappy', 'Soggy', 'Speedy', 'Spiky', 'Stompy', 'Super', 'Turbo', 'Wobbly', 'Zany', 'Zippy',
];
const NOUNS = [
  'Badger', 'Beetle', 'Blob', 'Comet', 'Crab', 'Dragon', 'Gecko', 'Goblin', 'Hippo', 'Jelly',
  'Kraken', 'Llama', 'Mole', 'Moose', 'Nugget', 'Otter', 'Panda', 'Pickle', 'Rhino', 'Robot',
  'Rocket', 'Slug', 'Squid', 'Tiger', 'Toad', 'Troll', 'Turnip', 'Walrus', 'Wizard', 'Yeti',
];

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

/** A suggested username: two words plus two digits. */
export function generateUsername(rng: Rng = Math.random): string {
  const n = Math.min(99, Math.floor(rng() * 90) + 10);
  return `${pick(rng, ADJECTIVES)}${pick(rng, NOUNS)}${n}`;
}

export function generateUsernameChoices(count: number, rng: Rng = Math.random): string[] {
  const out = new Set<string>();
  while (out.size < count) out.add(generateUsername(rng));
  return [...out];
}

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

/** Usernames: 3 to 16 letters, digits or underscores, passing the same word filter as monster names. */
export function isUsernameAllowed(name: string): boolean {
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX || !/^[A-Za-z0-9_]+$/.test(name)) return false;
  return isMonsterNameAllowed(name.replace(/_/g, ' '));
}

// Substrings blocked in monster names. Matched case-insensitively after stripping
// spaces and mapping digits used as letters.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'sex', 'porn', 'nazi',
  'hitler', 'slut', 'whore', 'fag', 'nigg', 'retard', 'bastard', 'asshole',
  'wank', 'twat', 'boob', 'tits', 'piss',
];
// Blocked only as whole words, so innocent names like "Grape" or "Shelly" still pass.
const BLOCKED_WORDS = ['rape', 'hell', 'crap', 'damn', 'arse', 'ass', 'kill', 'poo', 'butt'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export const MONSTER_NAME_MAX = 16;

export function normaliseForFilter(name: string): string {
  return name
    .toLowerCase()
    .replace(/[01345@$7]/g, c => LEET[c]!)
    .replace(/[^a-z]/g, '');
}

/** Monster names: 2 to 16 letters, digits or spaces, passing the word filter. */
export function isMonsterNameAllowed(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > MONSTER_NAME_MAX) return false;
  if (!/^[A-Za-z0-9 ]+$/.test(trimmed)) return false;
  // Check each name as typed and with stretched letters squashed ("fuuuck"). Blocked words
  // are never squashed themselves, so "Bob" doesn't match "boob".
  const forms = (s: string) => {
    const raw = normaliseForFilter(s);
    return [raw, raw.replace(/(.)\1+/g, '$1')];
  };
  if (forms(trimmed).some(f => BLOCKED.some(w => f.includes(w)))) return false;
  // Whole words: also match stretched spellings ("Helll"), but only when the word is at
  // least as long as the blocked one, so "Po" doesn't match "poo".
  const squash = (w: string) => w.replace(/(.)\1+/g, '$1');
  const words = trimmed.split(/\s+/).map(normaliseForFilter);
  return !words.some(w => BLOCKED_WORDS.some(b => w === b || (w.length >= b.length && squash(w) === squash(b))));
}

/** Fixed chat phrases. Players can only send these ids, never free text. */
export const CHAT_PHRASES = [
  { id: 'hi', text: 'Hi there!' },
  { id: 'gl', text: 'Good luck!' },
  { id: 'gf', text: 'Good fight!' },
  { id: 'rematch', text: 'Rematch?' },
  { id: 'wow', text: 'Wow!' },
  { id: 'close', text: 'That was close!' },
  { id: 'nice', text: 'Nice monster!' },
  { id: 'lol', text: 'Ha ha!' },
  { id: 'thanks', text: 'Thanks!' },
  { id: 'bye', text: 'Bye!' },
] as const;
export type PhraseId = (typeof CHAT_PHRASES)[number]['id'];

export function phraseText(id: string): string | undefined {
  return CHAT_PHRASES.find(p => p.id === id)?.text;
}
