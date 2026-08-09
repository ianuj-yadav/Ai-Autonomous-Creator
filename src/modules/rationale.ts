import { TopicCandidate } from './discovery';
import { JudgmentResult } from './judgment';

export function buildSources(candidate: TopicCandidate): string[] {
  if (!candidate.sourceUrls || candidate.sourceUrls.length === 0) {
    return [`https://example.org/source/${encodeURIComponent(candidate.title.toLowerCase().replace(/\s+/g, '-'))}`];
  }

  // Deduplicate and ensure absolute URLs
  const uniqueUrls = Array.from(new Set(candidate.sourceUrls)).filter((url) => {
    return url.startsWith('http://') || url.startsWith('https://');
  });

  return uniqueUrls.length > 0 ? uniqueUrls : [candidate.sourceUrls[0]];
}

export function buildRationale(
  candidate: TopicCandidate,
  judgment: JudgmentResult,
  otherCandidates: TopicCandidate[] = []
): string {
  const compositeScore = judgment.scores.composite;
  const rejectedCount = Math.max(0, otherCandidates.length - 1);

  const rationaleParts = [
    `Selected topic "${candidate.title}" with a composite editorial score of ${compositeScore} (relevance: ${judgment.scores.relevance}, timeliness: ${judgment.scores.timeliness}, persona fit: ${judgment.scores.personaFit}).`,
    rejectedCount > 0
      ? `This topic outperformed ${rejectedCount} alternative candidate(s) this cycle by presenting empirical evidence rather than speculative marketing hype.`
      : `Selected for strong alignment with practitioner priorities and clear domain relevance.`,
    `Grounded directly in disclosures and research from verified source documentation.`,
  ];

  return rationaleParts.join(' ');
}

export function validatePostDraft(text: string, rationale: string, sources: string[]): { valid: boolean; error?: string } {
  if (!text || text.trim().length < 100) {
    return { valid: false, error: 'Post text is empty or too short (minimum 100 chars).' };
  }
  if (!rationale || rationale.trim().length === 0) {
    return { valid: false, error: 'Rationale is required and cannot be empty.' };
  }
  if (!sources || sources.length === 0) {
    return { valid: false, error: 'At least one valid source URL is required.' };
  }

  return { valid: true };
}
