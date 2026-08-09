import { config } from '../config';
import { logger } from '../logger';

export interface NvidiaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callNvidiaAi(prompt: string, systemPrompt?: string): Promise<string> {
  const messages: NvidiaMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  // 1. Primary Model: NVIDIA Gemini / DiffusionGemma
  try {
    logger.info('Calling NVIDIA Gemini API', { model: config.nvidia.gemini.model });
    const text = await executeNvidiaRequest(
      config.nvidia.url,
      config.nvidia.gemini.apiKey,
      config.nvidia.gemini.model,
      messages,
      2048,
      1,
      0.95
    );
    if (text) return text;
  } catch (err: any) {
    logger.warn('NVIDIA Gemini call failed, attempting OpenAI fallback', { error: err.message });
  }

  // 2. Secondary Fallback: NVIDIA OpenAI / GPT-OSS 120B
  try {
    logger.info('Calling NVIDIA OpenAI GPT-OSS API', { model: config.nvidia.openai.model });
    const text = await executeNvidiaRequest(
      config.nvidia.url,
      config.nvidia.openai.apiKey,
      config.nvidia.openai.model,
      messages,
      2048,
      1,
      1
    );
    if (text) return text;
  } catch (err: any) {
    logger.warn('NVIDIA OpenAI call failed, attempting Llama 3.3 fallback', { error: err.message });
  }

  // 3. Tertiary Fallback: NVIDIA Llama 3.3 70B Instruct
  try {
    logger.info('Calling NVIDIA Llama 3.3 API', { model: config.nvidia.llama.model });
    const text = await executeNvidiaRequest(
      config.nvidia.url,
      config.nvidia.llama.apiKey,
      config.nvidia.llama.model,
      messages,
      1024,
      0.2,
      0.7
    );
    if (text) return text;
  } catch (err: any) {
    logger.error('All NVIDIA AI provider fallbacks failed', { error: err.message });
    throw err;
  }

  throw new Error('No valid response received from any NVIDIA AI provider');
}

async function executeNvidiaRequest(
  url: string,
  apiKey: string,
  model: string,
  messages: NvidiaMessage[],
  maxTokens: number,
  temperature: number,
  topP: number
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errBody}`);
    }

    const data = (await response.json()) as any;
    const resultText = data.choices?.[0]?.message?.content || '';
    logger.info('Successfully received response from NVIDIA AI model', { model, textLength: resultText.length });
    return resultText;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}
