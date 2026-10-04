import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDictationClient, DictationError } from '../index.mjs';
import { provider, reply, wavBytes } from './helpers.mjs';

const key = 'fictional-test-key';
const input = () => ({ audio: wavBytes(), filename: 'patient.wav' });
const matches = code => error => error instanceof DictationError && error.code === code;
async function directory(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dictation-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('uploads real multipart bytes and returns exact original-language text for analysis', async t => {
  const text = '  昨天开始头疼，没有发烧。每天 5 mg。\nI am not sure.  ';
  const stub = await provider(t, ({ req, res, form }) => {
    assert.equal(req.url, '/v1/audio/transcriptions');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, `Bearer ${key}`);
    assert.match(req.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.equal(form.get('model'), 'gpt-transcribe');
    assert.equal(form.get('response_format'), 'json');
    assert.equal(form.get('prompt'), null);
    assert.equal(form.get('language'), null);
    reply(res, { text, languages: [{ code: 'zh' }] });
  });
  const result = await createDictationClient({ apiKey: key, baseURL: stub.baseURL }).transcribe(input());
  assert.deepEqual(result, { text, model: 'gpt-transcribe' });
  const file = stub.requests[0].form.get('file');
  assert.equal(file.name, 'patient.wav');
  assert.equal(file.type, 'audio/wav');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), wavBytes());
  const analysis = async textInput => ({ received: textInput });
  assert.deepEqual(await analysis(result.text), { received: text });
});

test('uses gpt-transcribe languages[] and separates optional transcription context', async t => {
  const stub = await provider(t, ({ res, form }) => {
    assert.deepEqual(form.getAll('languages[]'), ['zh-cn']);
    assert.equal(form.get('language'), null);
    assert.equal(form.get('prompt'), '阿莫西林');
    reply(res, { text: '阿莫西林。' });
  });
  const client = createDictationClient({ apiKey: key, baseURL: `${stub.baseURL}/` });
  await client.transcribe({ ...input(), language: 'zh-CN', prompt: '阿莫西林' });
});

test('supports configured compatible providers, models and language field overrides', async t => {
  const stub = await provider(t, ({ res, form }) => {
    assert.equal(form.get('model'), 'whisper-1');
    assert.equal(form.get('language'), 'en');
    assert.equal(form.get('languages[]'), null);
    reply(res, { text: 'I have a headache.' });
  });
  const result = await createDictationClient({ apiKey: key, baseURL: stub.baseURL, model: 'whisper-1' })
    .transcribe({ ...input(), language: 'en' });
  assert.equal(result.model, 'whisper-1');
  const other = await provider(t, ({ res, form }) => {
    assert.equal(form.get('languages[]'), 'en');
    assert.equal(form.get('language'), null);
    reply(res, { text: 'Hello.' });
  });
  await createDictationClient({ apiKey: key, baseURL: other.baseURL, model: 'custom', languageField: 'languages' })
    .transcribe({ ...input(), language: 'en' });
});

test('accepts File, recorder Blob with codec MIME, ArrayBuffer and byte subarrays', async t => {
  const stub = await provider(t, ({ res }) => reply(res, { text: 'Fictional transcript.' }));
  const client = createDictationClient({ apiKey: key, baseURL: stub.baseURL });
  const bytes = wavBytes();
  await client.transcribe({ audio: new File([bytes], 'recording.wav') });
  await client.transcribe({ audio: new Blob([bytes], { type: 'audio/webm;codecs=opus' }) });
  await client.transcribe({ audio: Uint8Array.from(bytes).buffer, filename: 'recording.wav' });
  const padded = Buffer.concat([Buffer.from([1]), bytes, Buffer.from([2])]);
  await client.transcribe({ audio: padded.subarray(1, -1), filename: 'recording.wav' });
  assert.equal(stub.requests[1].form.get('file').name, 'dictation.webm');
  for (const request of stub.requests) {
    assert.deepEqual(Buffer.from(await request.form.get('file').arrayBuffer()), bytes);
  }
});

