import { SEX_OPTIONS, EDUCATION_OPTIONS, todayLocal, calculateAge } from './profile-model.js';

export function identityFields(c, required = true) {
  const { state: { profile: p }, t, esc } = c;
  const age = calculateAge(p.dob);
  const optionList = (items, saved) => `<option value="">${t('Please select', '请选择')}</option>${saved && !items.some(([value]) => value === saved) ? `<option value="${esc(saved)}" selected>${esc(saved)}</option>` : ''}${items.map(([value, en, zh]) => `<option value="${value}" ${saved === value ? 'selected' : ''}>${t(en, zh)}</option>`).join('')}`;
  const req = required ? 'required' : '';
  return `<div class="field-grid identity-fields">
    <div class="field"><label for="p-name">${t('Nickname', '昵称')}${required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label><input id="p-name" name="name" value="${esc(p.name)}" maxlength="120" autocomplete="nickname" placeholder="${t('What should we call you?', '希望我们怎么称呼你？')}" ${req}></div>
    <div class="field"><label for="p-dob">${t('Date of birth', '出生日期')}${required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label><input id="p-dob" name="dob" type="date" value="${esc(p.dob)}" min="1900-01-01" max="${todayLocal()}" autocomplete="bday" aria-describedby="profile-age" ${req}><output id="profile-age" for="p-dob" aria-live="polite">${age === null ? t('Select year, month and day. Age is calculated automatically.', '选择出生年月日，自动计算年龄。') : t(`${age} years old · calculated automatically`, `${age} 岁 · 根据出生日期自动计算`)}</output></div>
    <div class="field"><label for="p-sex">${t('Sex', '性别')}${required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label><select id="p-sex" name="sex" ${req}>${optionList(SEX_OPTIONS, p.sex)}</select></div>
    <div class="field"><label for="p-education">${t('Education', '学历')}${required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label><select id="p-education" name="education" ${req}>${optionList(EDUCATION_OPTIONS, p.education)}</select></div>
  </div>`;
}

export function historyFields(c) {
  const { state: { profile: p }, t, esc } = c;
  return [
    ['conditions', 'Underlying conditions', '基础病', 'For example, a diagnosed condition and when it began.', '如已确诊的疾病，也可以补充确诊时间。'],
    ['familyHistory', 'Hereditary family conditions', '家族遗传病', 'Record any known hereditary conditions in your family; leave blank if none.', '如有已知的家族遗传病，可在这里记录；若无可不填。'],
    ['allergies', 'Allergy history', '过敏史', 'Medicines or foods you are allergic to, and any reactions.', '请记录药物或食物过敏情况，以及曾出现的反应。'],
  ].map(([key, en, zh, hintEn, hintZh]) => `<div class="field"><label for="p-${key}">${t(en, zh)} <span class="field-optional">${t('Optional', '选填')}</span></label><textarea id="p-${key}" name="${key}" maxlength="4000" rows="3" placeholder="${t(hintEn, hintZh)}">${esc(p[key])}</textarea></div>`).join('');
}

const brand = `<span class="smoothie-mark" aria-hidden="true">v<span>●</span></span><span>Visit Smoothie</span>`;
const arrow = `<svg class="journey-arrow" viewBox="0 0 170 92" fill="none" aria-hidden="true"><path d="M15 6C-3 70 70 87 144 45M126 44l24-4-6 23"/></svg>`;

