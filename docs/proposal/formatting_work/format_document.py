from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
from copy import deepcopy
import re, json, hashlib

ROOT=Path(__file__).resolve().parent.parent
SRC=ROOT/'164003_Dr.Deperias_documentation_draft.docx'
DST=ROOT/'164003_Dr.Deperias_documentation_formatted.docx'
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
NS={'w':W,'wp':WP,'r':R}
def q(s): return '{'+W+'}'+s
def el(tag,**a):
 e=E.Element(q(tag))
 for k,v in a.items(): e.set(q(k),str(v))
 return e
def setp(parent,tag,**a):
 for old in parent.findall(q(tag)): parent.remove(old)
 e=el(tag,**a);parent.append(e);return e
def text(p): return ''.join(p.xpath('.//w:t/text()',namespaces=NS))
def prop(p):
 x=p.find(q('pPr'))
 if x is None: x=el('pPr');p.insert(0,x)
 return x
def style(p,s): setp(prop(p),'pStyle',val=s)
def run(t):
 r=el('r');tx=E.SubElement(r,q('t'));tx.set('{http://www.w3.org/XML/1998/namespace}space','preserve');tx.text=t;return r
def field(code,cached):
 a=[]
 for typ in ['begin','instruction','separate','value','end']:
  r=el('r')
  if typ=='instruction':
   x=E.SubElement(r,q('instrText'));x.set('{http://www.w3.org/XML/1998/namespace}space','preserve');x.text=' '+code+' '
  elif typ=='value':r=run(cached)
  else:r.append(el('fldChar',fldCharType=typ))
  a.append(r)
 return a
def rewrite(p,t):
 # Keep existing bookmark boundaries and non-text content.
 ts=p.findall('.//'+q('t'))
 if ts:
  ts[0].text=t
  for x in ts[1:]:x.text=''
 else:p.append(run(t))
with ZipFile(SRC) as z: parts={n:z.read(n) for n in z.namelist()}
doc=E.fromstring(parts['word/document.xml']);body=doc.find(q('body'));ps=body.findall(q('p'))
original_text={i:text(p) for i,p in enumerate(ps)}
styles=E.fromstring(parts['word/styles.xml']);numbering=E.fromstring(parts['word/numbering.xml'])
report={'source_sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'caption_mapping':{},'unresolved_references':[]}

# Remove the old generated TOC and static lists, retaining their headings.
for sdt in body.findall(q('sdt')):
 if any('TOC ' in (x.text or '') for x in sdt.findall('.//'+q('instrText'))):body.remove(sdt)
for i in list(range(67,96))+list(range(97,118)):
 body.remove(ps[i])

# Normalise the inherited and direct font declarations throughout the package.
def font(rp):
 for tag in ['rFonts','sz','szCs','spacing','w','position']:
  for old in rp.findall(q(tag)):rp.remove(old)
 rp.insert(0,el('rFonts',ascii='Times New Roman',hAnsi='Times New Roman',eastAsia='Times New Roman',cs='Times New Roman'))
 rp.append(el('sz',val=24));rp.append(el('szCs',val=24))
for rp in styles.findall('.//'+q('rPr')):font(rp)
def make_style(sid,name,bold=False,level=None,align='both',before=0,after=120):
 st=next((x for x in styles.findall(q('style')) if x.get(q('styleId'))==sid),None)
 if st is None:st=el('style',type='paragraph',styleId=sid);styles.append(st)
 st.attrib.pop(q('customStyle'),None)
 for c in list(st):st.remove(c)
 st.append(el('name',val=name))
 if sid!='Normal':st.append(el('basedOn',val='Normal'))
 st.append(el('next',val='Normal'));st.append(el('qFormat'))
 pp=el('pPr');pp.append(el('spacing',before=before,after=after,line=360,lineRule='auto'));pp.append(el('jc',val=align))
 if level is not None:pp.append(el('keepNext'));pp.append(el('keepLines'));pp.append(el('outlineLvl',val=level))
 st.append(pp);rp=el('rPr');font(rp)
 if bold:rp.append(el('b'))
 st.append(rp)
make_style('Normal','Normal')
for lv in range(1,4):make_style('Heading'+str(lv),'heading '+str(lv),True,lv-1,'left',240,120)
make_style('FrontHeading','Front Heading',True,0,'center',0,240)
make_style('ListHeading','List Heading',True,None,'center',0,240)
make_style('Caption','caption',False,None,'left',120,120)
make_style('Bibliography','Bibliography')
make_style('Cover','Cover',False,None,'center',0,360)
for lv in range(1,4):make_style('TOC'+str(lv),'toc '+str(lv),False,None,'left',0,60)

# Real multilevel chapter/section numbering linked to native Word headings.
aid=max([int(x.get(q('abstractNumId'))) for x in numbering.findall(q('abstractNum'))]+[0])+1
nid=max([int(x.get(q('numId'))) for x in numbering.findall(q('num'))]+[0])+1
ab=el('abstractNum',abstractNumId=aid);ab.append(el('multiLevelType',val='multilevel'))
for lv,label in enumerate(['Chapter %1:','%1.%2','%1.%2.%3']):
 l=el('lvl',ilvl=lv);l.append(el('start',val=1));l.append(el('numFmt',val='decimal'));l.append(el('pStyle',val='Heading'+str(lv+1)));l.append(el('lvlText',val=label));l.append(el('lvlJc',val='left'))
 if lv:l.append(el('lvlRestart',val=lv))
 l.append(el('suff',val='space'));ab.append(l)
first_num=numbering.find(q('num'))
if first_num is None:numbering.append(ab)
else:first_num.addprevious(ab)
nu=el('num',numId=nid);nu.append(el('abstractNumId',val=aid));numbering.append(nu)
for lv in range(1,4):
 st=next(x for x in styles.findall(q('style')) if x.get(q('styleId'))=='Heading'+str(lv))
 np=el('numPr');np.append(el('ilvl',val=lv-1));np.append(el('numId',val=nid));st.find(q('pPr')).append(np)

# Renaming illegal legacy bookmark names keeps all existing link targets valid.
renames={};used=set()
for bm in doc.findall('.//'+q('bookmarkStart')):
 name=bm.get(q('name'));new=name
 if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,39}',name or ''):new='Legacy_'+bm.get(q('id'))
 if new in used:new='Legacy_'+bm.get(q('id'))
 used.add(new);renames[name]=new;bm.set(q('name'),new)
