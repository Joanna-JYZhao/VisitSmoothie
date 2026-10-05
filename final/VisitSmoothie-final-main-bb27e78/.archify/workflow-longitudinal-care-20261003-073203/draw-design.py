from pathlib import Path
from html import escape
import json, hashlib, math
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parent
FONT = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
pdfmetrics.registerFont(TTFont('Care', FONT))
BG='#F6F3EB'; INK='#203E39'; MUTED='#68766E'; GREEN='#237467'; PALE='#E4EEE6'
LINE='#CBD6CD'; WHITE='#FFFDF8'; TERRA='#A7583F'; PEACH='#F5E5D9'; BLUE='#E8EDF0'

class Drawing:
    def __init__(self, name, h):
        self.name=name; self.w=1500; self.h=h
        self.pdf=canvas.Canvas(str(ROOT / (name+'.pdf')), pagesize=(self.w,h))
        self.pdf.setTitle('诊后持续观察与医生决策支持 — 设计提案')
        self.svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="{h}" viewBox="0 0 1500 {h}" role="img" aria-label="诊后持续观察与医生决策支持设计图">']
        self.rect(0,0,1500,h,BG,r=0)
    def rect(self,x,y,w,h,fill=WHITE,stroke=None,r=20):
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke or "none"}"/>')
        self.pdf.setFillColor(HexColor(fill)); self.pdf.setStrokeColor(HexColor(stroke or fill))
        self.pdf.setLineWidth(1)
        self.pdf.roundRect(x,self.h-y-h,w,h,r,stroke=bool(stroke),fill=1)
    def line(self, pts, color=GREEN, width=2, arrow=False, dash=False):
        pstr=' '.join(f'{x},{y}' for x,y in pts)
        self.svg.append(f'<polyline points="{pstr}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"'+ (' stroke-dasharray="5 6"' if dash else '') + '/>')
        self.pdf.setStrokeColor(HexColor(color)); self.pdf.setLineWidth(width)
        self.pdf.setDash(5,6) if dash else self.pdf.setDash()
        p=self.pdf.beginPath(); p.moveTo(pts[0][0],self.h-pts[0][1])
        for x,y in pts[1:]:p.lineTo(x,self.h-y)
        self.pdf.drawPath(p)
        self.pdf.setDash()
        if arrow:
            x,y=pts[-1]; x0,y0=pts[-2]; a=math.atan2(y-y0,x-x0)
            u=(x-10*math.cos(a)+5*math.sin(a), y-10*math.sin(a)-5*math.cos(a))
            v=(x-10*math.cos(a)-5*math.sin(a), y-10*math.sin(a)+5*math.cos(a))
            self.svg.append(f'<polygon points="{x},{y} {u[0]},{u[1]} {v[0]},{v[1]}" fill="{color}"/>')
            self.pdf.setFillColor(HexColor(color)); p=self.pdf.beginPath();p.moveTo(x,self.h-y);p.lineTo(u[0],self.h-u[1]);p.lineTo(v[0],self.h-v[1]);p.close();self.pdf.drawPath(p,stroke=0,fill=1)
    def dot(self,x,y,r,color):
        self.svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>')
        self.pdf.setFillColor(HexColor(color));self.pdf.circle(x,self.h-y,r,stroke=0,fill=1)
    def txt(self,x,y,text,size=22,color=INK,align='left'):
        anchor={'left':'start','center':'middle','right':'end'}[align]
        self.svg.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="Arial Unicode MS, PingFang SC, sans-serif" font-size="{size}" fill="{color}">{escape(text)}</text>')
        self.pdf.setFont('Care',size);self.pdf.setFillColor(HexColor(color))
        if align=='center': self.pdf.drawCentredString(x,self.h-y,text)
        elif align=='right':self.pdf.drawRightString(x,self.h-y,text)
        else:self.pdf.drawString(x,self.h-y,text)
    def lines(self,x,y,rows,size=21,color=MUTED,leading=33,maxw=None):
        for i,row in enumerate(rows):
            if maxw:
                assert pdfmetrics.stringWidth(row,'Care',size)<=maxw, (self.name,row,maxw)
            self.txt(x,y+i*leading,row,size,color)
    def card(self,x,y,w,h,kicker,title,rows,fill=WHITE):
        self.rect(x,y,w,h,fill,LINE)
        self.txt(x+24,y+34,kicker,17,GREEN)
        self.txt(x+24,y+76,title,27)
        self.lines(x+24,y+115,rows,21,leading=31,maxw=w-48)
    def heading(self,number,title,sub):
        self.dot(66,55,10,GREEN); self.dot(88,55,7,TERRA)
        self.txt(110,61,'CARE CONTEXT  /  '+number,17,GREEN)
        self.rect(1185,34,259,38,PALE,r=19)
        self.txt(1314,60,'设计提案 · 尚未接入网站',17,GREEN,'center')
        self.txt(56,125,title,42)
        self.txt(56,168,sub,23,MUTED)
    def save(self):
        self.svg.append('</svg>'); (ROOT/(self.name+'.svg')).write_text('\n'.join(self.svg))
        self.pdf.save()

