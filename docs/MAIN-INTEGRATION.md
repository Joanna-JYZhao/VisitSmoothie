# main 整合说明

本次将所有本地功能分支及已拉取的远端最新功能分支合入 `main`，保留各分支历史。项目根目录运行最新版 Next.js 患者应用。

## 来源

| 来源分支 | 合入的提交 | 内容 |
| --- | --- | --- |
| `codex/yiban-integrated` | `15dd497` | 既有集成结果、主应用、账号和语音模块 |
| `origin/yiban-patient` | `686fdf0` | 患者流程、加密存储、Claude 客户端 |
| `origin/codex/yiban-celadon-ui` | `c194b3c` | 最新手机 UI、身体图、描述修订、Clinical Plan、逐条追问、GLM/Claude 切换 |
| `origin/yiban-mobile` | `ad717c2` | 最新 pre → post 入口、引导箭头定位 |
| `origin/codex/visit-smoothie-onboarding` | `2c1423b` | 独立账号模块、可编辑昵称、资料和会话 |
| `origin/codex/patient-audio-transcription` | `9d8507a` | 独立语音转写模块、CLI、输入及配置校验 |
| `origin/codex/afterdoc-prototype` | `55a95c1` | 项目历史、文档与虚构病人材料 |

已使用 `git merge-base --is-ancestor <分支> main` 核对全部本地及远端分支，均已包含。来源工作树中的未提交草稿继续保留在原处；本次以已提交的最新版本为依据。

## 冲突处理

- `.env.example`、`README.md`、`src/lib/ai/glm.ts` 使用最新 UI 分支的提供商切换版本，保留 `AI_PROVIDER`、GLM 和 Claude 配置以及空的加密密钥配置项。
- `src/components/GuideTour.tsx` 使用最新手机布局版本，再合入 `ad717c2` 的箭头定位修正。首次使用完成状态继续保存在账号设置中。
- 已在较新历史中删除的旧原型沿用删除决定。
- HTTP 规则测试的三个旧预期与最新版问诊规则冲突，已更新为：保留患者明确否认的回答、补足所需信息后结束、超过四问仍继续逐项询问。增加了不确定回答能结束且没有重复追问的接口验收。

## 运行与模块边界

| 入口 | 用法 | 数据与接口 |
| --- | --- | --- |
| 根目录患者主应用 | `npm run dev`；默认 3000 | 最新患者 UI、诊前/诊后、待办、历史、资料；服务端加密账号存储 |
| `visit-smoothie/` | `./visit-smoothie/start.sh`；默认 4190 | 独立昵称/资料账号原型，保留自己的数据库和会话 |
| `patient-dictation/` | 按模块 README 调用函数或 CLI | 可复用音频转文字模块，凭证由调用方配置 |

`npm test` 在根目录统一运行三个组件的既有检查。主应用的语音 HTTP 接口继续采用最新版的 GLM ASR 配置。

## 验证

运行环境：Node.js 24.14.0，npm 11.9.0。

| 检查 | 本次结果 |
| --- | --- |
| `npm test` | 患者应用 1500 项断言、账号模块 25 个测试、语音模块 19 个测试通过 |
| `npm run lint` | 通过，无错误或警告 |
| `npm run typecheck` | 通过 |
| `npm run build` | 生产构建通过 |
| `BASE=http://127.0.0.1:4307 npm run test:rules` | 本地无 Key 生产服务，63 项接口断言通过 |
| Playwright 手机与桌面检查 | 新手引导完成/刷新、pre → post、Clinical Plan 勾选/解释/追问/保存/刷新、report/set 导航通过；没有浏览器运行时异常，桌面没有横向溢出 |
| `git diff --check` | 通过 |

TypeScript 的输入范围收紧至主应用、脚本、Next.js 配置和语音类型声明；ESLint 排除独立 PhysicianBench 检出目录与旧实现快照。原先全目录扫描会将独立研究网站的别名按主应用解释，导致错误。

浏览器 Clinical Plan 检查将照片整理接口替换为虚构响应，解释接口则实际调用本地无 Key 规则；验证的是页面与待办持久化流程。接口测试和模块测试也使用虚构数据。真实供应商账号、实际语音准确率、照片识别质量及公网部署不属于本次验证。