for link in doc.findall('.//'+q('hyperlink')):
 old=link.get(q('anchor'))
 if old in renames:link.set(q('anchor'),renames[old])
bid=max([int(x.get(q('id'))) for x in doc.findall('.//'+q('bookmarkStart'))]+[0])+1
def bookmark(p,name,nodes=None):
 global bid
 st=el('bookmarkStart',id=bid,name=name);en=el('bookmarkEnd',id=bid);bid+=1
 if nodes:
  nodes[0].addprevious(st);nodes[-1].addnext(en)
 else:p.insert(1 if p.find(q('pPr')) is not None else 0,st);p.append(en)
 return name
headings={};chapter=0;sec=0;sub=0;heading_nodes=[];caption_nodes=[]
for i,p in enumerate(ps):
 if p.getparent() is None:continue
 t=original_text[i];pp=prop(p);sid=pp.find(q('pStyle'));oldstyle=sid.get(q('val')) if sid is not None else ''
 # Preserve list numbering for genuine lists, not headings.
 oldnum=deepcopy(pp.find(q('numPr')))
 for c in list(pp):pp.remove(c)
 pp.append(el('spacing',before=0,after=120,line=360,lineRule='auto'));pp.append(el('jc',val='both'));pp.append(el('widowControl'))
 style(p,'Normal')
 if oldnum is not None and oldstyle=='986' and i not in [119,199,206]:pp.append(oldnum)
 for br in p.findall('.//'+q('br')):
  if br.get(q('type'))=='page':br.getparent().remove(br)
 for rp in p.findall('.//'+q('rPr')):font(rp)
 if i<29:
  style(p,'Cover');setp(pp,'jc',val='center');setp(pp,'spacing',before=0,after=360,line=360,lineRule='auto')
  if i==0:
   for r in p.findall(q('r')):
    rp=r.find(q('rPr'))
    if rp is None:rp=el('rPr');r.insert(0,rp)
    setp(rp,'b');setp(pp,'spacing',before=600,after=600,line=360,lineRule='auto')
 elif i in [29,53,56,63,66,96,478,500,501,503]:
  style(p,'ListHeading' if i in [63,66,96] else 'FrontHeading');setp(pp,'jc',val='center');setp(pp,'keepNext');setp(pp,'pageBreakBefore')
  if i in [29,53,56,478,500,501,503]:heading_nodes.append((p,t,0,bookmark(p,'Head_'+str(i))))
 elif re.match(r'Chapter (One|Two|Three|Four|Five):',t):
  chapter+=1;sec=sub=0;rewrite(p,t.split(':',1)[1].strip());style(p,'Heading1');setp(pp,'pageBreakBefore');setp(pp,'keepNext');setp(pp,'jc',val='left')
  np=setp(pp,'numPr');np.append(el('ilvl',val=0));np.append(el('numId',val=nid))
  name=bookmark(p,'Chapter_'+str(chapter));headings['Chapter '+str(chapter)]=(name,str(chapter),'number')
  heading_nodes.append((p,'Chapter '+str(chapter)+': '+text(p),0,name))
 elif (oldstyle in ['983','984'] and 118<i<478 and t.strip()) or i in [119,199,206]:
  level=2 if oldstyle=='983' or i in [119,199,206] else 3
  if level==2:sec+=1;sub=0
  else:sub+=1
  num=f'{chapter}.{sec}'+(f'.{sub}' if level==3 else '')
  clean=re.sub(r'^\d+(?:\.\d+)+\s+','',t);rewrite(p,clean)
  style(p,'Heading'+str(level));setp(pp,'jc',val='left');setp(pp,'keepNext');setp(pp,'spacing',before=240,after=120,line=360,lineRule='auto')
  np=setp(pp,'numPr');np.append(el('ilvl',val=level-1));np.append(el('numId',val=nid))
  name=bookmark(p,'Section_'+num.replace('.','_'));headings['Section '+num]=(name,num,'number');heading_nodes.append((p,num+' '+clean,level-1,name))
 elif 479<=i<=498:
  style(p,'Bibliography');setp(pp,'ind',left=720,hanging=720)
 if i in [35,38,41,48,51]:setp(pp,'spacing',before=240,after=240,line=360,lineRule='auto')
 if p.findall('.//'+q('drawing')):
  setp(pp,'jc',val='center');setp(pp,'keepNext');setp(pp,'keepLines')

