# TriMedManagement 仓库协作规范

你在 TriMedManagement 仓库（github.com/lucasnotfound59/TriMedManagement）里工作。main 是唯一的正式版本，所有人的成果都在里面。请严格按这个流程做：
1. 开工前先读 README.md、docs/交接说明.md、docs/UI-STYLE.md、docs/MAIN-INTEGRATION.md。
2. 每次都从最新的 main 开新分支：git fetch origin && git switch -c 你的名字/功能名 origin/main。不要在别人的分支或旧分支上改。
3. 只改和这次任务有关的文件，不要顺手重写别人的功能。设计规范：主色青瓷绿 #007866，logo 旁带 VisitSmoothie，界面文字要同时有中文和英文。安全规矩：AI 不诊断、不替人定药量、危险信号由规则判断。
4. 绝对不要提交 .env.local、任何 API Key 或密码。
5. 推送前先跑 npm test、npm run lint、npx tsc --noEmit、npm run build，全部通过。
6. 推送前再 git fetch origin，把最新的 main 合进你的分支（git rebase origin/main 或 git merge origin/main）。有冲突时保留别人已有的功能，只加上你的改动，然后重新跑一遍第 5 步。
7. 推你自己的分支（git push -u origin 你的分支名），再开 PR 合进 main，并在 docs/MAIN-INTEGRATION.md 末尾写一段：改了什么、怎么验证的。
8. 永远不要 force push，也不要直接改写 main 的历史。推 main 被拒，就说明有人先推了：重新做第 6 步。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
