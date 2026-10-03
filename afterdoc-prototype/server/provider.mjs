import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function loadProviderConfig(appDir) {
  const envFile = path.resolve(appDir, '..', '.env');
  if (fs.existsSync(envFile)) {
    const parsed = parseEnv(fs.readFileSync(envFile, 'utf8'));
    for (const [name, value] of Object.entries(parsed)) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }
  return {
    key: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  };
}

export async function completeJson(config, system, user, timeoutMs = 45000) {
  if (!config.key) throw new AppError('not_configured', 'The AI service is not configured.', 503);
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AppError('provider_timeout', 'The AI service timed out. Please try again.', 504));
    }, timeoutMs);
  });
  const started = Date.now();
  try {
    let response;
    try {
      response = await Promise.race([fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {'Authorization': `Bearer ${config.key}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          model: config.model,
          messages: [
            {role: 'system', content: `${system}\nReturn one JSON object only. Example: {"ok":true}.`},
            {role: 'user', content: JSON.stringify(user)},
          ],
          response_format: {type: 'json_object'},
          thinking: {type: 'disabled'},
          temperature: 0.2,
          max_tokens: 6000,
        }),
        signal: controller.signal,
      }), deadline]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') throw new AppError('provider_timeout', 'The AI service timed out. Please try again.', 504);
      throw new AppError('provider_network', 'Could not reach the AI service. Please try again.', 502);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new AppError('provider_auth', 'The AI service credentials were rejected.', 502);
      if (response.status === 402) throw new AppError('provider_balance', 'The AI service has insufficient balance.', 502);
      if (response.status === 429) throw new AppError('provider_rate_limit', 'The AI service is busy. Please try again shortly.', 503);
      throw new AppError('provider_error', 'The AI service could not complete this request.', 502);
    }
    let data;
    try { data = await Promise.race([response.json(), deadline]); }
    catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') throw new AppError('provider_timeout', 'The AI service timed out. Please try again.', 504);
      throw new AppError('provider_parse', 'The AI service returned an unreadable response.', 502);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new AppError('provider_parse', 'The AI service returned an unreadable response.', 502);
    try {
      const result = JSON.parse(content);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('shape');
      return {result, latencyMs: Date.now() - started};
    } catch {
      throw new AppError('provider_parse', 'The AI service returned an unreadable response.', 502);
    }
  } finally {
    clearTimeout(timer);
  }
}
