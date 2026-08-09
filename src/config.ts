import dotenv from 'dotenv';

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
    minMinutes: parseFloat(process.env.CADENCE_MIN || '0.1'),
    maxMinutes: parseFloat(process.env.CADENCE_MAX || '0.2'),
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    gemini: {
      apiKey: process.env.NVIDIA_GEMINI_API_KEY || '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',
      model: 'google/diffusiongemma-26b-a4b-it',
    },
    openai: {
      apiKey: process.env.NVIDIA_OPENAI_API_KEY || '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',
      model: 'openai/gpt-oss-120b',
    },
    llama: {
      apiKey: process.env.NVIDIA_LLAMA_API_KEY || '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',
      model: 'meta/llama-3.3-70b-instruct',
    },
  },
  exa: {
    apiKey: process.env.EXA_API_KEY || '',
  },
};
