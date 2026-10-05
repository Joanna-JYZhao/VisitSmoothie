# Patient Dictation

可独立调用的 **音频 → 原始文本** 功能，供 dictation 输入使用。需要 Node.js 24+，无运行时依赖。已有音频文件、上传文件和 MediaRecorder 完成的录音都能作为输入。函数返回 `{ text, model }`，后续分析代码可直接使用 `text`。

## 同学接入：服务端调用

模块入口是 `patient-dictation/index.mjs`。可相对导入，或在服务项目中用本地包依赖 `"@trimed/patient-dictation": "file:../patient-dictation"` 后安装并通过包名导入；附带 `index.d.mts` 类型声明。

```js
import { createDictationClient } from '../patient-dictation/index.mjs';

const dictation = createDictationClient({
  apiKey: process.env.DICTATION_API_KEY,
});

// 音频文件输入；省略 language 时由模型自动识别。
const { text } = await dictation.transcribeFile('/path/to/recording.wav', {
  language: 'zh',
});

// 把 text 交给你现有的分析函数。分析 key 与 Prompt 由该函数管理。
// await yourAnalysisFunction({ text, apiKey: analysisKey, prompt: analysisPrompt });
```

转写服务 key 放在服务端。该模块不自动读取 `.env`，也不读取分析用的 key；调用方注入配置。只要供应商实现兼容的 `POST /audio/transcriptions`、Bearer 认证、multipart 文件上传和 JSON `{ text }` 响应，就可替换 `baseURL`、`model` 和必要时的 `languageField`。具体供应商兼容性需要自行实测。

## 接口契约

```ts
createDictationClient({
  apiKey: string,
  baseURL?: string,             // 默认 https://api.openai.com/v1
  model?: string,               // 默认 gpt-transcribe
  timeoutMs?: number,           // 默认 120000；覆盖请求及响应读取
  maxAudioBytes?: number,       // 默认 25000000；可以降低
  languageField?: 'language' | 'languages',
  fetchImpl?: typeof fetch,
}): {
  transcribe({
    audio: Blob | File | Buffer | Uint8Array | ArrayBuffer,
    filename?: string,
    language?: string,
    prompt?: string,
    signal?: AbortSignal,
  }): Promise<{ text: string; model: string }>,

  transcribeFile(filePath: string, {
    language?: string,
    prompt?: string,
    signal?: AbortSignal,
  }?): Promise<{ text: string; model: string }>,
}
```

- `transcribe()` 接收音频数据；`transcribeFile()` 接收服务端本地文件路径。字节输入必须提供扩展名正确的 `filename`，File 默认取自身名称；Blob 可按 MIME 推断文件名。它不转码，请保留实际录音格式。
- 支持 `mp3`、`mp4`、`mpeg`、`mpga`、`m4a`、`wav`、`webm`，大小为 1–25,000,000 字节。更长录音由调用方压缩或分段后调用。其他格式由调用方先转码。
- 可选 `language` 是音频语言提示，例如 `zh`、`en`、`zh-cn`；省略即自动识别。gpt-transcribe 模型默认上传 `languages[]`，其他模型默认上传 `language`；可用 `languageField` 覆盖。
- `prompt` 仅是转写上下文，例如药名和术语，不是后续分析 Prompt。它会影响识别结果，应只提供真实相关背景。
- `text` 原样传递服务商结果，保留语言、空格、否定表述和不确定表达；模块不翻译、不总结、不分析。空转写和格式错误会抛异常，绝不生成兜底文本。
- 每次调用独立，可以并发复用一个 client。支持取消和超时，避免自动重试重复计费。模块不保存或记录音频、转写和密钥；CLI 在用户主动调用时输出转写结果。
- 这是完整录音文件的转写功能。麦克风采集、持续实时转写、HTTP 路由、用户认证、数据库存储和下游分析由主应用接入。浏览器录音 Blob 需通过应用后端传入此模块。

## Blob / Buffer 输入

```js
// 服务端拿到上传的 WebM 录音后：
const { text } = await dictation.transcribe({
  audio: uploadedAudioBuffer,
  filename: 'recording.webm',
  language: 'zh',
});

// 服务端 Web Request 可取得上传的 File：
// const form = await request.formData();
// const { text } = await dictation.transcribe({ audio: form.get('audio') });
```

## 取消与错误处理

```js
import { DictationError } from '../patient-dictation/index.mjs';

const controller = new AbortController();
try {
  const result = await dictation.transcribe({
    audio: uploadedAudioBuffer,
    filename: 'recording.webm',
    signal: controller.signal,
  });
  // result.text 可直接进入现有文本输入流程。
} catch (error) {
  if (!(error instanceof DictationError)) throw error;
  // 用 error.code 映射界面提示。
  // error.retryable 表示调用方可考虑重试；不会自动重试。
  // error.status 仅在服务商返回错误 HTTP 状态时存在。
}
// 用户取消操作时调用 controller.abort()。
```

| code | 含义 |
| --- | --- |
| `INVALID_CONFIG` | 缺少转写 key、配置值或 URL 无效 |
| `INVALID_INPUT` | 音频数据类型、文件名、语言或 signal 无效 |
| `EMPTY_AUDIO` / `AUDIO_TOO_LARGE` | 音频为空或超出字节上限 |
| `UNSUPPORTED_FORMAT` | 扩展名不支持 |
| `FILE_READ_ERROR` | 本地文件不存在、不是普通文件或不可读取 |
| `AUTH_FAILED` | 服务商认证或权限失败 |
| `RATE_LIMITED` | 服务商限流或额度不足 |
| `PROVIDER_REJECTED` / `PROVIDER_ERROR` | 服务商拒绝请求或服务异常 |
| `INVALID_RESPONSE` / `EMPTY_TRANSCRIPT` | 服务商返回格式错误或没有文本 |
| `NETWORK_ERROR` / `TIMEOUT` / `ABORTED` | 网络失败、超时或主动取消 |

## CLI

在已配置转写凭据的服务端环境中：

```sh
cd patient-dictation
node cli.mjs --help
node cli.mjs recording.wav --language zh
node cli.mjs recording.m4a --language zh --json
# 若已有本地 env 文件，可由 Node 显式加载：
node --env-file=.env.local cli.mjs recording.webm
```

CLI key 优先取 `DICTATION_API_KEY`，其次 `OPENAI_API_KEY`。可配置 `DICTATION_BASE_URL`、`DICTATION_MODEL`、`DICTATION_LANGUAGE_FIELD`、`DICTATION_TIMEOUT_MS`、`DICTATION_MAX_AUDIO_BYTES`，默认见 `.env.example`。纯文本模式追加一个缺失的末尾换行；`--json` 返回 `{ text, model }`。失败只向 stderr 输出脱敏错误，退出码为 1。

## 验证

```sh
cd patient-dictation
npm test
```

测试使用生成的 WAV 音频、虚构文本、本地 HTTP 模拟转写服务，并实际解析 multipart 上传。没有使用真实患者音频或生产 key。真实服务权限、识别准确率、方言及医疗词汇表现尚未测试，详见 `VERIFICATION.md`。

默认服务与语言字段遵循 [OpenAI 官方文件转写文档](https://developers.openai.com/api/docs/guides/speech-to-text)，查阅日期为 2026-10-03。