d=Drawing('01-care-workflow',1500)
d.heading('01','让医生看见两次就诊之间发生了什么','患者只需记录和回答；系统整理背景、补齐遗漏，帮助医生更快决定下一步检查。')
d.rect(56,207,900,90,PALE)
d.txt(82,242,'核心 01   医生检查决策支持',27,GREEN)
d.txt(82,276,'用可核实的个人背景与近期变化，支持医生判断。',21)
d.rect(984,207,460,90,WHITE)
d.txt(1008,242,'辅助 02   日志与趋势',26)
d.txt(1008,276,'从同一份记录自动生成。',21,MUTED)
d.card(56,348,420,179,'①  就诊后','医生真实结论',['报告、医嘱、已做检查及结果','保留确诊 / 疑似 / 排除状态'])
d.card(540,348,420,179,'患者对照原文核对','个人背景 · 持续更新',['病史、用药、过敏、日常基线','每项信息保留来源、日期与版本'])
d.card(1024,348,420,179,'②  平时任何时刻','随手记录今天的状况',['用自己的话写一句，也可以多记','新记录、报告更新可触发补问'])
d.line([(476,436),(537,436)],arrow=True)
d.line([(750,527),(750,567)],arrow=True)
d.line([(1234,527),(1234,567)],arrow=True)

d.rect(56,570,1388,392,WHITE,LINE,r=25)
d.txt(82,615,'③  受控总控 Agent',30)
d.txt(1420,615,'模型选下一步 · 代码限制动作 · 失败可恢复',20,MUTED,'right')
xs=[80,423,766,1109]
agent_cards=[
 ('A','保存原文并解析',['症状、时间、程度与诱因','先分清“有 / 没有 / 未知”','区分本人、当前与过去']),
 ('B','检查当前风险',['用经审定规则识别风险','有歧义先做简短核实','有紧急线索 → 及时求助']),
 ('C','找最有价值的缺口',['结合具体诊断与新变化','检索经临床审定的知识','始终保留开放式补充']),
 ('D','问一句，或结束',['有必要 → 每次只问一题','回答后重新解析与检查','信息足够 / 用户结束 → 保存'])
]
for x,(key,title,rows) in zip(xs,agent_cards):
    d.rect(x,650,311,174,PALE if key=='C' else BG,r=15)
    d.txt(x+18,680,key,17,GREEN)
    d.txt(x+18,714,title,24)
    d.lines(x+18,750,rows,18,leading=27,maxw=279)
for x in xs[:-1]:d.line([(x+311,732),(x+340,732)],arrow=True)
d.txt(750,847,'常规路径 →',15,MUTED,'center')
d.line([(1264,824),(1264,868),(235,868),(235,824)],arrow=True,color=MUTED,dash=True)
d.rect(484,852,535,32,WHITE,r=12)
d.txt(750,875,'回答循环：常规每轮最多 3 题；允许不确定或跳过',18,MUTED,'center')
d.txt(83,924,'风险命中时中断普通问答；诊断未知时先澄清，不自行推断疾病。',20,TERRA)
d.line([(750,963),(750,1004)],arrow=True)
d.rect(56,1007,1388,89,INK,r=20)
d.txt(84,1044,'④  持续更新的证据时间线',29,'#FFFDF8')
d.txt(84,1078,'原话与结构化事实一起保存；症状、用药、报告按时间关联。',21,'#D7E8DC')
d.txt(1419,1044,'可追溯',17,'#D7E8DC','right')
d.txt(1419,1078,'来源 · 时间 · 状态 · 规则版本',19,'#D7E8DC','right')
d.line([(750,1096),(750,1126),(488,1126),(488,1153)],arrow=True)
d.line([(750,1126),(1200,1126),(1200,1153)],arrow=True)
d.rect(56,1157,865,207,PALE,r=22)
d.txt(83,1201,'给医生：一页就诊材料',30,GREEN)
d.lines(83,1243,[
 '近期变化、关键阳性 / 阴性表现、相关病史与用药',
 '已有检查与日期；经审定路径匹配出的检查讨论项',
 '说明依据和缺失信息 → 患者核对分享 → 医生决定检查'
],23,INK,leading=38,maxw=810)
d.rect(956,1157,488,207,WHITE,LINE,r=22)
d.txt(982,1201,'给患者：日志与趋势',29)
d.lines(982,1243,['按天回看发生了什么','同一症状怎样变化；哪些天未记录','就诊、用药只作时间标记'],22,MUTED,leading=38,maxw=435)
d.rect(56,1400,1388,54,PEACH,r=15)
d.txt(750,1436,'↻  医生确定检查与后续方案 → 新报告 / 检查结果回到 ①，更新个人背景',23,TERRA,'center')
d.txt(56,1481,'临床内容与规则需审定后接入。医生保留诊断、检查与治疗决策。',16,MUTED)
d.save()

