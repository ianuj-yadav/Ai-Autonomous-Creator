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
    minMinutes: parseFloat(process.env.CADENCE_MIN || '0.2'), // Default fast cadence for test, configurable
    maxMinutes: parseFloat(process.env.CADENCE_MAX || '0.5'),
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
