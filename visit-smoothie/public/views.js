import { SEX_OPTIONS, EDUCATION_OPTIONS, todayLocal, calculateAge } from './profile-model.js';

export const escape = value => String(value ?? '').replace(/[&<>"']/gu, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const blankProfile = () => ({ name: '', nickname: '', dob: '', sex: '', education: '', conditions: '', familyHistory: '', allergies: '' });
const person = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 1 10 8 15 7-5 12-11 8-15Z"/></svg>';
const brand = '<span class="smoothie-mark" aria-hidden="true">v<span>●</span></span><span>Visit Smoothie</span>';
const options = (items, saved) => '<option value="">请选择</option>' + items.map(([key, , label]) => `<option value="${key}" ${saved === key ? 'selected' : ''}>${label}</option>`).join('');

function identityFields(profile) {
  const p = profile;
  const age = calculateAge(p.dob);
  return `<div class="field-grid identity-fields">
    <div class="field"><label for="p-nickname">昵称 <span class="required-mark" aria-hidden="true">*</span></label><input id="p-nickname" name="nickname" maxlength="60" value="${escape(p.nickname)}" placeholder="希望我们如何称呼你" autocomplete="nickname" required aria-describedby="nickname-hint"><small id="nickname-hint">用于系统内展示，之后可以修改。</small></div>
    <div class="field"><label for="p-dob">年龄（出生日期） <span class="required-mark" aria-hidden="true">*</span></label><input id="p-dob" name="dob" type="date" value="${escape(p.dob)}" min="1900-01-01" max="${todayLocal()}" autocomplete="bday" required aria-describedby="profile-age"><output id="profile-age" for="p-dob" aria-live="polite">${age === null ? '选择出生年月日，自动计算年龄。' : `${age} 岁 · 根据出生日期自动计算`}</output></div>
    <div class="field"><label for="p-sex">性别 <span class="required-mark" aria-hidden="true">*</span></label><select id="p-sex" name="sex" required>${options(SEX_OPTIONS, p.sex)}</select></div>
    <div class="field"><label for="p-education">学历 <span class="required-mark" aria-hidden="true">*</span></label><select id="p-education" name="education" required>${options(EDUCATION_OPTIONS, p.education)}</select></div>
  </div>`;
}
function historyFields(profile) {
  return [
    ['conditions', '基础病', '如已确诊的疾病，也可以补充确诊时间。'],
    ['familyHistory', '家族遗传病', '如有已知的家族遗传病，可在这里记录；若无可不填。'],
    ['allergies', '过敏史', '请记录药物或食物过敏情况，以及曾出现的反应。'],
  ].map(([key, label, placeholder]) => `<div class="field"><label for="p-${key}">${label} <span class="field-optional">选填</span></label><textarea id="p-${key}" name="${key}" rows="3" maxlength="4000" placeholder="${placeholder}">${escape(profile[key])}</textarea></div>`).join('');
}
function accountFields(profile, editing) {
  return `<section class="registration-section history-section" aria-labelledby="account-heading"><div class="form-section-title"><h3 id="account-heading">登录账号</h3><span>姓名作为用户名</span></div><div class="field-grid">
    <div class="field account-username"><label for="p-name">姓名（登录用户名） <span class="required-mark" aria-hidden="true">*</span></label><input id="p-name" name="name" maxlength="120" value="${escape(profile.name)}" placeholder="请输入姓名" autocomplete="username" required ${editing ? 'readonly' : ''} aria-describedby="name-hint"><small id="name-hint">${editing ? '登录时请使用此姓名，修改昵称不影响登录。' : '登录时使用姓名和密码，请使用可区分的姓名。'}</small></div>
    ${editing ? '' : `
    <div class="field"><label for="password">密码</label><input type="password" id="password" name="password" autocomplete="new-password" minlength="15" maxlength="128" required aria-describedby="password-hint"><small id="password-hint">15–128 个字符，可以使用一句好记的话。</small></div>
    <div class="field"><label for="confirm-password">确认密码</label><input type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" minlength="15" maxlength="128" required></div>
    `}
  </div></section>`;
}
function welcome() {
  return `<section class="welcome-panel"><div class="welcome-intro"><p class="welcome-eyebrow"><span></span>你的健康故事，从这里开始</p><h1>Visit<br><em>Smoothie</em><span class="welcome-period">.</span></h1><p class="welcome-description">从认识你开始，<br>为下一次就诊，少一点重复，多一点从容。</p><button class="smoothie-button" data-action="register">开始我的健康旅程<span aria-hidden="true">↗</span></button><p class="welcome-login">已有账号？<button class="text-button" data-action="login">登录</button></p><div class="welcome-handnote"><svg class="journey-arrow" viewBox="0 0 170 92" fill="none" aria-hidden="true"><path d="M15 6C-3 70 70 87 144 45M126 44l24-4-6 23"/></svg><span>让健康旅程，<br>顺畅一点。</span></div></div><div class="welcome-margin" aria-hidden="true"><span>HELLO, YOU.</span><span>☺</span></div><div class="welcome-footnote">${person}<span>首次使用，先建立一份属于你的个人档案。</span></div></section>`;
}
function profileForm(state) {
  const editing = Boolean(state.account);
  return `${editing ? '' : '<button class="onboarding-back" data-action="welcome">← 返回</button>'}<div class="registration-layout">
    <aside class="registration-guide"><p class="registration-eyebrow">PATIENT PROFILE</p><h1>${editing ? '你的<br>个人档案。' : '先认识<br>一下你。'}</h1><p class="guide-description">${editing ? '需要补充时，随时回来。<br>保存后，下次登录仍会保留。' : '建立你的个人档案，<br>让每次就诊都有迹可循。'}</p><ol class="profile-guide-list"><li><span class="guide-dot"></span><div><strong>基本信息</strong><p>昵称、出生日期、性别与学历</p></div></li><li><span class="guide-dot optional-dot"></span><div><strong>健康背景<span class="skip-badge">可跳过</span></strong><p>基础病、家族遗传病和过敏史，\n可以稍后在个人档案中补充。</p></div></li></ol><div class="guide-note">${heart}<p>不必一次想起所有细节，\n知道多少，就先记多少。</p></div>${editing ? '' : '<p class="guide-description">已有账号？<button class="text-button" data-action="login">直接登录</button></p>'}</aside>
    <section class="registration-card" aria-labelledby="profile-title"><header class="registration-card-header"><div><p class="registration-eyebrow">${editing ? 'YOUR PERSONAL PROFILE' : 'LET’S GET TO KNOW YOU'}</p><h2 id="profile-title">${editing ? '个人资料' : '建立个人档案'}</h2></div><span class="profile-symbol">${person}</span></header>
    <form id="${editing ? 'profile-form' : 'register-form'}"><section class="registration-section" aria-labelledby="basic-heading"><div class="form-section-title"><h3 id="basic-heading">基本信息</h3><span>以下四项为必填</span></div>${identityFields(state.profile)}</section>
    ${accountFields(state.profile, editing)}
    <section class="registration-section history-section" aria-labelledby="history-heading"><div class="form-section-title"><h3 id="history-heading">健康背景</h3><span>选填 · 可稍后补充</span></div><div class="history-fields">${historyFields(state.profile)}</div></section>
    <div class="registration-submit"><p>留空的内容将标记为「未记录」，之后随时可以补充。</p><button type="submit" class="smoothie-button">${state.busy ? '正在保存…' : editing ? '保存资料' : '注册并保存'}<span aria-hidden="true">→</span></button></div></form></section></div>`;
}
function login(state) {
  return `<button class="onboarding-back" data-action="welcome">← 返回</button><div class="login-layout"><section class="registration-card login-card" aria-labelledby="login-heading"><header class="registration-card-header"><div><p class="registration-eyebrow">WELCOME BACK</p><h1 id="login-heading">欢迎回来。</h1><p class="guide-description">使用姓名和密码，打开你的个人档案。</p></div></header><form id="login-form"><div class="field"><label for="login-name">姓名（用户名）</label><input id="login-name" name="name" autocomplete="username" maxlength="120" placeholder="请输入注册时的姓名" required></div><div class="field"><label for="login-password">密码</label><input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="128" required></div><button class="smoothie-button" type="submit">${state.busy ? '正在登录…' : '登录'}<span aria-hidden="true">→</span></button></form><p class="login-register">还没有账号？<button class="text-button" data-action="register">建立个人档案</button></p></section></div>`;
}
export function view(state) {
  return `<div class="onboarding-shell"><header class="onboarding-header"><button class="smoothie-brand" data-action="${state.account ? 'profile' : 'welcome'}" aria-label="Visit Smoothie">${brand}</button><span class="onboarding-header-note">让每一次就诊，更从容一点。</span>${state.account ? `<div class="account-actions"><span class="account-name">${escape(state.profile.nickname || state.account.name)}</span><button class="onboarding-language" data-action="logout">退出登录</button></div>` : '<button class="onboarding-language" data-action="login">登录</button>'}</header><main id="main" class="onboarding-main ${state.page === 'welcome' ? 'is-welcome' : 'is-register'}" tabindex="-1">${state.error ? `<div class="alert" role="alert">${escape(state.error)}</div>` : ''}${state.checking ? '<p class="session-loading" role="status">正在确认登录状态…</p>' : state.page === 'welcome' ? welcome() : state.page === 'login' ? login(state) : profileForm(state)}</main><footer class="onboarding-footer"><span>Visit Smoothie</span><span>资料保存在此服务中，仅当前账号可访问。</span></footer></div>`;
}
