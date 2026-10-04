import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { provider, reply, wavBytes } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));
function run(args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const name of Object.keys(env)) if (/^(DICTATION_|OPENAI_)/u.test(name)) delete env[name];
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

test('CLI help needs no credentials; malformed arguments fail without leaking input', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, 0); assert.match(help.stdout, /Usage:/u); assert.equal(help.stderr, '');
  for (const args of [[], ['one.wav', 'two.wav'], ['--unknown=private-value']]) {
    const failure = await run(args);
    assert.equal(failure.code, 1); assert.equal(failure.stdout, '');
    assert.match(failure.stderr, /^INVALID_INPUT:/u); assert.ok(!failure.stderr.includes('private-value'));
  }
});

test('CLI reports missing key without treating the analysis key as a dictation key', async () => {
  const result = await run(['audio.wav'], { DEEPSEEK_API_KEY: 'fictional-analysis-key' });
  assert.equal(result.code, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /^INVALID_CONFIG:/u); assert.ok(!result.stderr.includes('fictional-analysis-key'));
});

test('CLI transcribes a file through real local HTTP and outputs plain text or JSON', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dictation-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'recording.wav');
  await writeFile(file, wavBytes());
  const text = '头疼两天，没有发烧。';
  const stub = await provider(t, ({ res, form }) => {
    assert.equal(form.get('languages[]'), 'zh');
    assert.equal(form.get('prompt'), '布洛芬');
    reply(res, { text });
  });
  const env = { DICTATION_API_KEY: 'fictional-test-key', DICTATION_BASE_URL: stub.baseURL };
  const plain = await run([file, '--language', 'zh', '--prompt', '布洛芬'], env);
  assert.deepEqual(plain, { code: 0, stdout: `${text}\n`, stderr: '' });
  const json = await run([file, '--language', 'zh', '--prompt', '布洛芬', '--json'], env);
  assert.equal(json.code, 0); assert.equal(json.stderr, '');
  assert.deepEqual(JSON.parse(json.stdout), { text, model: 'gpt-transcribe' });
  assert.equal(stub.requests.length, 2);
});

test('CLI rejects invalid configuration and provider failures with sanitized stderr', async t => {
  const badConfig = await run(['audio.wav'], { DICTATION_API_KEY: 'fictional-test-key', DICTATION_TIMEOUT_MS: 'NaN' });
  assert.equal(badConfig.code, 1); assert.match(badConfig.stderr, /^INVALID_CONFIG:/u);
  const dir = await mkdtemp(path.join(tmpdir(), 'dictation-cli-error-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'recording.wav');
  await writeFile(file, wavBytes());
  const stub = await provider(t, ({ res }) => reply(res, { error: { message: 'private-upstream-data' } }, 401));
  const failed = await run([file], { OPENAI_API_KEY: 'fictional-test-key', DICTATION_BASE_URL: stub.baseURL });
  assert.equal(failed.code, 1); assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /^AUTH_FAILED:/u); assert.ok(!failed.stderr.includes('private-upstream-data'));
});
