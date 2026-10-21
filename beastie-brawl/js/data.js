// Static game data: moves, items, hats, opponent names.
const MOVES = {
  jab:        { name: 'Jab',           icon: '👊', power: 8,  acc: 95, cost: 0,  lvl: 1,  price: 0,   effect: 'energy', desc: 'Quick poke. Restores 8 energy.' },
  chomp:      { name: 'Chomp',         icon: '🦷', power: 12, acc: 88, cost: 8,  lvl: 1,  price: 0,   desc: 'A nasty little bite.' },
  slam:       { name: 'Belly Slam',    icon: '💥', power: 16, acc: 80, cost: 15, lvl: 1,  price: 0,   desc: 'Throw your whole weight around.' },
  tailwhip:   { name: 'Tail Whip',     icon: '🌀', power: 14, acc: 93, cost: 10, lvl: 2,  price: 60,  desc: 'Fast and hard to dodge.' },
  headbutt:   { name: 'Noggin Knock',  icon: '🤕', power: 20, acc: 76, cost: 20, lvl: 3,  price: 120, effect: 'stun', chance: 0.25, desc: '25% chance to stun the foe for a turn.' },
  gooblast:   { name: 'Goo Blast',     icon: '🟢', power: 17, acc: 86, cost: 16, lvl: 4,  price: 150, effect: 'sap', desc: 'Sticky slime drains 15 foe energy.' },
  vampbite:   { name: 'Vampire Bite',  icon: '🧛', power: 15, acc: 86, cost: 18, lvl: 5,  price: 220, effect: 'drain', desc: 'Heals you for half the damage dealt.' },
  furyspin:   { name: 'Fury Spin',     icon: '🌪️', power: 9,  acc: 84, cost: 25, lvl: 6,  price: 280, effect: 'multi', desc: 'Hits 2 to 4 times.' },
  stomp:      { name: 'Quake Stomp',   icon: '🦶', power: 30, acc: 72, cost: 32, lvl: 8,  price: 360, desc: 'Shakes the whole arena.' },
  megachomp:  { name: 'Mega Chomp',    icon: '🐊', power: 34, acc: 74, cost: 38, lvl: 10, price: 480, effect: 'drain', desc: 'Huge bite that heals half the damage.' },
  skullsmash: { name: 'Skull Smasher', icon: '💀', power: 44, acc: 66, cost: 50, lvl: 12, price: 650, effect: 'stun', chance: 0.35, desc: 'Devastating. 35% stun chance.' },
};

const ITEMS = {
  snack: { name: 'Swamp Snack', icon: '🍖', price: 25, desc: 'Heals 35% HP during a fight.' },
  juice: { name: 'Zap Juice',   icon: '🧃', price: 20, desc: '+40 energy during a fight.' },
};

const HATS = {
  party:     { name: 'Party Cone',     price: 80 },
  bow:       { name: 'Big Bow',        price: 100 },
  propeller: { name: 'Propeller Cap',  price: 160 },
  tophat:    { name: 'Fancy Top Hat',  price: 220 },
  viking:    { name: 'Viking Helm',    price: 320 },
  wizard:    { name: 'Wizard Hat',     price: 420 },
  crown:     { name: 'Champion Crown', price: 800 },
};

const DIFFICULTIES = [
  { label: 'Easy',  cls: 'easy',  lvl: -1, statMul: 0.8,  reward: 0.7, skill: 0.45 },
  { label: 'Fair',  cls: 'fair',  lvl: 0,  statMul: 1.0,  reward: 1.0, skill: 0.6 },
  { label: 'Tough', cls: 'tough', lvl: 1,  statMul: 1.2,  reward: 1.7, skill: 0.75 },
];

const NAME_A = ['Grub', 'Snarl', 'Blob', 'Mog', 'Zix', 'Krunk', 'Fizz', 'Gor', 'Wib', 'Thud', 'Splat', 'Nib', 'Bork', 'Grizz', 'Mungo', 'Scuz', 'Fang', 'Wobb', 'Drool', 'Ug'];
const NAME_B = ['o', 'zilla', 'bert', 'nax', 'ster', 'gle', 'tron', 'ix', 'wump', 'ling', 'saur', 'bo', 'muncher', 'kins', 'oid'];

function randomName() {
  const a = NAME_A[Math.floor(Math.random() * NAME_A.length)];
  const b = NAME_B[Math.floor(Math.random() * NAME_B.length)];
  return a + b;
}
