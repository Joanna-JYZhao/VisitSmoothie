import { SEX_OPTIONS, EDUCATION_OPTIONS, todayLocal, calculateAge } from '../public/profile-model.js';

export class HttpError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}
export function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new HttpError(400, '请求内容不正确。');
}
export function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || (required && !value.trim())) throw new HttpError(400, '请检查输入的资料。');
  return value.trim();
}
export function username(value) {
  const name = text(value, 120, true).normalize('NFKC').replace(/\s+/gu, ' ');
  if (name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new HttpError(400, '请输入有效姓名。', 'INVALID_NAME');
  return { name, key: name.toLowerCase() };
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128 || !value.trim() || /\u0000/u.test(value)) throw new HttpError(400, '密码需要 15–128 个字符。', 'INVALID_PASSWORD');
  return value;
}
export function timezone(value) {
  if (typeof value !== 'string' || value.length > 100) throw new HttpError(400, '时区不正确。');
  try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { throw new HttpError(400, '时区不正确。'); }
  return value;
}
export function profile(input, { timeZone = 'UTC', now = new Date() } = {}) {
  fields(input, ['name', 'nickname', 'dob', 'sex', 'education', 'conditions', 'familyHistory', 'allergies']);
  const name = username(input.name).name;
  const nickname = text(input.nickname, 60, true);
  const dob = input.dob;
  // Use the supplied device timezone only for its calendar date, never for age storage.
  const today = todayLocal(now, timeZone);
  if (calculateAge(dob, new Date(`${today}T12:00:00`)) === null) throw new HttpError(400, '请选择完整、有效且不晚于今天的出生日期。', 'INVALID_BIRTHDAY');
  if (!SEX_OPTIONS.some(([key]) => key === input.sex) || !EDUCATION_OPTIONS.some(([key]) => key === input.education)) throw new HttpError(400, '请选择性别和学历。');
  return { name, nickname, dob, sex: input.sex, education: input.education, ...Object.fromEntries(['conditions', 'familyHistory', 'allergies'].map(key => [key, text(input[key] === undefined ? '' : input[key], 4000)])) };
}