a=Drawing('02-care-algorithms',1580)
a.heading('02','把“多问一句”变成有依据的算法','追问补信息，趋势呈现变化，医生材料提供可查证的决策背景。')
a.rect(56,207,1388,349,WHITE,LINE,r=24)
a.txt(82,252,'A   动态追问：先筛选，再排序，最后只问一个',30)
ax=[80,552,1024]
a.card(ax[0],281,396,214,'筛选：哪些问题有资格出现','条件必须成立',['知识来源 / 规则版本已审定','适用于具体诊断或新症状','信息仍缺失、过时或矛盾'],BG)
a.card(ax[1],281,396,214,'排序：按优先级逐层比较','先重要，再减少打扰',['临床优先级 → 信息缺口','→ 新变化 → 与当前背景相关','→ 更少重复、更低回答负担'],PALE)
a.card(ax[2],281,396,214,'输出：每次一题','问完更新证据',['普通一轮最多 3 题，可跳过','保留“还有什么变化？”入口','没有有用缺口，就停止追问'],BG)
a.line([(476,385),(549,385)],arrow=True)
a.line([(948,385),(1021,385)],arrow=True)
a.txt(82,535,'问题被问过 ≠ 症状存在；没有提到 ≠ 没有症状。患者的原话始终可查。',21,TERRA)

a.rect(56,591,1388,285,PEACH,r=24)
a.txt(82,636,'例子   为什么会问到牙齿或下颌不适？',29,TERRA)
a.rect(80,666,347,137,WHITE,r=16)
a.txt(101,702,'已有心绞痛诊断的示例',23)
a.lines(101,738,['从经审定的相关症状表中','发现“牙齿 / 下颌不适”尚未知'],19,leading=29,maxw=306)
a.line([(427,735),(472,735)],arrow=True,color=TERRA)
a.rect(475,666,535,137,WHITE,r=16)
a.txt(500,703,'“最近有没有牙齿或下颌不适？”',25)
a.lines(500,742,['如回答“有”，再补问发生时间、与活动的关系；','如回答“没有”，记录为否定，不触发阳性警报。'],19,leading=29,maxw=485)
a.line([(1010,735),(1057,735)],arrow=True,color=TERRA)
a.rect(1060,666,360,137,WHITE,r=16)
a.txt(1083,703,'给医生的是可核实的线索',23)
a.lines(1083,742,['有 / 无 / 未知 + 时间与情境','不从牙痛直接推断心脏疾病'],19,leading=29,maxw=315)
a.txt(82,850,'示例依据：[1] AHA 胸痛指南；[2] NHS 心梗后康复材料。具体问题与风险规则需临床审定。',18,TERRA)

a.rect(56,911,678,559,WHITE,LINE,r=24)
a.txt(82,958,'B   趋势：先保证记录可比较',29)
a.rect(80,980,630,54,PALE,r=12)
a.txt(395,1016,'同一症状 / 量表 → 按日聚合 → 比较两周',22,GREEN,'center')
a.txt(82,1072,'同一强度量表的记录示意',20,MUTED)
a.txt(709,1072,'虚构数据',16,MUTED,'right')
series=[2,3,None,4,2,3,2,3,None,4,4,5,4,5]
px=[100+i*44 for i in range(14)]; base=1197
a.line([(82,base),(710,base)],LINE,1)
a.line([(386,1096),(386,1220)],LINE,1,dash=True)
last=None
for i,v in enumerate(series):
    if v is None:
        a.txt(px[i],base+22,'缺',15,TERRA,'center');last=None;continue
    yy=base-v*17
    if last is not None:a.line([last,(px[i],yy)],GREEN,2)
    a.dot(px[i],yy,5,GREEN);last=(px[i],yy)
