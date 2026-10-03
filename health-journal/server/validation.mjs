import { SEX_OPTIONS, EDUCATION_OPTIONS, todayLocal } from '../public/profile-model.js';

export class HttpError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const PROFILE_FIELDS = ['name', 'dob', 'sex', 'education', 'conditions', 'medications', 'allergies', 'surgeries', 'familyHistory', 'notes'];
export const VISIT_FIELDS = ['date', 'clinician', 'diagnosis', 'treatment', 'tests', 'followUp', 'notes'];
export const CATEGORIES = ['general', 'abdomen', 'head', 'chest', 'breathing', 'skin', 'muscle', 'other'];
export const FACT_LABELS = ['onset', 'location', 'duration', 'pattern', 'intensity', 'triggers', 'associated', 'medications', 'impact', 'other'];

export function object(value, label = 'Request') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, `${label} must be an object.`);
  return value;
}

export function fields(value, allowed, label = 'Request') {
  object(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new HttpError(400, `${label} contains an unsupported field.`);
  return value;
}

export function string(value, label, max = 6000, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new HttpError(400, `${label} must be text of at most ${max} characters.`);
  }
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${label} is required.`);
  return result;
}

export function choice(value, allowed, label) {
  if (!allowed.includes(value)) throw new HttpError(400, `${label} is invalid.`);
  return value;
}

export function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new HttpError(400, 'A valid revision is required.');
  return value;
}

export function severity(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10 || !Number.isInteger(value)) {
    throw new HttpError(400, 'Severity must be a whole number from 0 to 10, or unknown.');
  }
  return value;
}

export function date(value, label, { nullable = false, optional = false, dateOnly = false } = {}) {
  if (nullable && value === null) return null;
  if (optional && value === '') return '';
  const pattern = dateOnly ? /^\d{4}-\d{2}-\d{2}$/u : /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u;
  if (typeof value !== 'string' || !pattern.test(value) || !Number.isFinite(Date.parse(value))) throw new HttpError(400, `${label} must be a valid date.`);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > monthDays) throw new HttpError(400, `${label} must be a valid date.`);
  if (value.includes('T')) {
    const [hours, minutes, seconds = '0'] = value.slice(11).split(/[:Z+-]/u);
    if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) >= 60) throw new HttpError(400, `${label} must be a valid time.`);
  }
  return value;
}

export function profile(input, existing, { timeZone } = {}) {
  fields(input, PROFILE_FIELDS, 'Profile');
  const result = { ...existing };
  for (const [key, value] of Object.entries(input)) {
    result[key] = key === 'dob' ? date(value, 'Date of birth', { optional: true, dateOnly: true }) : string(value, key, key === 'name' ? 120 : 4000);
  }
  if (result.dob && result.dob > todayLocal(new Date(), timeZone)) throw new HttpError(400, 'Date of birth cannot be in the future.');
  for (const [key, options] of [['sex', SEX_OPTIONS], ['education', EDUCATION_OPTIONS]]) {
    if (key in input && input[key] !== existing[key]) choice(result[key], ['', ...options.map(([value]) => value)], key);
  }
  return result;
}

export function registration(input, existing, options = {}) {
  const result = profile(input, existing, options);
  string(result.name, 'Nickname', 120, true);
  date(result.dob, 'Date of birth', { dateOnly: true });
  choice(result.sex, SEX_OPTIONS.map(([value]) => value), 'Sex');
  choice(result.education, EDUCATION_OPTIONS.map(([value]) => value), 'Education');
  return result;
}

export function settings(input, existing) {
  fields(input, ['locale', 'email', 'timeZone', 'emailContent'], 'Settings');
  const result = { ...existing };
  if ('locale' in input) result.locale = choice(input.locale, ['en', 'zh'], 'Language');
  if ('email' in input) {
    result.email = string(input.email, 'Email', 254);
    if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result.email)) throw new HttpError(400, 'Enter a valid email address.');
  }
  if ('timeZone' in input) {
    result.timeZone = string(input.timeZone, 'Time zone', 100);
    if (result.timeZone) {
      try { new Intl.DateTimeFormat('en', { timeZone: result.timeZone }); }
      catch { throw new HttpError(400, 'Time zone is invalid.'); }
    }
  }
  if ('emailContent' in input) result.emailContent = choice(input.emailContent, ['undecided'], 'Email content');
  return result;
}

export function visit(input, existing = Object.fromEntries(VISIT_FIELDS.map(key => [key, '']))) {
  fields(input, VISIT_FIELDS, 'Visit');
  const result = { ...existing };
  for (const [key, value] of Object.entries(input)) result[key] = key === 'date' ? date(value, 'Visit date', { optional: true }) : string(value, key, 6000);
  if (!VISIT_FIELDS.some(key => result[key])) throw new HttpError(400, 'Add at least one visit detail.');
  return result;
}

export function episodeFor(state, id) {
  const episode = state.episodes.find(item => item.id === id);
  if (!episode) throw new HttpError(404, 'Episode not found.', 'NOT_FOUND');
  return episode;
}

export function assertRevision(state, expected) {
  if (state.revision !== revision(expected)) throw new HttpError(409, 'This journal changed. Reload the latest version and try again.', 'REVISION_CONFLICT');
}
