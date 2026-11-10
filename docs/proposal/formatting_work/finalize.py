from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
from collections import Counter
import re,json,hashlib
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'164003_Dr.Deperias_documentation_formatted.docx'
SRC=ROOT/'164003_Dr.Deperias_documentation_draft.docx'
IN=ROOT/'formatting_work'/('refreshed_'+OUT.name)
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';N={'w':W};q=lambda s:'{'+W+'}'+s
with ZipFile(IN) as z:parts={k:z.read(k) for k in z.namelist()}
r=E.fromstring(parts['word/document.xml']);body=r.find(q('body'))
def text(p):return ''.join(p.xpath('.//w:t/text()',namespaces=N))
def element(tag,**attrs):
 x=E.Element(q(tag))
 for k,v in attrs.items():x.set(q(k),str(v))
 return x
def field(code,value):
 nodes=[]
 for typ in ['begin','instruction','separate','result','end']:
  rr=element('r')
  if typ=='instruction':x=E.SubElement(rr,q('instrText'));x.text=' '+code+' ';x.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
  elif typ=='result':E.SubElement(rr,q('t')).text=value
  else:rr.append(element('fldChar',fldCharType=typ))
  nodes.append(rr)
 return nodes
# LibreOffice emitted references to an undefined, empty character style.
for st in r.findall('.//w:rStyle[@w:val="Style"]',N):st.getparent().remove(st)
# A stand-alone paragraph holding a page break can overflow onto a blank page.
for p in list(body.findall(q('p'))):
 if not text(p).strip() and p.find('.//w:br[@w:type="page"]',N) is not None and p.find('.//w:sectPr',N) is None:
  nxt=p.getnext()
  if nxt is not None and nxt.tag==q('p'):
   pp=nxt.find(q('pPr'))
   if pp is None:pp=element('pPr');nxt.insert(0,pp)
   pp.insert(1,element('pageBreakBefore'));body.remove(p)
# Use valid, portable caption bookmarks in generated lists. Replace cached
# page-number text with Word-native PAGEREF fields, retaining engine results.
bm={x.get(q('name')) for x in r.findall('.//w:bookmarkStart',N)}
linked=0
for link in r.findall('.//w:hyperlink',N):
 anchor=link.get(q('anchor'));tx=text(link)
 if not anchor:continue
 if '|sequence' in anchor:
  m=re.match(r'(Figure|Table)\s+([A\d][\dA.]+)\s',tx)
  if not m:raise RuntimeError('Cannot map list link '+tx)
  anchor=m[1]+'_'+m[2].replace('.','_');link.set(q('anchor'),anchor)
 if anchor not in bm:raise RuntimeError('Missing hyperlink bookmark '+anchor)
 tabs=link.findall('.//'+q('tab'))
 if not tabs:continue
 tab=tabs[-1];rr=tab.getparent();sibs=list(rr);pos=sibs.index(tab)
 tail=sibs[pos+1:];val=''.join(x.text or '' for x in tail if x.tag==q('t'))
 if not re.fullmatch(r'\d+|[ivxlcdm]+',val):continue
 for x in tail:rr.remove(x)
 at=link.index(rr)+1
 for node in field('PAGEREF '+anchor+' \\h',val):link.insert(at,node);at+=1
 linked+=1
# Remove stale dirty flags, with update-on-open retained for subsequent edits.
for fc in r.findall('.//'+q('fldChar')):fc.attrib.pop(q('dirty'),None)
parts['word/document.xml']=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile(OUT,'w',ZIP_DEFLATED) as z:
 for k,v in parts.items():z.writestr(k,v)
with ZipFile(SRC) as orig,ZipFile(OUT) as final:
 media=lambda z:Counter(hashlib.sha256(z.read(k)).hexdigest() for k in z.namelist() if k.startswith('word/media/'))
 assert media(orig)==media(final),'Image payload changed'
 odoc=E.fromstring(orig.read('word/document.xml'));fdoc=E.fromstring(final.read('word/document.xml'))
 ot=odoc.findall('.//w:tbl',N);ft=fdoc.findall('.//w:tbl',N)
 assert len(ot)==len(ft)==21
 assert len(odoc.findall('.//w:drawing',N))==len(fdoc.findall('.//w:drawing',N))==30
 norm=lambda s:re.sub(r'\s+',' ',s).strip()
 table_differences=[]
 for i,(a,b) in enumerate(zip(ot,ft)):
  if norm(text(a))!=norm(text(b)):table_differences.append(i)
 ops=odoc.find(q('body')).findall(q('p'))
 refs=[norm(text(p)) for p in ops[479:499] if text(p).strip()]
 finaltext=norm(text(fdoc));missing_refs=[t for t in refs if t not in finaltext]
 assert not missing_refs,'Bibliography content missing'
 # Every original non-navigation paragraph must retain its words; changes are
 # restricted to numbering/cross-reference labels and whitespace.
 def words(s):
  s=re.sub(r'Chapter (One|Two|Three|Four|Five):','',s)
  s=re.sub(r'\b(?:Chapter|Section|Figure|Table)s?\s+[A-Z]?\d+(?:\.\d+)*',lambda m:re.match(r'\w+',m[0])[0],s)
  s=re.sub(r'^\d+(?:\.\d+)*\s+','',s)
  return re.sub(r'[^\w]+','',s).lower()
 fp=[words(text(p)) for p in fdoc.findall('.//w:p',N)]
 missing=[]
 for i,p in enumerate(ops):
  if 63<=i<=117 or not text(p).strip():continue
  a=words(text(p))
  if a and not any(a in b for b in fp):missing.append({'index':i,'text':text(p)[:180]})
 report={'original_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'media_payloads_identical':True,'images':30,'tables':21,'table_text_differences':table_differences,'bibliography_preserved':not missing_refs,'unmatched_original_paragraphs':missing,'page_reference_fields_added':linked}
 (ROOT/'formatting_work/preservation_report.json').write_text(json.dumps(report,indent=2))
 print(json.dumps(report,indent=2))
