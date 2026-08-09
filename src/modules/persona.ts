import { logger } from '../logger';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export interface VoiceProfile {
  name: string;
  domain: string;
  tone: string[];
  interests: string[];
  stances: string[];
  boundaries: string[];
}

export async function deriveVoiceProfile(name: string, domain: string): Promise<VoiceProfile> {
  logger.info('Deriving persona voice profile', { name, domain });

  // Try Claude API if configured
  if (config.llm.anthropicApiKey) {
    try {
      const anthropic = new Anthropic({ apiKey: config.llm.anthropicApiKey });
      const prompt = `Derive a precise voice profile for persona "${name}" operating in domain "${domain}".
Return JSON ONLY matching this format:
{
  "tone": ["string"],
  "interests": ["string"],
  "stances": ["string"],
  "boundaries": ["string"]
}`;
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
      return { name, domain, ...parsed };
    } catch (err: any) {
      logger.warn('Anthropic API call failed, falling back to deterministic derivation', { error: err.message });
    }
  }

  // Try Gemini API if configured
  if (config.llm.geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(config.llm.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      const prompt = `Derive a precise voice profile for persona "${name}" operating in domain "${domain}". Return JSON ONLY matching format: {"tone": [], "interests": [], "stances": [], "boundaries": []}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
      return { name, domain, ...parsed };
    } catch (err: any) {
      logger.warn('Gemini API call failed, falling back to deterministic derivation', { error: err.message });
    }
  }

  // Deterministic fallback profile for offline/testing robustness
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

  // Hard rejection boundary check
  const offDomainKeywords = ['crypto giveaway', 'casino', 'lottery', 'celebrity gossip', 'stock tip'];
  for (const bad of offDomainKeywords) {
    if (text.includes(bad)) return false;
  }

  // Check if at least one domain or interest keyword matches
  const hasDomainMatch = domainTerms.some((term) => text.includes(term));
  const hasInterestMatch = interestTerms.some((term) => text.includes(term));

  return hasDomainMatch || hasInterestMatch;
}
