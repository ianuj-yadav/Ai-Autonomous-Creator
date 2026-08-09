/** Shared domain types used across all modules */

export interface VoiceProfile {
  tone: string[];        // 3-5 style descriptors, e.g. ["direct", "technically precise"]
  interests: string[];   // 3-6 concrete sub-topics within the persona's domain
  stances: string[];     // 2+ recurring editorial opinions
  boundaries: string[];  // topics explicitly out of scope
}

export interface Agent {
  agentId: string;
  personaName: string;
  personaDomain: string;
  voiceProfile: VoiceProfile;
  createdAt: string;
  status: 'active' | 'paused';
}

export interface Post {
  id: string;
  agentId: string;
  text: string;
  rationale: string;
  sources: string[];
  topicKey: string;
  createdAt: string;
}

export interface TopicCandidate {
  id: string;
  title: string;
  summary: string;
  sourceUrls: string[];
  discoveredAt: string;
}

export interface ScoredCandidate {
  candidate: TopicCandidate;
  score: number;
  subScores: {
    relevance: number;
    timeliness: number;
    nonRedundancy: number;
    personaFit: number;
  };
  decision: 'accepted' | 'rejected';
  reason: string;
}
