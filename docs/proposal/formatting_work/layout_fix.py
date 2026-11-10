from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
P=Path(__file__).resolve().parent.parent/'164003_Dr.Deperias_documentation_formatted.docx'
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';n={'w':W};q=lambda x:'{'+W+'}'+x
with ZipFile(P) as z:parts={x:z.read(x) for x in z.namelist()}
r=E.fromstring(parts['word/document.xml']);numbering=E.fromstring(parts['word/numbering.xml'])
for lvl in numbering.findall('.//w:lvl',n):
 if lvl.find('w:pStyle[@w:val="Heading1"]',n) is not None:
  lvl.find('w:lvlText',n).set(q('val'),'%1')
for p in r.findall('.//w:p',n):
 pp=p.find(q('pPr'))
 if pp is None:continue
 if p.find('.//w:drawing',n) is not None:
  sp=pp.find(q('spacing'))
  if sp is not None:sp.set(q('line'),'240')
 if ''.join(p.xpath('.//w:t/text()',namespaces=n))=='Appendix A1: Time Schedule':
  for br in pp.findall(q('pageBreakBefore')):pp.remove(br)
for tbl in r.findall('.//w:tbl',n):
 grid=tbl.find(q('tblGrid'));width=sum(int(x.get(q('w'),'0')) for x in grid) if grid is not None else 9360
 for tcw in tbl.findall('.//w:tcW',n):
  if tcw.get(q('type'))=='dxa':tcw.set(q('w'),str(min(int(tcw.get(q('w'),'0')),9360)))
 for h in tbl.findall('.//w:trHeight',n):
  if h.get(q('hRule'))=='exact':h.set(q('hRule'),'atLeast')
for name,root in [('word/document.xml',r),('word/numbering.xml',numbering)]:parts[name]=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile(P,'w',ZIP_DEFLATED) as z:
 for k,v in parts.items():z.writestr(k,v)
print('Applied cross-engine chapter-number format and figure layout repairs.')
