import 'dotenv/config';

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),

  anthropic: {
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
  },

  exa: {
    apiKey: requireEnv('EXA_API_KEY'),
  },

  db: {
    host: optionalEnv('DB_HOST', 'localhost'),
    port: parseInt(optionalEnv('DB_PORT', '5432'), 10),
    user: optionalEnv('DB_USER', 'aiagent'),
    password: requireEnv('DB_PASSWORD'),
    name: optionalEnv('DB_NAME', 'autonomous_ai'),
  },

  cadence: {
    // If TEST_MODE=true, values are treated as seconds instead of minutes
    minMinutes: parseFloat(optionalEnv('CADENCE_MIN', '20')),
    maxMinutes: parseFloat(optionalEnv('CADENCE_MAX', '45')),
    jitterMinutes: parseFloat(optionalEnv('CADENCE_JITTER', '5')),
    testMode: optionalEnv('TEST_MODE', 'false') === 'true',
  },

  scoring: {
    threshold: parseFloat(optionalEnv('SCORE_THRESHOLD', '0.6')),
    relevanceThreshold: parseFloat(optionalEnv('RELEVANCE_THRESHOLD', '0.5')),
  },

  post: {
    minChars: parseInt(optionalEnv('POST_MIN_CHARS', '400'), 10),
    maxChars: parseInt(optionalEnv('POST_MAX_CHARS', '1600'), 10),
  },

  memory: {
    dedupThreshold: parseFloat(optionalEnv('DEDUP_THRESHOLD', '0.5')),
    lookback: parseInt(optionalEnv('MEMORY_LOOKBACK', '10'), 10),
  },
} as const;