export function onboardingView(c) {
  const { t, esc, icon, page, busy, error } = c;
  const registering = page === 'register';
  return `<div class="onboarding-shell"><header class="onboarding-header"><a class="smoothie-brand" href="#welcome" aria-label="Visit Smoothie">${brand}</a><span class="onboarding-header-note">${t('A little care, a clearer visit.', '让每一次就诊，更从容一点。')}</span><button type="button" class="onboarding-language" data-action="language" ${busy ? 'disabled' : ''}>${t('中文', 'English')}</button></header>
  <main id="main" class="onboarding-main ${registering ? 'is-register' : 'is-welcome'}" tabindex="-1">
    ${error ? `<div class="alert error" role="alert"><p>${esc(error)}</p><button data-action="dismiss-error" aria-label="${t('Dismiss', '关闭')}">${icon('close')}</button></div>` : ''}
    ${registering ? registrationView(c) : `<section class="welcome-panel"><div class="welcome-intro"><p class="welcome-eyebrow"><span></span>${t('YOUR HEALTH STORY STARTS HERE', '你的健康故事，从这里开始')}</p><h1>Visit<br><em>Smoothie</em><span class="welcome-period">.</span></h1><p class="welcome-description">${t('A few details about you.<br>A little less to remember at your next visit.', '从认识你开始，<br>为下一次就诊，少一点重复，多一点从容。')}</p><button type="button" class="smoothie-button" data-action="start-registration">${t('Start my journey', '开始我的健康旅程')}<span aria-hidden="true">↗</span></button><div class="welcome-handnote">${arrow}<span>${t('Make your journey<br>a little smoother.', '让健康旅程，<br>顺畅一点。')}</span></div></div><div class="welcome-margin" aria-hidden="true"><span>HELLO, YOU.</span><span>☺</span></div><div class="welcome-footnote">${icon('person')}<span>${t('Set up your profile once. Add more whenever you’re ready.', '首次使用，先建立一份属于你的健康档案。')}</span></div></section>`}
  </main><footer class="onboarding-footer"><span>Visit Smoothie</span><span>${t('Your profile is saved on this computer.', '档案保存在这台电脑上。')}</span></footer></div>`;
}

function registrationView(c) {
  const { t, icon, busy } = c;
  return `<button type="button" class="onboarding-back" data-action="registration-back" ${busy ? 'disabled' : ''}>${icon('back')}${t('Back', '返回')}</button><div class="registration-layout">
  <aside class="registration-guide"><p class="registration-eyebrow">PATIENT PROFILE</p><h1>${t('A little<br>about you.', '先认识<br>一下你。')}</h1><p class="guide-description">${t('A few details today will help keep your story together for the next visit.', '建立你的个人档案，<br>让每次就诊都有迹可循。')}</p><ol class="profile-guide-list"><li><span class="guide-dot"></span><div><strong>${t('Basic details', '基本信息')}</strong><p>${t('Nickname, birthday, sex and education.', '昵称、出生日期、性别与学历')}</p></div></li><li><span class="guide-dot optional-dot"></span><div><strong>${t('Health background', '健康背景')}<span class="skip-badge">${t('May skip', '可跳过')}</span></strong><p>${t('Conditions, family history and allergies can be added later.', '基础病、家族遗传病和过敏史，\n可以稍后在「健康档案」中补充。')}</p></div></li></ol><div class="guide-note">${icon('heart')}<p>${t('Take your time. Share only the health history you know.', '不必一次想起所有细节，\n知道多少，就先记多少。')}</p></div></aside>
  <section class="registration-card" aria-labelledby="profile-title"><header class="registration-card-header"><div><p class="registration-eyebrow">LET’S GET TO KNOW YOU</p><h2 id="profile-title">${t('Create your profile', '建立个人档案')}</h2></div><span class="profile-symbol">${icon('person')}</span></header>
  <form id="registration-form"><section class="registration-section" aria-labelledby="basic-heading"><div class="form-section-title"><h3 id="basic-heading">${t('Basic details', '基本信息')}</h3><span>${t('All four fields are required', '以下四项为必填')}</span></div>${identityFields(c)}</section>
  <section class="registration-section history-section" aria-labelledby="history-heading"><div class="form-section-title"><h3 id="history-heading">${t('Health background', '健康背景')}</h3><span>${t('Optional · add later', '选填 · 可稍后补充')}</span></div><div class="history-fields">${historyFields(c)}</div></section>
  <div class="registration-submit"><p>${t('Blank fields stay “not recorded”. You can edit your profile at any time.', '留空的内容将标记为「未记录」，之后随时可以补充。')}</p><button type="submit" class="smoothie-button" ${busy ? 'disabled' : ''}>${busy ? t('Saving your profile…', '正在保存档案…') : t('Save and start', '保存并开始')}${busy ? '<span class="spinner" aria-hidden="true"></span>' : '<span aria-hidden="true">→</span>'}</button></div></form></section></div>`;
}
