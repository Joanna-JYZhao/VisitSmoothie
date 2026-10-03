// Deliberately fictional records, not a medical recommendation or a real patient record.
export const demoRecords = {
  zh: `门诊记录 · 虚构演示病例\n患者：林女士\n日期：2026年10月2日\n\n本次计划\n1. 示例药片 A（虚构）：每次1片，每日2次，早餐后和晚餐后服用，连续5天。\n2. 示例药片 B（虚构）：每次1片，每日1次，睡前服用，连续3天。\n3. 检查：10月5日上午进行预约检查。检查前准备以预约单的书面要求为准；本记录未列出具体准备要求。\n4. 复诊：10月9日门诊复诊，携带药物包装与这份记录。\n\n医生书面说明\n记录症状出现的时间及用药后的变化，复诊时一起讨论。请按本记录执行，不要自行更改剂量；如出现新的不适，请联系开方医生。\n\n备注：本演示记录未包含选择此治疗方案的具体理由，也未包含漏服后的处理方法。`,
  en: `Outpatient record · Fictional demonstration\nPatient: Ms Lin\nDate: October 2, 2026\n\nVisit plan\n1. Sample tablet A (fictional): 1 tablet, twice daily, after breakfast and dinner, for 5 days.\n2. Sample tablet B (fictional): 1 tablet, once daily, at bedtime, for 3 days.\n3. Test: attend the scheduled test on the morning of October 5. Follow the written preparation requirements on the appointment slip; this record does not specify them.\n4. Follow-up: return to the outpatient clinic on October 9 with the medicine packaging and this record.\n\nWritten instructions\nRecord when symptoms occur and any changes after taking the medicine; discuss these at follow-up. Follow this plan without changing the dose yourself. Contact the prescribing clinician about any new symptoms.\n\nNote: this demonstration record does not state the specific rationale for the treatment choice or what to do after a missed dose.`
};

export function demoPlan(lang='zh') {
  const en=lang==='en';
  const rows=en ? [
    ['medication','Sample tablet A','1 tablet','twice daily','for 5 days','after breakfast and dinner','Sample tablet A (fictional): 1 tablet, twice daily, after breakfast and dinner, for 5 days.','The written plan specifies one tablet each time, after breakfast and dinner. The course in this record is five days.'],
    ['medication','Sample tablet B','1 tablet','once daily','for 3 days','at bedtime','Sample tablet B (fictional): 1 tablet, once daily, at bedtime, for 3 days.','This tablet has a different schedule: one tablet at bedtime, for three days.'],
    ['test','Scheduled test','','','','October 5','Test: attend the scheduled test on the morning of October 5. Follow the written preparation requirements on the appointment slip; this record does not specify them.','The test date is recorded. The preparation requirements must come from the appointment slip.'],
    ['followup','Return to the clinic','','','','October 9','Follow-up: return to the outpatient clinic on October 9 with the medicine packaging and this record.','Bring the medicine packaging and this visit record.']
  ] : [
    ['medication','示例药片 A','每次1片','每日2次','连续5天','早餐后和晚餐后','示例药片 A（虚构）：每次1片，每日2次，早餐后和晚餐后服用，连续5天。','这份医嘱写的是每次一片，分别在早餐后与晚餐后服用，连续五天。两次的安排与另一种药不同。'],
    ['medication','示例药片 B','每次1片','每日1次','连续3天','睡前','示例药片 B（虚构）：每次1片，每日1次，睡前服用，连续3天。','这份医嘱写的是每天睡前一片，连续三天。它的频率和疗程与药片 A 不同。'],
    ['test','预约检查','','','','10月5日上午','检查：10月5日上午进行预约检查。检查前准备以预约单的书面要求为准；本记录未列出具体准备要求。','检查时间已有记录，具体准备要求需要查看预约单，当前资料不能补出这一答案。'],
    ['followup','门诊复诊','','','','10月9日','复诊：10月9日门诊复诊，携带药物包装与这份记录。','复诊时携带药物包装和本次记录，便于一起回顾执行情况与期间出现的问题。']
  ];
  return {title:en?'Your plan for the next few days':'接下来几天的安排', summary:en?'Two medicines, one test, and one follow-up.':'两种药物、一次检查、一次复诊。',
    items:rows.map((r,i)=>({id:`demo-item-${i+1}`,kind:r[0],title:r[1],dose:r[2],frequency:r[3],duration:r[4],timing:r[5],sourceQuote:r[6],details:r[6],explanation:r[7],sourceId:'demo-doc',missing:i===2?[en?'Test preparation':'检查准备要求']:[]})),
    warnings:[en?'Contact the prescribing clinician about any new symptoms.':'如出现新的不适，请联系开方医生。'],
    complexity:{level:'medium',reasons:en?['Two different medication schedules','Preparation information is missing']:['两种药物的频率和疗程不同','检查准备要求尚未提供']},version:1,reviewed:true,demo:true};
}

export const starterStory={zh:'最近吃完饭，肚子总是不太舒服，但又说不清是什么感觉。',en:'My stomach has felt uncomfortable after meals lately, but I find it hard to describe the feeling.'};
export const suggestedQuestions={
 zh:['这些药该怎么吃？','为什么医生给我开这个药？','漏服了一次怎么办？','感觉好多了，可以提前停药吗？'],
 en:['How do I take these medicines?','Why did my doctor choose this medicine?','What should I do if I miss a dose?','I feel better. Can I stop early?']
};
