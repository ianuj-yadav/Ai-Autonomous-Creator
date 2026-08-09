/**
 * Content Generation Module — FR-5.1, FR-5.2, FR-5.3
 *
 * Drafts a persona-voiced post grounded strictly in the discovered
 * source material. Never fabricates facts (NFR-6 / FR-5.3).
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../logger';
import type { Post, ScoredCandidate, VoiceProfile } from '../types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

function buildSystemPrompt(profile: VoiceProfile): string {
  return `You are ${profile.tone.join(', ')} writer and ${profile.interests[0]} expert.

Your writing persona:
- Tone: ${profile.tone.join(', ')}
- Core interests: ${profile.interests.join(', ')}
- Recurring stances: ${profile.stances.join('; ')}
- You NEVER write about: ${profile.boundaries.join(', ')}

STRICT RULES:
1. Write ONLY facts present in the provided source material. No invented statistics, quotes, or claims.
2. Post must be ${config.post.minChars}–${config.post.maxChars} characters long.
3. Write as a standalone post — no "As I mentioned" unless a recent post is explicitly referenced.
4. No hashtags, no emojis, no "Thread:" prefix — plain editorial prose only.
5. Respond with ONLY the post text and a JSON block at the end, like this:

<post>
[post text here]
</post>
<grounding>
["fact1 from source", "fact2 from source"]
</grounding>`;
}

export async function generatePost(
  scored: ScoredCandidate,
  voiceProfile: VoiceProfile,
  recentPosts: Post[]
): Promise<{ text: string; groundingNotes: string[] }> {
  const { candidate } = scored;

  const recentContext = recentPosts
    .slice(0, 3)
    .map((p) => `- ${p.text.slice(0, 200)}...`)
    .join('\n');

  const prompt = `Source material (treat as ground truth — only state facts present here):
Title: ${candidate.title}
Summary: ${candidate.summary}
URL: ${candidate.sourceUrls[0]}
Discovered: ${candidate.discoveredAt}

Why this topic was accepted (use this angle in your post):
${scored.reason}

Recent posts for continuity (reference ONLY if genuinely relevant):
${recentContext || '(none yet)'}

Write the post now.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    temperature: 0.7,
    system: buildSystemPrompt(voiceProfile),
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text;

  // Parse <post> and <grounding> blocks
  const postMatch = raw.match(/<post>\s*([\s\S]*?)\s*<\/post>/);
  const groundingMatch = raw.match(/<grounding>\s*([\s\S]*?)\s*<\/grounding>/);

  const text = postMatch?.[1]?.trim() ?? raw.trim();
  let groundingNotes: string[] = [];
  try {
    groundingNotes = groundingMatch ? JSON.parse(groundingMatch[1]) : [];
  } catch {
    groundingNotes = [];
  }

  // Enforce length bounds — truncate at word boundary if over
  const truncated =
    text.length > config.post.maxChars
      ? text.slice(0, config.post.maxChars).replace(/\s+\S*$/, '') + '…'
      : text;

  logger.info(
    { title: candidate.title, chars: truncated.length },
    'Post generated'
  );

  return { text: truncated, groundingNotes };
}