test('validates configuration without echoing secrets', () => {
  for (const config of [
    {}, { apiKey: '' }, { apiKey: key, model: '' },
    { apiKey: key, timeoutMs: 0 }, { apiKey: key, timeoutMs: 2 ** 32 },
    { apiKey: key, maxAudioBytes: 0 }, { apiKey: key, maxAudioBytes: 25_000_001 },
    { apiKey: key, baseURL: 'http://example.com/v1' },
    { apiKey: key, baseURL: 'https://user:secret@example.com/v1' },
    { apiKey: key, baseURL: 'https://example.com/v1?key=secret' },
    { apiKey: key, languageField: 'other' }, { apiKey: key, fetchImpl: null },
  ]) assert.throws(() => createDictationClient(config), matches('INVALID_CONFIG'));
});

test('rejects empty, oversized, unsupported and malformed inputs before any upload', async () => {
  let calls = 0;
  const client = createDictationClient({ apiKey: key, maxAudioBytes: 700, fetchImpl: async () => { calls++; } });
  for (const [badInput, code] of [
    [{ audio: Buffer.alloc(0), filename: 'empty.wav' }, 'EMPTY_AUDIO'],
    [{ audio: Buffer.alloc(701), filename: 'large.wav' }, 'AUDIO_TOO_LARGE'],
    [{ audio: wavBytes(), filename: 'audio.exe' }, 'UNSUPPORTED_FORMAT'],
    [{ audio: wavBytes() }, 'INVALID_INPUT'],
    [{ audio: 'not bytes', filename: 'audio.wav' }, 'INVALID_INPUT'],
    [{ ...input(), filename: 'audio.wav\n' }, 'INVALID_INPUT'],
    [{ ...input(), language: 'chinese' }, 'INVALID_INPUT'],
    [{ ...input(), prompt: {} }, 'INVALID_INPUT'],
    [{ ...input(), signal: {} }, 'INVALID_INPUT'],
    [null, 'INVALID_INPUT'],
  ]) await assert.rejects(client.transcribe(badInput), matches(code));
  assert.equal(calls, 0);
});

test('strips caller directory paths from uploaded filenames', async t => {
  const stub = await provider(t, ({ res }) => reply(res, { text: 'Hello.' }));
  const client = createDictationClient({ apiKey: key, baseURL: stub.baseURL });
  await client.transcribe({ ...input(), filename: '/private/patient-id/RECORDING.WAV' });
  await client.transcribe({ ...input(), filename: 'C:\\private\\patient-id\\recording.wav' });
  assert.deepEqual(stub.requests.map(r => r.form.get('file').name), ['RECORDING.WAV', 'recording.wav']);
});

test('reads caller-owned files with the same contract and bounds local file input', async t => {
  const dir = await directory(t);
  const file = path.join(dir, 'recording.wav');
  await writeFile(file, wavBytes());
  const stub = await provider(t, ({ res }) => reply(res, { text: 'Fictional patient input.' }));
  const client = createDictationClient({ apiKey: key, baseURL: stub.baseURL });
  assert.equal((await client.transcribeFile(file)).text, 'Fictional patient input.');
  assert.deepEqual(Buffer.from(await stub.requests[0].form.get('file').arrayBuffer()), wavBytes());
  await assert.rejects(client.transcribeFile(path.join(dir, 'missing.wav')), matches('FILE_READ_ERROR'));
  await assert.rejects(client.transcribeFile(dir), matches('FILE_READ_ERROR'));
  const limited = createDictationClient({ apiKey: key, maxAudioBytes: 100 });
  await assert.rejects(limited.transcribeFile(file), matches('AUDIO_TOO_LARGE'));
  await writeFile(file, Buffer.alloc(0));
  await assert.rejects(client.transcribeFile(file), matches('EMPTY_AUDIO'));
  assert.equal(stub.requests.length, 1);
});

test('maps provider failures to stable redacted errors, with no automatic retries', async t => {
  for (const [status, code, retryable] of [
    [400, 'PROVIDER_REJECTED', false], [401, 'AUTH_FAILED', false],
    [403, 'AUTH_FAILED', false], [413, 'AUDIO_TOO_LARGE', false],
    [408, 'PROVIDER_ERROR', true], [429, 'RATE_LIMITED', true],
    [500, 'PROVIDER_ERROR', true],
  ]) {
    const stub = await provider(t, ({ res }) => reply(res, { error: { message: `private-recording ${key}` } }, status));
    const client = createDictationClient({ apiKey: key, baseURL: stub.baseURL });
    await assert.rejects(client.transcribe(input()), error => {
      assert.equal(error.code, code); assert.equal(error.status, status); assert.equal(error.retryable, retryable);
      assert.ok(!`${error.stack} ${JSON.stringify(error)}`.includes(key));
      assert.ok(!JSON.stringify(error).includes('private-recording'));
      return true;
    });
    assert.equal(stub.requests.length, 1);
  }
});

