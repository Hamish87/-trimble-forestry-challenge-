from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
catalogue={}
for i,line in enumerate((root/'translations.tsv').read_text().splitlines(),1):
    row=line.split('\t')
    if len(row)!=3 or not all(row):raise ValueError(f'Invalid translation row {i}')
    de,en,fr=row
    catalogue[de.replace('\u00ad','').replace('\u00a0',' ').replace('\u202f',' ')]=[en,fr]
(root/'dist/i18n-catalog.js').write_text('/* Game translations. Source: translations.tsv. */\nglobalThis.ForestryTranslations = '+json.dumps(catalogue,ensure_ascii=False,indent=2)+';\n')
print(f'{len(catalogue)} German / English / French catalogue entries')