# Captions: chapter.number; appendices A1.number and A2.number.
counts={};caption_map={}
for i,p in enumerate(ps):
 if p.getparent() is None or i<118:continue
 t=original_text[i]
 if re.match(r'^(Figure|Table)\s+[A\d]',t) and len(t)<230 and (ps[i].find(q('pPr')) is not None):
  # Caption styles identify captions, excluding prose beginning with a reference.
  # Original fixed caption locations, based on inventory.
  iscap=i in [176,183,190,214,241,311,314,317,320,326,332,341,348,354,359,361,365,368,371,374,377,381,391,394,397,405,409,412,421,423,426,432,437,440,442,444,449,457,465,470,474,477,506,509,512,515,518,521,524,527]
  if not iscap:continue
  m=re.match(r'(Figure|Table)\s+(\S+)\s+(.*)',t);label,old,title=m.groups();ch=old.split('.')[0]
  key=(label,ch);counts[key]=counts.get(key,0)+1;n=counts[key]
  new=f'{ch}.{n}'
  for c in list(p):
   if c.tag!=q('pPr'):p.remove(c)
  style(p,'Caption');pp=prop(p);setp(pp,'jc',val='left');setp(pp,'keepLines');setp(pp,'spacing',before=120,after=120,line=360,lineRule='auto')
  if label=='Table':setp(pp,'keepNext')
  p.append(run(label+' '));nodes=[]
  if ch.isdigit():nodes+=field('STYLEREF 1 \\s',ch);nodes.append(run('.'));nodes+=field('SEQ '+label+' \\* ARABIC \\s 1',str(n))
  else:nodes.append(run(ch+'.'));nodes+=field('SEQ '+label+' \\* ARABIC'+(' \\r 1' if n==1 else ''),str(n))
  for nd in nodes:p.append(nd)
  name=bookmark(p,label+'_'+new.replace('.','_'),nodes)
  p.append(run(' '+title));caption_map[label+' '+old]=(name,new,'text');caption_nodes.append((p,label+' '+new+' '+title,label,name))
  report['caption_mapping'][label+' '+old]=label+' '+new

# Previously uncaptioned appendix time schedule.
p=el('p');style(p,'Caption');p.append(run('Figure '));nodes=[run('A1.')]+field('SEQ Figure \\* ARABIC \\r 1','1')
for n in nodes:p.append(n)
bm=bookmark(p,'Figure_A1_1',nodes);p.append(run(' Time Schedule'));ps[502].addnext(p);caption_nodes.append((p,'Figure A1.1 Time Schedule','Figure',bm))

