/**
 * Persona Module — FR-2.1, FR-2.2, FR-2.3, NFR-8, NFR-9
 *
 * Derives and persists a stable VoiceProfile from a name + domain.
 * The SAME stored profile is reused for every generation call — never re-derived.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../logger';
import type { VoiceProfile } from '../types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const DERIVE_SYSTEM = `You are a persona architect. Given a name and domain,
produce a JSON VoiceProfile with exactly these fields:
- tone: string[] (3-5 writing style descriptors, e.g. "direct", "technically precise", "skeptical of hype")
- interests: string[] (3-6 concrete sub-topics within the domain this persona covers deeply)
- stances: string[] (2-4 recurring editorial opinions this persona is known for)
- boundaries: string[] (3-5 topics explicitly out of scope — things this persona will NOT write about)

Respond with ONLY valid JSON. No markdown fences, no extra text.`;

export async function deriveVoiceProfile(
  name: string,
  domain: string
): Promise<VoiceProfile> {
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    temperature: 0.2, // low temp = deterministic-ish profile
    system: DERIVE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Name: ${name}\nDomain: ${domain}`,
      },
    ],
  });

  const raw = (response.content[0] as { type: string; text: string }).text.trim();
  const profile: VoiceProfile = JSON.parse(raw);

  // Basic structural validation
  if (
    !Array.isArray(profile.tone) ||
    !Array.isArray(profile.interests) ||
    !Array.isArray(profile.stances) ||
    !Array.isArray(profile.boundaries)
  ) {
    throw new Error('VoiceProfile response missing required arrays');
  }

  logger.info({ name, domain, profile }, 'Derived voice profile');
  return profile;
}

/**
 * Hard gate: returns false if the candidate topic clearly falls outside
 * the persona's domain and listed interests. Used by Editorial Judgment
 * as an immediate reject before any scoring (FR-2.3).
 */
export function isOnDomain(
  candidateTopic: string,
  profile: VoiceProfile
): boolean {
  const text = candidateTopic.toLowerCase();

  // Check against explicit out-of-scope boundaries
  for (const boundary of profile.boundaries) {
    const keywords = boundary.toLowerCase().split(/\s+/);
    if (keywords.every((kw) => text.includes(kw))) {
      return false;
    }
  }

  // Must match at least one interest area
  const hasMatch = profile.interests.some((interest) => {
    const words = interest.toLowerCase().split(/\s+/);
    return words.some((w) => w.length > 3 && text.includes(w));
  });

  return hasMatch;
}