## 2026-10-04 整合：手机版美化、绿色、logo 名、中英双语、登录页（integrate-into-main）

从当时的 `origin/main`（394a16f）开分支 `integrate-into-main`，合入主管会话在 `yiban-mobile` 上的本地提交：蓝改青瓷绿和 logo 配名字（65b870e）、界面中英双语和林叔英文版、欢迎登录页换回网页版的样子（f689927）、合入 Nancy 的 ad717c2（b078f94）。

冲突只有两个文件，一律以 main 的功能为准，只带过去样子和英文：

- `src/app/post/page.tsx`：保留 main 的 Clinical Plan 结果页，标题和说明加英文。
- `src/components/chat/BodyMap.tsx`：保留 main 的多选身体图（aria-pressed、可选几块、`prompt` 参数），提示、选中条和按钮加英文；存下和发出去的仍是中文部位名。

合并后补的英文：Clinical Plan 页（`src/components/post/ClinicalPlan.tsx`）的固定文字、对话里「描述改过了」卡片和身体图提示。发给 AI 的问题、存进待办的「问/答」仍是中文。AI 一侧（回答、追问、规则生成的文字）按 CLAUDE.md 仍是中文，英文界面注明「AI replies are in Chinese for now.」。

| 检查 | 本次结果 |
| --- | --- |
| `npm test` | 患者应用 1530 项断言、账号模块、语音模块 19 个测试全部通过 |
| `npm run lint`、`npx tsc --noEmit` | 通过 |
| 生产构建 | 通过（在临时副本里构建） |
| `BASE=http://127.0.0.1:4310 npm run test:rules` | 本地无 Key 生产服务，63 项通过 |
| 浏览器（390 像素手机宽度，中英文各一遍） | 欢迎、登录、注册（服务端账号、错密码、开发者开关下空表单）、林叔中英文、首页 to do、问 AI 展开收起、pre（身体图多选、next·post）、post、report、给医生看、set、我的资料、设置、应急；截图在 `docs/手机版截图/` 和 `docs/手机版截图-英文/` |

没验证到的：真实的照片整理和 Clinical Plan 实际结果（AI Key 现在被拒，照片整理走不通）；真实麦克风。

## 2026-10-04 改动：pre 的 next·post 挪到页面底部、引导文案「就诊计划」改「医嘱行动」（Nancy，直接推 main）

- `src/components/chat/ChatScreen.tsx`：删掉标题行右侧的 next·post 按钮；改为只在「给医生看的话」生成之后（对话里出现描述卡，或就诊事项已完成/已有摘要）在页面最底部（输入栏下方、底栏上方）出现的主色大按钮，文案沿用中英双语 `下一步：看病后 / next · post`。回主页入口不变（底栏中间 logo、左上角品牌标）。
- `src/components/GuideTour.tsx`：新手引导 post 一步的正文「就诊计划」改为「医嘱行动」（英文同步改为 action items）。

验证：`npm test`（三个组件全部通过）、`npm run lint`、`npx tsc --noEmit` 通过；生产构建用 `npx next build --webpack` 通过（本机沙箱拦住 Turbopack 构建时 PostCSS 子进程绑端口，与代码无关）。浏览器验证：新账号空对话时按钮不出现；林叔（问诊已完成）pre 页底部出现按钮并跳转 /post。


## 2026-10-04 改动：健康记录改名、post 关联 pre、保留未完成的页面、英文模式全英文、按学历讲解（Yueran，合进最新 main 后推 main）

