import { logger } from '../logger';
import { callNvidiaAi } from '../services/nvidiaAi';

export interface VoiceProfile {
  name: string;
  domain: string;
  tone: string[];
  interests: string[];
  stances: string[];
  boundaries: string[];
}

export async function deriveVoiceProfile(name: string, domain: string): Promise<VoiceProfile> {
  logger.info('Deriving persona voice profile via NVIDIA AI', { name, domain });

  const prompt = `You are a high-level persona voice profile generator.
Derive a precise, authoritative voice profile for persona "${name}" operating in domain "${domain}".
Return JSON ONLY matching this format:
{
  "tone": ["precise", "analytical", "practitioner-first", "skeptical of hype"],
  "interests": ["string 1", "string 2", "string 3", "string 4"],
  "stances": ["string 1", "string 2", "string 3"],
  "boundaries": ["string 1", "string 2", "string 3"]
}`;

  try {
    const rawText = await callNvidiaAi(prompt);
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { name, domain, ...parsed };
    }
  } catch (err: any) {
    logger.warn('NVIDIA AI profile derivation failed, using structured fallback profile', { error: err.message });
  }

  // Deterministic fallback profile
  return {
    name,
    domain,
    tone: ['precise', 'analytical', 'practitioner-first', 'skeptical of hype'],
    interests: [
      `${domain} security and vulnerability research`,
      `latest architectural patterns in ${domain}`,
      `practical attacker-economics and threat modeling`,
      `industry standards and compliance in ${domain}`,
    ],
    stances: [
      `Security by design always beats bolt-on safety controls`,
      `Empirical vulnerability demonstrations are far more valuable than theoretical hype`,
      `Supply chain and infrastructure security are criminally underrated risks`,
    ],
    boundaries: [
      'Do not engage in unverified rumors or stock market speculation',
      'Avoid generic promotional PR marketing fluff',
      'Never publish ungrounded or invented statistics',
    ],
  };
}

export function isOnDomain(title: string, summary: string, profile: VoiceProfile): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  const domainTerms = profile.domain.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const interestTerms = profile.interests.flatMap((i) => i.toLowerCase().split(/\s+/)).filter((t) => t.length > 3);

  const offDomainKeywords = ['crypto giveaway', 'casino', 'lottery', 'celebrity gossip', 'stock tip'];
  for (const bad of offDomainKeywords) {
    if (text.includes(bad)) return false;
  }

  const hasDomainMatch = domainTerms.some((term) => text.includes(term));
  const hasInterestMatch = interestTerms.some((term) => text.includes(term));

  return hasDomainMatch || hasInterestMatch;
}
