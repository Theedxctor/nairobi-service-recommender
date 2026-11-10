from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
import re
P=Path(__file__).resolve().parent.parent/'164003_Dr.Deperias_documentation_formatted.docx'
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';n={'w':W};q=lambda x:'{'+W+'}'+x
with ZipFile(P) as z:parts={x:z.read(x) for x in z.namelist()}
r=E.fromstring(parts['word/document.xml'])
for sd in r.findall('.//w:sdtContent',n):
 for p in list(sd.findall('w:p',n)):
  if ''.join(p.xpath('.//w:t/text()',namespaces=n)) in ['List of Figures','List of Tables']:sd.remove(p)
for p in r.findall('.//w:p',n):
 codes=p.findall('.//w:instrText',n)
 if not any('SEQ ' in (c.text or '') for c in codes):continue
 txt=''.join(p.xpath('.//w:t/text()',namespaces=n));m=re.match(r'(Figure|Table) (\d+)\.(\d+)',txt)
 if not m:continue
 label,ch,num=m.groups()
 for c in codes:
  if 'STYLEREF' in (c.text or ''):c.text=f' REF Chapter_{ch} \\w \\t \\h '
  elif 'SEQ ' in (c.text or ''):c.text=f' SEQ {label} \\* ARABIC'+(' \\r 1 ' if num=='1' else ' ')
parts['word/document.xml']=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile(P,'w',ZIP_DEFLATED) as z:
 for k,v in parts.items():z.writestr(k,v)
print('Applied cross-engine caption numbering and removed duplicate list headings.')
