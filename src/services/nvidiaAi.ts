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

  const payload = {
    model: config.nvidia.model,
    messages,
    max_tokens: 2048,
    temperature: 0.7,
    top_p: 0.95,
  };

  logger.info('Calling NVIDIA AI API', { model: config.nvidia.model, url: config.nvidia.url });

  try {
    const response = await fetch(config.nvidia.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.nvidia.apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('NVIDIA API returned error status, attempting fallback model', { status: response.status, errorText });

      // Fallback model call if primary model returns 404/400
      const fallbackPayload = {
        ...payload,
        model: 'meta/llama-3.1-405b-instruct',
      };
      const fallbackRes = await fetch(config.nvidia.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.nvidia.apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackPayload),
      });

      if (!fallbackRes.ok) {
        throw new Error(`NVIDIA API HTTP ${fallbackRes.status}: ${await fallbackRes.text()}`);
      }

      const fallbackData = await fallbackRes.json();
      return fallbackData.choices?.[0]?.message?.content || '';
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content || '';
    logger.info('Successfully received response from NVIDIA AI API', { textLength: resultText.length });
    return resultText;
  } catch (err: any) {
    logger.error('NVIDIA AI API call failed', { error: err.message });
    throw err;
  }
}
