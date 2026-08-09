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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  try {
    const response = await fetch(config.nvidia.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.nvidia.apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('NVIDIA API returned error status, attempting fallback model', { status: response.status, errorText });

      const fallbackPayload = {
        ...payload,
        model: 'meta/llama-3.1-405b-instruct',
      };

      const fallbackController = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 8000);

      const fallbackRes = await fetch(config.nvidia.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.nvidia.apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackPayload),
        signal: fallbackController.signal,
      });
      clearTimeout(fallbackTimeout);

      if (!fallbackRes.ok) {
        throw new Error(`NVIDIA API HTTP ${fallbackRes.status}: ${await fallbackRes.text()}`);
      }

      const fallbackData = (await fallbackRes.json()) as any;
      return fallbackData.choices?.[0]?.message?.content || '';
    }

    const data = (await response.json()) as any;
    const resultText = data.choices?.[0]?.message?.content || '';
    logger.info('Successfully received response from NVIDIA AI API', { textLength: resultText.length });
    return resultText;
  } catch (err: any) {
    clearTimeout(timeoutId);
    logger.warn('NVIDIA AI API call timed out or failed, proceeding with fallback', { error: err.message });
    throw err;
  }
}
