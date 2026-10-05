# VisitSmoothie（医伴）项目整理

这个分支是整个项目的归档，只用来保存和查阅，不参与开发。正式开发请用 `main` 分支。

## 目录

| 文件夹 | 内容 |
|---|---|
| `最终版/VisitSmoothie-最终版-main-3e417ab/` | 最终版代码，和 `main` 分支的提交 3e417ab 完全一致 |
| `最终版/说明文档/` | 给 AI 的项目说明、Workflow 简化版流程图 |
| `以往/01-第一二版-简化版和原始项目-10月2日至3日上午/` | 第一、二版网站，以及当时的协作文件和素材 |
| `以往/02-宽屏版-美化第二轮-10月3日晚/` | 宽屏 VisitSmoothie 布局，美化第二轮 |
| `以往/03-青瓷绿界面-队友版-10月3日晚/` | 队友做的青瓷绿界面 |
| `以往/04-手机版加首页美化-未推送草稿-10月4日/` | 手机版结构，加上没推到 main 的首页美化草稿 |
| `以往/05-队友最新main-最终版之前-10月4日/` | 最终版之前，队友推到 main 的版本 |
| `以往/其他/` | 项目介绍 PDF 和早期截图 |

## 运行前必须填入 API Key

为了安全，这里所有的 API Key 都已经去掉。想运行任何一个版本，先进入它的文件夹，再按下面做：

1. 复制示例配置：`cp .env.example .env.local`
2. 打开 `.env.local`，填入你自己的 Key：
   - 用智谱 GLM：填 `GLM_API_KEY=你的智谱Key`，并设置 `GLM_MODEL=glm-5`。
   - 用 Claude：填 `AI_PROVIDER=claude` 和 `ANTHROPIC_API_KEY=你的Anthropic Key`。
   - 语音转文字走智谱，想用的话 `GLM_API_KEY` 也要填。
   - `DATA_ENCRYPTION_KEY` 留空即可，第一次运行时会自动生成。
3. 安装依赖并启动：`npm install && npm run dev`，然后打开 http://localhost:3000 。

不填 Key 也能打开网站，但对话、整理会退回内置规则，拍照识别用不了。

**`.env.local` 永远不要提交到 GitHub。**本分支的 `.gitignore` 已经排除了它。

## 说明

- 每个版本文件夹里都没有带 `node_modules`、`.next`、`.data` 和 `.git`，运行前需要 `npm install`。
- 所有病人数据都是虚构的。
