import { deriveVoiceProfile, isOnDomain } from '../modules/persona';
import { scoreCandidate } from '../modules/judgment';
import { computeTopicKey, calculateJaccardSimilarity, isNearDuplicate } from '../modules/memory';
import { buildRationale, buildSources, validatePostDraft } from '../modules/rationale';

async function runAcceptanceTests() {
  console.log('=== Running Autonomous AI Creator Acceptance Test Suite (TC-01 - TC-14) ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Test Domain Hard Gate (TC-05)
  const profile = await deriveVoiceProfile('TestPersona', 'AI Security');
  const offDomainCheck = isOnDomain('Crypto Giveaway Extravaganza', 'Win 100 free tokens by joining this lottery', profile);
  assert(offDomainCheck === false, 'TC-05: Off-domain crypto/lottery candidate rejected by hard domain gate');

  const onDomainCheck = isOnDomain('LLM Prompt Injection Vulnerability Discovered', 'New exploit path targets AI pipeline resolution', profile);
  assert(onDomainCheck === true, 'TC-05: Valid AI Security topic passes hard domain gate');

  // 2. Editorial Scoring & Hard Gate Override (TC-04, TC-05)
  const candidateOffDomain = {
    title: 'Crypto Stock Tips 2026',
    summary: 'Stock market speculation and crypto tips',
    sourceUrls: ['https://example.org/stock'],
    discoveredAt: new Date(),
  };
  const judgmentOffDomain = scoreCandidate(candidateOffDomain, profile, []);
  assert(judgmentOffDomain.accepted === false, 'TC-04/TC-05: Off-domain candidate rejected despite timeliness');
  assert(judgmentOffDomain.scores.relevance < 0.5, 'TC-05: Off-domain relevance score is < 0.5');

  // 3. Memory Deduplication & Jaccard Similarity (TC-07)
  const keyA = computeTopicKey('Critical vulnerability in AI Security LLM pipeline');
  const keyB = computeTopicKey('Critical vulnerability discovered in AI Security LLM pipeline');
  const sim = calculateJaccardSimilarity(keyA, keyB);
  assert(sim >= 0.7, 'TC-07: Near-duplicate keyword fingerprint calculates high similarity');

  const mockPost = {
    id: '1',
    agentId: 'agent-1',
    text: 'Critical vulnerability in AI Security LLM pipeline',
    rationale: 'Reason',
    sources: ['https://example.org'],
    topicKey: keyA,
    createdAt: new Date(),
  };
  const candidateDuplicate = {
    title: 'Critical vulnerability in AI Security LLM pipeline',
    summary: 'Exploit path in LLM pipeline',
    sourceUrls: ['https://example.org'],
    discoveredAt: new Date(),
  };
  const memCheck = isNearDuplicate(candidateDuplicate, [mockPost], 0.5);
  assert(memCheck.duplicate === true, 'TC-07: Memory module detects near-duplicate candidate and rejects');

  // 4. Rationale & Source Validation (TC-08)
  const candidateGood = {
    title: 'Model Stealing Attack Vector',
    summary: 'Researchers demonstrate API extraction vector',
    sourceUrls: ['https://example.org/paper'],
    discoveredAt: new Date(),
  };
  const mockJudgment = { candidate: candidateGood, scores: { relevance: 0.9, timeliness: 0.9, nonRedundancy: 0.9, personaFit: 0.9, composite: 0.9 }, accepted: true };
  const rationale = buildRationale(candidateGood, mockJudgment, [candidateOffDomain]);
  const sources = buildSources(candidateGood);

  assert(rationale.length > 20, 'TC-08: Rationale is non-empty and substantive');
  assert(sources.length >= 1 && sources[0].startsWith('http'), 'TC-08: Sources contains at least 1 valid absolute URL');

  const validationFail = validatePostDraft('Short text', '', []);
  assert(validationFail.valid === false, 'TC-08: Post draft with empty rationale and sources fails validation assertion');

  // 5. Summary Results
  console.log(`\n==================================================`);
  console.log(`Acceptance Test Suite Completed: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
