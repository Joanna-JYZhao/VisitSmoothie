/*
 * 注册和登录（本机浏览器里的账号）的纯逻辑。
 * Run with: npx tsx scripts/tests/accounts.test.ts
 */
import { check, finish } from "./_check";
import { checkLogin, createAccount, nameKey, passwordProblem, type Account } from "../../src/lib/accounts";

const GOOD = "test-only passphrase 01";

async function main() {
  // names: case, full-width characters and spaces do not make a different name
  check("姓名规范化：大小写", nameKey("Lin") === nameKey("lin"));
  check("姓名规范化：全角", nameKey("ＬＩＮ") === nameKey("lin"));
  check("姓名规范化：多余空格", nameKey("  小  张 ") === nameKey("小 张"));

  // passwords, as in the teammate's version
  check("密码为空", passwordProblem("", "") === "还差：密码。");
  check("密码太短", /至少 15/.test(passwordProblem("short", "short") ?? ""));
  check("密码太长", /最多 128/.test(passwordProblem("x".repeat(129), "x".repeat(129)) ?? ""));
  check("两次不一样", /不一样/.test(passwordProblem(GOOD, GOOD + "x") ?? ""));
  check("15 个汉字也算 15 个字", passwordProblem("一二三四五六七八九十一二三四五", "一二三四五六七八九十一二三四五") === null);
  check("好密码", passwordProblem(GOOD, GOOD) === null);

  // registration
  const list: Account[] = [];
  const a = await createAccount(list, " 测试甲 ", GOOD, GOOD);
  check("注册成功", "account" in a);
  if (!("account" in a)) return finish("accounts");
  const acc = a.account;
  check("姓名去掉首尾空格", acc.name === "测试甲");
  check("不存明文密码", !JSON.stringify(acc).includes(GOOD));
  check("有盐和哈希", acc.salt.length === 32 && acc.hash.length === 64);
  list.push(acc);
  const dup = await createAccount(list, "测试甲", GOOD, GOOD);
  check("重名不能注册", "error" in dup && /已经注册过/.test(dup.error));
  const b = await createAccount(list, "测试乙", GOOD, GOOD);
  check("同一个密码，盐不同哈希也不同", "account" in b && b.account.hash !== acc.hash);
  check("没写姓名", "error" in (await createAccount(list, "  ", GOOD, GOOD)));
  check("密码不合格不注册", "error" in (await createAccount(list, "测试丙", "short", "short")));

  // login
  check("姓名和密码对", (await checkLogin(list, "测试甲", GOOD))?.id === acc.id);
  check("姓名写法不同也能登", (await checkLogin(list, " 测试甲  ", GOOD))?.id === acc.id);
  check("密码不对", (await checkLogin(list, "测试甲", GOOD + "x")) === null);
  check("没有这个人", (await checkLogin(list, "测试丁", GOOD)) === null);
  const demo: Account = { id: "demo-liming", name: "李明", key: "demo:liming", salt: "", hash: "", demo: true, createdAt: "" };
  check("演示账号不能用密码登录", (await checkLogin([demo], "demo:liming", "")) === null);

  finish("accounts");
}

void main();