# Replace typed cross-reference numbers in-place across split text runs.
lookup={**headings,**caption_map};ref_count=0
pattern=re.compile(r'\b(Figures?|Tables?|Sections?|Chapters?)\s+([A-Z]?\d+(?:\.\d+)*)\b')
def replace_span(p,start,end,nodes):
 ts=p.findall('.//'+q('t'));offset=0;spans=[]
 for t in ts:
  v=t.text or '';spans.append((t,offset,offset+len(v)));offset+=len(v)
 hit=[x for x in spans if x[2]>start and x[1]<end]
 if not hit:return
 first,lo,hi=hit[0];r=first.getparent();last,ll,lh=hit[-1]
 if r.tag!=q('r') or r.getparent().tag!=q('p'):return
 suffix=(last.text or '')[end-ll:];first.text=(first.text or '')[:start-lo]
 for t,a,b in hit[1:]:t.text=''
 idx=p.index(r)+1
 for node in nodes:p.insert(idx,node);idx+=1
 if suffix:
  rr=run(suffix);rp=r.find(q('rPr'))
  if rp is not None:rr.insert(0,deepcopy(rp))
  p.insert(idx,rr)
 return True
exclude={x[0] for x in heading_nodes+caption_nodes}
for p in doc.findall('.//'+q('p')):
 if p in exclude or p not in body.iter():continue
 t=text(p)
 for m in reversed(list(pattern.finditer(t))):
  label=m[1].rstrip('s');key=label+' '+m[2]
  if key not in lookup:
   report['unresolved_references'].append({'reference':key,'context':t[:220]});continue
  name,num,kind=lookup[key];code='REF '+name+(' \\w \\t' if kind=='number' else '')+' \\h'
  if replace_span(p,m.start(2),m.end(2),field(code,num)):ref_count+=1
report['cross_references_created']=ref_count

# Clean redundant empty layout paragraphs, preserving bookmarks.
for p in list(body.findall(q('p'))):
 if not text(p).strip() and not p.findall('.//'+q('drawing')) and not p.findall('.//'+q('fldChar')):
  bms=[deepcopy(c) for c in p if c.tag in [q('bookmarkStart'),q('bookmarkEnd')]]
  nxt=p.getnext()
  if nxt is not None and nxt.tag==q('p'):
   for bm in reversed(bms):nxt.insert(1 if nxt.find(q('pPr')) is not None else 0,bm)
  body.remove(p)