test('rejects invalid responses and blank transcripts without invented fallback text', async t => {
  for (const data of [{ text: null }, { text: 123 }, {}, { text: ' \n ' }]) {
    const stub = await provider(t, ({ res }) => reply(res, data));
    const code = typeof data.text === 'string' ? 'EMPTY_TRANSCRIPT' : 'INVALID_RESPONSE';
    await assert.rejects(createDictationClient({ apiKey: key, baseURL: stub.baseURL }).transcribe(input()), matches(code));
  }
  const stub = await provider(t, ({ res }) => { res.writeHead(200); res.end('not JSON'); });
  await assert.rejects(createDictationClient({ apiKey: key, baseURL: stub.baseURL }).transcribe(input()), matches('INVALID_RESPONSE'));
});

test('redacts transport failures and blocks redirects', async t => {
  const client = createDictationClient({ apiKey: key, fetchImpl: async () => { throw new Error(`private ${key}`); } });
  await assert.rejects(client.transcribe(input()), error => {
    assert.equal(error.code, 'NETWORK_ERROR'); assert.equal(error.retryable, true);
    assert.ok(!error.stack.includes(key)); assert.equal(error.cause, undefined);
    return true;
  });
  const destination = await provider(t, ({ res }) => reply(res, { text: 'Should not receive audio.' }));
  const redirect = await provider(t, ({ res }) => {
    res.writeHead(307, { Location: `${destination.baseURL}/audio/transcriptions` }); res.end();
  });
  await assert.rejects(createDictationClient({ apiKey: key, baseURL: redirect.baseURL }).transcribe(input()), matches('NETWORK_ERROR'));
  assert.equal(destination.requests.length, 0);
});

test('times out both the provider response and a stalled response body', async t => {
  for (const stalledBody of [false, true]) {
    const stub = await provider(t, ({ res }) => { if (stalledBody) { res.writeHead(200); res.write('{'); } });
    const client = createDictationClient({ apiKey: key, baseURL: stub.baseURL, timeoutMs: 100 });
    await assert.rejects(client.transcribe(input()), matches('TIMEOUT'));
  }
});

test('supports cancellation before upload, during upload and file reading', async t => {
  let calls = 0;
  const aborted = new AbortController(); aborted.abort('private caller reason');
  const client = createDictationClient({ apiKey: key, fetchImpl: async () => { calls++; } });
  await assert.rejects(client.transcribe({ ...input(), signal: aborted.signal }), matches('ABORTED'));
  await assert.rejects(client.transcribeFile('/not/read.wav', { signal: aborted.signal }), matches('ABORTED'));
  assert.equal(calls, 0);
  const active = new AbortController();
  const stub = await provider(t, () => active.abort('private caller reason'));
  const inFlight = createDictationClient({ apiKey: key, baseURL: stub.baseURL });
  await assert.rejects(inFlight.transcribe({ ...input(), signal: active.signal }), error => {
    assert.equal(error.code, 'ABORTED'); assert.equal(error.retryable, false);
    assert.ok(!error.stack.includes('private caller reason'));
    return true;
  });
});

test('isolates concurrent patient inputs and cancellation per request', async t => {
  const first = new AbortController();
  const stub = await provider(t, ({ res, form }) => {
    if (form.get('file').name === 'first.wav') first.abort();
    else reply(res, { text: 'Second fictional patient.' });
  });
  const client = createDictationClient({ apiKey: key, baseURL: stub.baseURL });
  const [one, two] = await Promise.allSettled([
    client.transcribe({ ...input(), filename: 'first.wav', signal: first.signal }),
    client.transcribe({ ...input(), filename: 'second.wav' }),
  ]);
  assert.equal(one.status, 'rejected'); assert.equal(one.reason.code, 'ABORTED');
  assert.deepEqual(two.value, { text: 'Second fictional patient.', model: 'gpt-transcribe' });
});
