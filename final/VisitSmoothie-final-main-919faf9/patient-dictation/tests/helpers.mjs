import http from 'node:http';
import { Readable } from 'node:stream';

// Generated silent PCM fixture, not a patient recording or an accuracy test.
export function wavBytes() {
  const audio = Buffer.alloc(44 + 640);
  audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(640, 40);
  return audio;
}

export async function provider(t, handle) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    try {
      const request = new Request(`http://127.0.0.1${req.url}`, {
        method: req.method, headers: req.headers,
        body: Readable.toWeb(req), duplex: 'half',
      });
      const form = await request.formData();
      requests.push({ req, form });
      await handle({ req, res, form });
    } catch (error) {
      res.writeHead(500); res.end('Local test provider failed.');
      requests.push({ error });
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return { baseURL: `http://127.0.0.1:${server.address().port}/v1`, requests };
}

export function reply(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