# All previous sections were portrait with identical paper size. Use explicit
# cover/preliminary/main sections to avoid inherited restarts and duplicate footers.
for s in doc.findall('.//'+q('sectPr')):s.getparent().remove(s)
rels=E.fromstring(parts['word/_rels/document.xml.rels']);REL='http://schemas.openxmlformats.org/package/2006/relationships'
cts=E.fromstring(parts['[Content_Types].xml']);CT='http://schemas.openxmlformats.org/package/2006/content-types'
def footer(name,fmt=None):
 f=E.Element(q('ftr'),nsmap={'w':W});p=el('p');f.append(p);style(p,'Normal');setp(prop(p),'jc',val='center')
 if fmt:
  for nd in field('PAGE'+(' \\* roman' if fmt=='roman' else ''),''):p.append(nd)
 parts['word/'+name]=E.tostring(f,xml_declaration=True,encoding='UTF-8',standalone=True)
 rid='rIdFmt'+name.replace('.xml','');rr=E.SubElement(rels,'{'+REL+'}Relationship',Id=rid,Type=R+'/footer',Target=name)
 E.SubElement(cts,'{'+CT+'}Override',PartName='/word/'+name,ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml')
 return rid
def section(rid,fmt,start=None):
 s=el('sectPr');fr=el('footerReference',type='default');fr.set('{'+R+'}id',rid);s.append(fr);s.append(el('type',val='nextPage'));s.append(el('pgSz',w=12240,h=15840));s.append(el('pgMar',top=1440,right=1440,bottom=1440,left=1440,header=720,footer=720,gutter=0))
 pn=el('pgNumType',fmt=fmt)
 if start is not None:pn.set(q('start'),str(start))
 s.append(pn);s.append(el('cols',space=720));return s
cover=footer('footerFormattedCover.xml');pre=footer('footerFormattedPrelim.xml','roman');main=footer('footerFormattedMain.xml','arabic')
prop(ps[27]).append(section(cover,'lowerRoman'))
boundary=el('p');style(boundary,'Normal');prop(boundary).append(section(pre,'lowerRoman',1));ps[118].addprevious(boundary)
body.append(section(main,'decimal',1))
for i in [29,118]:
 for x in prop(ps[i]).findall(q('pageBreakBefore')):prop(ps[i]).remove(x)

# Keep all diagram payloads; normalise floating anchors to inline placement and
# scale only their display geometry to the printable page.
for a in list(doc.findall('.//{'+WP+'}anchor')):
 inline=E.Element('{'+WP+'}inline',distT='0',distB='0',distL='0',distR='0')
 for tag in ['extent','effectExtent','docPr','cNvGraphicFramePr']:
  c=a.find('{'+WP+'}'+tag)
  if c is not None:inline.append(deepcopy(c))
 g=a.find('{http://schemas.openxmlformats.org/drawingml/2006/main}graphic')
 if g is not None:inline.append(deepcopy(g))
 a.getparent().replace(a,inline)
for drawing in doc.findall('.//'+q('drawing')):
 ext=drawing.find('.//{'+WP+'}extent')
 if ext is None:continue
 cx,cy=int(ext.get('cx')),int(ext.get('cy'));scale=min(1,468*12700/cx,530*12700/cy)
 if scale<1:
  ext.set('cx',str(round(cx*scale)));ext.set('cy',str(round(cy*scale)))
  for ex in drawing.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}ext'):
   if ex.get('cx')==str(cx) and ex.get('cy')==str(cy):ex.set('cx',str(round(cx*scale)));ex.set('cy',str(round(cy*scale)))

# Table text, consistent borders, repeating headers and page-width constraints.
for tbl in body.findall(q('tbl')):
 tp=tbl.find(q('tblPr'))
 if tp is None:tp=el('tblPr');tbl.insert(0,tp)
 setp(tp,'tblW',w=9360,type='dxa');setp(tp,'jc',val='center')
 grid=tbl.find(q('tblGrid'))
 if grid is not None:
  cols=grid.findall(q('gridCol'));total=sum(int(c.get(q('w'),'0')) for c in cols)
  if total:
   for c in cols:c.set(q('w'),str(round(int(c.get(q('w')))*9360/total)))
 rows=tbl.findall(q('tr'))
 if rows:
  trp=rows[0].find(q('trPr'))
  if trp is None:trp=el('trPr');rows[0].insert(0,trp)
  setp(trp,'tblHeader')
 for p in tbl.findall('.//'+q('p')):
  style(p,'Normal');pp=prop(p);setp(pp,'spacing',before=0,after=60,line=360,lineRule='auto');setp(pp,'jc',val='left');setp(pp,'ind',left=0,right=0,firstLine=0)
 for rp in tbl.findall('.//'+q('rPr')):font(rp)

# Strip direct heading bold overrides and use style-controlled emphasis.
for p,_,_,_ in heading_nodes:
 for rp in p.findall('.//'+q('rPr')):
  for tag in ['b','bCs','i','iCs']:
   for x in rp.findall(q(tag)):rp.remove(x)

settings=E.fromstring(parts['word/settings.xml']);setp(settings,'updateFields',val='true')
for x in settings.findall(q('evenAndOddHeaders')):settings.remove(x)
# Sort paragraph properties into schema order after bulk edits.
order='pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange'.split()
for root in [doc,styles]:
 for pp in root.findall('.//'+q('pPr')):pp[:]=sorted(list(pp),key=lambda x:order.index(E.QName(x).localname) if E.QName(x).localname in order else 99)
for name,root in [('word/document.xml',doc),('word/styles.xml',styles),('word/numbering.xml',numbering),('word/settings.xml',settings),('word/_rels/document.xml.rels',rels),('[Content_Types].xml',cts)]:parts[name]=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile(DST,'w',ZIP_DEFLATED) as z:
 for name,data in parts.items():z.writestr(name,data)
report['headings']=len(heading_nodes);report['captions']=len(caption_nodes)
(ROOT/'formatting_work/repair_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'headings':len(heading_nodes),'captions':len(caption_nodes),'cross_references':ref_count,'unresolved':report['unresolved_references']},indent=2))
