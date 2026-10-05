/* Shared by the per-feature test files in this folder. Each file imports `check`, and calls `finish` last. */
let pass = 0;
let fail = 0;

export function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + JSON.stringify(detail)}`);
}

export function finish(label: string): never {
  console.log(`\n${label}: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
