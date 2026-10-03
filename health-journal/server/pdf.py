"""Render a reviewed brief from stdin JSON to stdout PDF. No files or network."""
import io
import json
import os
import sys
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer


def render(data):
    font_path = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
    if os.path.isfile(font_path):
        pdfmetrics.registerFont(TTFont('JournalBody', font_path))
        body_font = 'JournalBody'
    else:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        body_font = 'STSong-Light'
    ink = colors.HexColor('#3D3834')
    clay = colors.HexColor('#A8543C')
    muted = colors.HexColor('#756C64')
    line = colors.HexColor('#E8E0D6')
    body = ParagraphStyle('body', fontName=body_font, fontSize=10.5, leading=16,
                          textColor=ink, spaceAfter=5, alignment=TA_LEFT,
                          splitLongWords=True, allowWidows=0, allowOrphans=0)
    heading = ParagraphStyle('section', parent=body, textColor=clay, fontSize=11,
                             leading=16, spaceBefore=9, spaceAfter=6, keepWithNext=True)
    meta = ParagraphStyle('meta', parent=body, textColor=muted, fontSize=8.5, leading=12)
    document = io.BytesIO()
    doc = SimpleDocTemplate(document, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm,
                            topMargin=30*mm, bottomMargin=22*mm,
                            title='Health Journal - reviewed visit brief', author='Health Journal')
    zh = data.get('locale') == 'zh'
    version = int(data.get('version', 1))
    text = str(data['text'])
    story = []
    if data.get('demo'):
        story.append(Paragraph('虚构示例 · 非真实患者' if zh else 'FICTIONAL EXAMPLE - NOT A REAL PATIENT', heading))
    story.append(Paragraph(('经患者核对的版本' if zh else 'Patient-reviewed version') + f' {version}', meta))
    story.append(Spacer(1, 10))
    following_blank = True
    for raw in text.splitlines():
        if not raw.strip():
            following_blank = True
            story.append(Spacer(1, 5))
            continue
        is_heading = following_blank and len(raw) < 105 and not raw.startswith(('•', '-', ' ')) and ':' not in raw and '：' not in raw
        paragraph = Paragraph(escape(raw), heading if is_heading else body)
        story.append(paragraph)
        following_blank = False

    def page(canvas, document):
        canvas.saveState()
        width, height = A4
        canvas.setFillColor(clay)
        canvas.setFont('Times-Roman', 20)
        canvas.drawString(18*mm, height-17*mm, 'Health Journal')
        canvas.setStrokeColor(line)
        canvas.line(18*mm, height-21*mm, width-18*mm, height-21*mm)
        canvas.line(18*mm, 17*mm, width-18*mm, 17*mm)
        canvas.setFillColor(muted)
        canvas.setFont(body_font, 8)
        footer = '患者整理；不替代医疗诊断。' if zh else 'Patient-prepared. Not a diagnosis or a verified clinical record.'
        canvas.drawString(18*mm, 12*mm, footer)
        canvas.drawRightString(width-18*mm, 12*mm, str(document.page))
        canvas.restoreState()

    doc.build(story, onFirstPage=page, onLaterPages=page)
    return document.getvalue()


if __name__ == '__main__':
    raw = sys.stdin.buffer.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError('Input too large')
    data = json.loads(raw)
    if not isinstance(data.get('text'), str) or len(data['text']) > 240_000:
        raise ValueError('Invalid text')
    sys.stdout.buffer.write(render(data))
