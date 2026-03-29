import { randomBytes } from 'crypto';

/**
 * Generate a human-readable referral code
 * Format: WORD1-WORD2 or WORD-NUMBER
 */
export function generateReferralCode(): string {
  const adjectives = [
    'FAST', 'SMART', 'BOLD', 'COOL', 'EPIC', 'FIRE', 'GOLD', 'ICE',
    'JET', 'KING', 'LITE', 'MAX', 'NEXA', 'OMEGA', 'PLUM', 'QUICK',
    'ROCK', 'STAR', 'TURBO', 'ULTRA', 'VOLT', 'WIN', 'XTRA', 'YIELD',
    'ZOOM', 'APEX', 'BLAZE', 'CROWN', 'DASH', 'ELITE', 'FLASH', 'GHOST',
    'HYPER', 'ION', 'JUMP', 'KARMA', 'LINK', 'MAGIC', 'NICE', 'OPTIX',
    'PRIME', 'QUEST', 'RUSH', 'SWIFT', 'TITAN', 'UNITY', 'VIBE', 'WAVE',
  ];

  const nouns = [
    'ACE', 'BEAR', 'BIRD', 'BULL', 'CAT', 'DOG', 'EAGLE', 'FISH',
    'GOAT', 'HAWK', 'LION', 'MOON', 'NOVA', 'OWL', 'PIE', 'RAT',
    'SUN', 'TREE', 'WOLF', 'FOX', 'CUB', 'DEER', 'ELK', 'EMU',
    'FLY', 'GNAT', 'HERON', 'IBIS', 'JAY', 'KIT', 'LOON', 'MOA',
    'NUT', 'OTTER', 'PENGUIN', 'QUAIL', 'RAVEN', 'SWAN', 'TERN',
    'URIAL', 'VULTURE', 'WOMBAT', 'XENOPS', 'YAK', 'ZEBRA',
  ];

  const format = Math.random();

  if (format < 0.4) {
    // 40% chance: ADJECTIVE-NOUN (e.g., FAST-BEAR)
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}-${noun}`;
  } else if (format < 0.7) {
    // 30% chance: NOUN-NUMBER (e.g., BEAR-123)
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 999) + 1;
    return `${noun}-${number}`;
  } else if (format < 0.9) {
    // 20% chance: SHORT-RANDOM (e.g., ABC123)
    const letters = randomBytes(3).toString('hex').toUpperCase().slice(0, 3);
    const numbers = Math.floor(Math.random() * 999) + 1;
    return `${letters}${numbers}`;
  } else {
    // 10% chance: WORD-WORD-WORD (e.g., FAST-BEAR-ACE)
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun1 = nouns[Math.floor(Math.random() * nouns.length)];
    const noun2 = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}-${noun1}-${noun2}`;
  }
}

/**
 * Generate a short random code
 */
export function generateShortCode(length: number = 6): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .toUpperCase()
    .slice(0, length);
}

/**
 * Generate a numeric code
 */
export function generateNumericCode(length: number = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

/**
 * Generate a memorable code using word lists
 */
export function generateMemorableCode(): string {
  const words = [
    'STAR', 'MOON', 'SUN', 'SKY', 'CLOUD', 'RAIN', 'SNOW', 'WIND',
    'FIRE', 'EARTH', 'WATER', 'STONE', 'GOLD', 'SILVER', 'BRONZE',
    'DIAMOND', 'PEARL', 'RUBY', 'EMERALD', 'CRYSTAL', 'LIGHT', 'DARK',
    'SHADOW', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'EVENING', 'NOON',
    'SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'OCEAN', 'RIVER', 'LAKE',
    'MOUNTAIN', 'VALLEY', 'FOREST', 'DESERT', 'ISLAND', 'SHORE',
  ];

  const word1 = words[Math.floor(Math.random() * words.length)];
  const word2 = words[Math.floor(Math.random() * words.length)];
  
  return word1 !== word2 ? `${word1}-${word2}` : `${word1}-STAR`;
}

/**
 * Validate if a code follows the expected pattern
 */
export function isValidReferralCode(code: string): boolean {
  if (!code || code.length < 3 || code.length > 20) {
    return false;
  }

  // Allow letters, numbers, and hyphens only
  return /^[A-Z0-9-]+$/i.test(code);
}

/**
 * Normalize a referral code (uppercase and trim)
 */
export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Generate a campaign-specific code
 */
export function generateCampaignCode(baseCode: string, campaignId: string): string {
  const campaignHash = campaignId.slice(0, 4).toUpperCase();
  const randomSuffix = randomBytes(2).toString('hex').toUpperCase();
  
  return `${baseCode}-${campaignHash}${randomSuffix}`;
}
