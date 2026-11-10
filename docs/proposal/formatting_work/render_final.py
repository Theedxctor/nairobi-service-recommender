import uno,time,json
from pathlib import Path
from com.sun.star.beans import PropertyValue
ROOT=Path(__file__).resolve().parent.parent
def pv(n,v):p=PropertyValue();p.Name=n;p.Value=v;return p
ctx=uno.getComponentContext();rs=ctx.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',ctx)
for _ in range(30):
 try:remote=rs.resolve('uno:socket,host=localhost,port=2017;urp;StarOffice.ComponentContext');break
 except Exception:time.sleep(1)
d=remote.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',remote)
doc=d.loadComponentFromURL((ROOT/'164003_Dr.Deperias_documentation_formatted.docx').as_uri(),'_blank',0,(pv('Hidden',True),pv('ReadOnly',True),pv('UpdateDocMode',0)))
# Render the final saved package, without regenerating its repaired Word lists.
pdf=ROOT/'164003_Dr.Deperias_documentation_formatted_preview.pdf'
doc.storeToURL(pdf.as_uri(),(pv('FilterName','writer_pdf_Export'),pv('Overwrite',True)))
vc=doc.CurrentController.ViewCursor
pages={}
for name in doc.Bookmarks.ElementNames:
 if name.startswith(('Chapter_','Section_','Head_','Figure_','Table_')):
  try:vc.gotoRange(doc.Bookmarks.getByName(name).Anchor,False);pages[name]=vc.Page
  except Exception:pass
(ROOT/'formatting_work/bookmark_pages.json').write_text(json.dumps(pages,indent=2))
print(json.dumps({'pdf':str(pdf),'bookmarks_measured':len(pages),'engine':'LibreOffice 25.8.2.2'}))
doc.close(True);d.terminate()
