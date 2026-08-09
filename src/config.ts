import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'autonomous_ai_creator',
  },
  cadence: {
    minMinutes: parseFloat(process.env.CADENCE_MIN || '0.1'), // Fast real-time cycle cadence (~6s - 12s)
    maxMinutes: parseFloat(process.env.CADENCE_MAX || '0.2'),
  },
  nvidia: {
    apiKey: process.env.NVIDIA_API_KEY || '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',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    model: process.env.NVIDIA_MODEL || 'google/diffusiongemma-26b-a4b-it',
  },
  llm: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  },
  exa: {
    apiKey: process.env.EXA_API_KEY || '',
  },
};
