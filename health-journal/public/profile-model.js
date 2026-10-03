export const SEX_OPTIONS = [['male', 'Male', '男'], ['female', 'Female', '女']];
export const EDUCATION_OPTIONS = [
  ['primary', 'Primary school', '小学'],
  ['junior', 'Middle school', '初中'],
  ['senior', 'High school / vocational school', '高中/中专'],
  ['associate', 'Associate degree', '大专'],
  ['university', 'Bachelor’s degree or above', '本科及以上'],
];

export function todayLocal(date = new Date(), timeZone) {
  if (timeZone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calculateAge(dob, date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dob || '')) return null;
  const [year, month, day] = dob.split('-').map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate() || dob > todayLocal(date)) return null;
  return date.getFullYear() - year - (todayLocal(date).slice(5) < dob.slice(5) ? 1 : 0);
}

export function needsOnboarding(state, dataset = 'real') {
  if (dataset === 'demo' || state.onboarding?.completedAt) return false;
  if (state.onboarding) return true;
  // Populated journals from before registration remain accessible.
  return !state.episodes.length && !Object.values(state.profile).some(value => typeof value === 'string' && value.trim());
}
