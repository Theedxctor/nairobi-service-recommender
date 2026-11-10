import uno, time, json, sys
from pathlib import Path
from com.sun.star.beans import PropertyValue
def pv(n,v):
 p=PropertyValue();p.Name=n;p.Value=v;return p
ctx=uno.getComponentContext();resolver=ctx.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',ctx)
for attempt in range(30):
 try: remote=resolver.resolve('uno:socket,host=localhost,port=2017;urp;StarOffice.ComponentContext');break
 except Exception:time.sleep(1)
else:raise RuntimeError('LibreOffice listener unavailable')
desktop=remote.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',remote)
src=Path(sys.argv[1]).resolve();out=src.parent/'formatting_work'/('refreshed_'+src.name)
doc=desktop.loadComponentFromURL(src.as_uri(),'_blank',0,(pv('Hidden',True),pv('ReadOnly',False),pv('UpdateDocMode',3)))
if doc is None:raise RuntimeError('Could not open document')
for cycle in range(3):
 doc.TextFields.refresh()
 idx=doc.getDocumentIndexes()
 for i in range(idx.Count):idx.getByIndex(i).update()
 doc.calculateAll() if hasattr(doc,'calculateAll') else None
 doc.refresh()
indexes=[]
for i in range(doc.DocumentIndexes.Count):
 x=doc.DocumentIndexes.getByIndex(i);indexes.append({'name':x.Name,'text':x.Anchor.String})
doc.storeToURL(out.as_uri(),(pv('FilterName','Office Open XML Text'),pv('Overwrite',True)))
pdf=src.parent/'formatting_work'/'formatted_preview.pdf'
doc.storeToURL(pdf.as_uri(),(pv('FilterName','writer_pdf_Export'),pv('Overwrite',True)))
(src.parent/'formatting_work'/'layout_refresh.json').write_text(json.dumps({'indexes':indexes,'pages':doc.CurrentController.PageCount},indent=2))
print(json.dumps({'indexes':len(indexes),'pages':doc.CurrentController.PageCount,'docx':str(out),'pdf':str(pdf)}))
doc.close(True)
desktop.terminate()