- **名字**：底栏「记录 / report」改为「健康记录 / Health Record」，页面标题同步。中文界面里 App 名字叫「问诊奶昔」（logo、欢迎页标题、浏览器标签、提示），英文界面仍是 VisitSmoothie；原来中文里的「医伴」也统一成「问诊奶昔」。AGENTS.md 第 3 条按此修改。
- **中文界面不出现英文**：AI、post、PDF、cm、kg、mmol/L、AED、GLM、.env.local 等都换成中文（智能助手、看病后、厘米、公斤、毫摩尔/升、自动体外除颤器等）；单位按语言显示（`unitWord`，`MetricDef.symbol` 是交给模型的固定符号）。
- **pre**：去掉 next·post 按钮（包括 Nancy 刚挪到页面底部的那一版，按产品要求去掉）；标题旁加「开新的」，确认后放弃这一轮未完成的问诊（未保存的记录一起去掉，已保存的不动）。问诊进行到一半（还在问、选了部位还没说怎么不舒服、描述没保存、正在「改一下」）时离开再回来，页面原样保留，不再追加开场问题或每日追问。
- **post**：Clinical Plan 存进 store（`postDraft`），整理中、解释中离开再回来都还在，直到保存或点「放弃这次，开新的」。保存处新增「关联看病前的记录」下拉框，可选关联哪一次 pre 记录或不关联。
- **英文模式全英文**：请求按界面语言发给服务端（`client.ts` 的 `serverLang`）。英文时由模型自己按清单问诊（中文规则读不懂英文回答），口语确认成英文医学术语（Doctors call this "throbbing pain"）；描述、医嘱整理、解释、照片描述都是英文。固定文字（开场、身体图部位、快捷回答、收尾两问、草稿保存/放弃、分诊建议和科室、每日追问、待办时间、提醒、用药时间解析）都有英文。危险信号新增英文规则（`src/lib/ai/fallbackEn.ts`），没有 Key 时英文模式也能按清单问诊、生成英文描述。去掉了「AI replies are in Chinese for now.」。英文描述只保留记录里有的内容（`onlyStatedEn` 去掉编出来的「没有用药」「没有别的症状」）。
- **post 的解答按学历和年龄**：`explainStyle`：高中/中专及以下通俗、用生活里的比方；大专平实、关键名词解释一次；本科及以上用医学名词并讲机制；70 岁以上句子更短、结尾重复要点。中文解答里夹的英文单词会被去掉。

验证（Windows 本机）：

| 检查 | 本次结果 |
| --- | --- |
| `npm run test:unit`（逐个文件跑，脚本里的 bash 循环在 Windows 上跑不了） | 16 个文件 1541 项全部通过 |
| `npm run test:dictation` | 18 项通过，1 项跳过 |
| `npm run test:accounts` | 16 过 9 不过；干净的 origin/main（6f57a1c）在这台机器上也是同样 9 项不过，和本次改动无关 |
| `npm run lint`、`npx tsc --noEmit` | 通过 |
| `npm run build` | 通过 |

另外用智谱实测英文问诊（口语确认、术语记录）、英文描述、英文医嘱整理、中英文按学历的讲解。旧测试里写着「英文模式下生成的内容仍是中文」「AED」「单位不随语言变」的断言，按新要求改了。

没做到的：英文模式下「给医生看」页面里由规则生成的首屏摘要和时间线仍是中文；以前用中文记的内容切到英文后仍是中文（是数据，不翻译）；中文的安全过滤规则读不懂英文，英文回答靠提示词约束；浏览器里没有逐页点过。

## 2026-10-04 改动：「给医生看」加回患者自述、病史一条一条、英文页面全英文、Record / 健康报告（Yueran，推 main）

- `src/components/DoctorSheet.tsx`：首屏加「患者自述 / In the patient's words」（pre 里生成的那段第一人称描述），打印、导出 PDF、复制文字都带上；「既往：A、B、C…」改成「既往病史」一条一行（手术单独一行），补充以往病史也在里面、会打印进 PDF。
- `src/app/doctor/[id]/page.tsx`：现病史按句拆成要点列表。
- 英文模式下「给医生看」整页英文：没有模型时由 `summaryByRuleEn`（`src/lib/ai/fallbackEn.ts`）写首屏、时间线、当前状态、病史、以前类似、提示、问题；有模型时规则部分也用英文版。复制文字英文版（`summaryToText`）、以前类似记录的日期和结果（`toRelatedContext`）、「还想补充？」里医生会问的问题（`missingBasics`）、点选的每日回答（Much better 等）都是英文。对话里规则判断的「今天去看医生」和危险读数警报在英文模式下用英文说。
- 底栏和页面：英文 Record，中文「健康报告」；新手引导同步。
- 测试：`rules-en.test.ts` 里「英文页面和中文一样」的断言改成「英文页面是英文、中文版不变」。

验证（Windows 本机）：`npx tsc --noEmit`、`npm run lint` 通过；单元测试 16 个文件 1544 项全部通过；`npm run build` 通过；听写测试 18 项通过；用智谱实测生成英文「给医生看」，10 个字段都没有中文。