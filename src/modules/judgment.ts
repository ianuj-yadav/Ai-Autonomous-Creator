import { logger } from '../logger';
import { TopicCandidate } from './discovery';
import { VoiceProfile, isOnDomain } from './persona';

export interface ScoreBreakdown {
  relevance: number;
  timeliness: number;
  nonRedundancy: number;
  personaFit: number;
  composite: number;
}

export interface JudgmentResult {
  candidate: TopicCandidate;
  scores: ScoreBreakdown;
  accepted: boolean;
  rejectionReason?: string;
}

export function scoreCandidate(
  candidate: TopicCandidate,
  profile: VoiceProfile,
  recentTopicKeys: string[] = []
): JudgmentResult {
  // 1. Hard Domain Check
  const domainMatch = isOnDomain(candidate.title, candidate.summary, profile);
  const relevance = domainMatch ? 0.85 : 0.25;

  // 2. Timeliness (heuristic based on discovery time)
  const ageInHours = (Date.now() - new Date(candidate.discoveredAt).getTime()) / (1000 * 60 * 60);
  const timeliness = Math.max(0.3, Math.min(1.0, 1.0 - ageInHours / 48));

  // 3. Non-redundancy
  const titleLower = candidate.title.toLowerCase();
  const matchesRecent = recentTopicKeys.some((key) => titleLower.includes(key));
  const nonRedundancy = matchesRecent ? 0.3 : 0.9;

  // 4. Persona Fit
  const hasStanceMatch = profile.stances.some((stance) => {
    const stanceWords = stance.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    return stanceWords.some((w) => titleLower.includes(w) || candidate.summary.toLowerCase().includes(w));
  });
  const personaFit = hasStanceMatch ? 0.95 : 0.7;

  // Weighted Composite Score
  const composite = Number(
    (relevance * 0.3 + timeliness * 0.25 + nonRedundancy * 0.25 + personaFit * 0.2).toFixed(2)
  );

  const scores: ScoreBreakdown = {
    relevance,
    timeliness,
    nonRedundancy,
    personaFit,
    composite,
  };

  // Hard Gate 1: Relevance < 0.5 -> Immediate rejection
  if (relevance < 0.5) {
    const reason = `Rejected: Failed hard domain gate (relevance score ${relevance} < 0.5). Candidate is off-topic for domain "${profile.domain}".`;
    logger.info('Candidate REJECTED by hard domain gate', { candidate: candidate.title, scores, reason });
    return { candidate, scores, accepted: false, rejectionReason: reason };
  }

  // Hard Gate 2: Non-redundancy check
  if (nonRedundancy < 0.5) {
    const reason = `Rejected: High redundancy with recent posts (non-redundancy score ${nonRedundancy} < 0.5).`;
    logger.info('Candidate REJECTED by redundancy gate', { candidate: candidate.title, scores, reason });
    return { candidate, scores, accepted: false, rejectionReason: reason };
  }

  // Accept Threshold: Composite >= 0.6
  if (composite >= 0.6) {
    logger.info('Candidate ACCEPTED by editorial judgment', { candidate: candidate.title, scores });
    return { candidate, scores, accepted: true };
  }

  const reason = `Rejected: Composite score ${composite} fell below acceptance threshold of 0.6.`;
  logger.info('Candidate REJECTED by composite threshold', { candidate: candidate.title, scores, reason });
  return { candidate, scores, accepted: false, rejectionReason: reason };
}