a.txt(230,1248,'前 7 天：6 / 7 天有记录',18,MUTED,'center')
a.txt(541,1248,'近 7 天：6 / 7 天有记录',18,MUTED,'center')
a.txt(82,1298,'变化量 = 近 7 天中位数 − 前 7 天中位数',23)
a.lines(82,1343,[
 '缺记录不补 0；明确“没有”单独保留。',
 '两周各 ≥4 个有效日才描述方向，否则信息不足。',
 '用药 / 就诊只作标记，不据此断言原因。'
],21,MUTED,leading=34,maxw=626)

a.rect(766,911,678,559,WHITE,LINE,r=24)
a.txt(792,958,'C   医生材料：每个讨论项有依据',29)
steps=[
 (985,'①  汇总事实','变化、阳性 / 阴性表现、病史、用药、已做检查'),
 (1095,'②  匹配经审定的临床路径','检查适用条件、前提、已做项目与缺失信息'),
 (1205,'③  生成检查讨论项','列出理由、来源、既有结果；前提不足先列待核实项')
]
for y,title,sub in steps:
    a.rect(790,y,630,83,PALE if y==1205 else BG,r=13)
    a.txt(811,y+32,title,23)
    a.txt(811,y+64,sub,20,MUTED)
for y in [1068,1178]:a.line([(1105,y),(1105,y+24)],arrow=True)
a.line([(1105,1288),(1105,1313)],arrow=True)
a.rect(790,1316,630,65,INK,r=15)
a.txt(1105,1357,'患者核对分享 → 医生判断并决定检查',24,'#FFFDF8','center')
a.txt(792,1436,'输出简短结论与来源索引，不堆叠每日对话。',21,MUTED)

a.txt(56,1512,'“每轮 3 题、7 天窗口、每周 ≥4 天”均为待验证的产品默认值，不是医学阈值。',19,MUTED)
a.txt(56,1544,'单次紧急线索立即走风险分支，不等待趋势窗口；新问题始终可跳出既往诊断范围。',19,MUTED)
a.save()

html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>诊后持续观察 · 工作流与算法设计</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f6f3eb;color:#203e39;font-family:system-ui,-apple-system,"PingFang SC",sans-serif}header,footer{max-width:1500px;margin:auto;padding:24px 4%;}header{display:flex;align-items:center;justify-content:space-between;gap:16px}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#237467;text-underline-offset:4px}nav a{padding:9px 15px;border:1px solid #cbd6cd;border-radius:24px;text-decoration:none;font-size:14px}main{max-width:1500px;margin:auto}figure{margin:0 0 24px}figure svg{display:block;width:100%;height:auto}footer{font-size:14px;line-height:1.9;border-top:1px solid #cbd6cd}footer p{margin:8px 0}@media print{header,footer{display:none}figure{break-after:page}}
</style><header><span>设计提案 · 2026.10.03</span><nav><a href="#workflow">工作流</a><a href="#algorithms">算法与示例</a><a href="01-care-workflow.png" download>下载主图</a><a href="02-care-algorithms.png" download>下载算法图</a></nav></header><main>'''
for name,ident in [('01-care-workflow','workflow'),('02-care-algorithms','algorithms')]:
    html+=f'<figure id="{ident}">'+(ROOT/(name+'.svg')).read_text()+'</figure>'
html+='''</main><footer><p>这是基于新定位的设计方案，尚未应用到现有网站。图中的临床知识库、规则审定与路径内容需要另外建设；产品默认值需要验证。</p><p>医学示例来源：<a href="https://professional.heart.org/en/science-news/2021-guideline-for-the-evaluation-and-diagnosis-of-chest-pain/top-things-to-know">[1] American Heart Association — 2021 Chest Pain Guideline</a> · <a href="https://www.ruh.nhs.uk/patients/services/clinical_depts/cardiology/documents/After_a_Heart_Attack_Book.pdf">[2] NHS Royal United Hospitals Bath — After a Heart Attack（第 27 页）</a>。这些资料支持关联症状示例，不代表图中产品算法已获临床验证。</p><p>矢量原图：<a href="01-care-workflow.svg" download>工作流 SVG</a> · <a href="02-care-algorithms.svg" download>算法 SVG</a>。<a href="design-receipt.json">设计与验证记录</a></p></footer></html>'''
(ROOT/'care-design.html').write_text(html)
print(str(ROOT/'care-design.html'))
