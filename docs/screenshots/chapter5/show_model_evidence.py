"""Display saved evaluation evidence for a user-taken terminal screenshot."""
from pathlib import Path
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('section',choices=['comparison','importance'])
a=parser.parse_args()
root=Path(__file__).resolve().parents[3]
source=root/'ml-service/results/model_performance_report_2026-10-27.md'
text=source.read_text()
if a.section=='comparison':
 block=text.split('**Comparison with the baselines**')[1].split('**Final-pipeline cross-validation**')[0]
 title='MODEL COMPARISON — SAVED 600-RECORD TEST RESULTS'
else:
 block=text.split('**Feature importance and error behaviour**')[1]
 title='FEATURE IMPORTANCE — SAVED AGGREGATED GAIN'
rows=[]
for line in block.splitlines():
 if line.startswith('|'):
  cells=[v.strip().replace('**','').replace('`','') for v in line.strip('|').split('|')]
  if any(cells) and not all(not c or set(c)<=set('- :') for c in cells): rows.append(cells)
 elif rows and line.strip() and not line.startswith('|'): break
widths=[max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
print(title)
print('Source: ml-service/results/model_performance_report_2026-10-27.md')
print('Recorded evaluation; this command does not retrain or rerun the model.\n')
for index,row in enumerate(rows):
 print(' | '.join(cell.ljust(width) for cell,width in zip(row,widths)))
 if index==0: print('-+-'.join('-'*w for w in widths))
print('\nSynthetic data only; importance does not establish real-world causation.')
