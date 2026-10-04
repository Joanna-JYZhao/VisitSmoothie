import { parseArgs } from 'node:util';
import { createDictationClient, DictationError } from './index.mjs';

const HELP = `Usage: node cli.mjs <audio-file> [--language zh] [--prompt "transcription context"] [--json]

Transcribes a completed recording. Default output is text; --json outputs {text, model}.
Credentials: DICTATION_API_KEY or OPENAI_API_KEY, provided in the server environment.
Optional configuration: DICTATION_BASE_URL, DICTATION_MODEL, DICTATION_LANGUAGE_FIELD,
DICTATION_TIMEOUT_MS, DICTATION_MAX_AUDIO_BYTES. --prompt is transcription context,
not the downstream analysis prompt. Node.js 24+ required.
`;

try {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: { language: { type: 'string' }, prompt: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
    });
  } catch {
    throw new DictationError('INVALID_INPUT', 'Invalid arguments. Use --help for dictation usage.');
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
  } else {
    if (positionals.length !== 1) throw new DictationError('INVALID_INPUT', 'Provide exactly one audio file. Use --help for dictation usage.');
    const env = process.env;
    const client = createDictationClient({
      apiKey: env.DICTATION_API_KEY || env.OPENAI_API_KEY,
      ...(env.DICTATION_BASE_URL ? { baseURL: env.DICTATION_BASE_URL } : {}),
      ...(env.DICTATION_MODEL ? { model: env.DICTATION_MODEL } : {}),
      ...(env.DICTATION_LANGUAGE_FIELD ? { languageField: env.DICTATION_LANGUAGE_FIELD } : {}),
      ...(env.DICTATION_TIMEOUT_MS !== undefined ? { timeoutMs: Number(env.DICTATION_TIMEOUT_MS) } : {}),
      ...(env.DICTATION_MAX_AUDIO_BYTES !== undefined ? { maxAudioBytes: Number(env.DICTATION_MAX_AUDIO_BYTES) } : {}),
    });
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    process.once('SIGINT', cancel);
    try {
      const result = await client.transcribeFile(positionals[0], {
        language: values.language, prompt: values.prompt, signal: cancellation.signal,
      });
      const output = values.json ? JSON.stringify(result) : result.text;
      process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    } finally {
      process.removeListener('SIGINT', cancel);
    }
  }
} catch (error) {
  process.stderr.write(error instanceof DictationError
    ? `${error.code}: ${error.message}\n`
    : 'CLI_ERROR: Could not complete dictation.\n');
  process.exitCode = 1;
}
