"""Offline translation drafts using Apache-2.0 OPUS-MT models. Not part of the app runtime.
Review the output before voice production. Dependencies live in a separate tooling environment.
"""
import json, re, os
from pathlib import Path
import ctranslate2
from transformers import AutoTokenizer
from ctranslate2.converters import TransformersConverter

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'runs/debug/localization-2026-09-13'
CACHE=Path.home()/'.cache/nava-translation-models'
inventory=json.loads((OUT/'inventory.json').read_text(encoding='utf-8'))
models={'en':('Helsinki-NLP/opus-mt-ROMANCE-en','e9ca9975e3972afd80732f08ce01d3a1339f47f8'), 'fr':('Helsinki-NLP/opus-mt-ro-fr','d8e852da5392b00ffa105973795f667681cb54f7')}
texts=list(dict.fromkeys([x['text'] for x in inventory['ui']]+[x['text'] for x in inventory['speech']]))
for lang,(model,revision) in models.items():
    from huggingface_hub import snapshot_download
    source=snapshot_download(model,revision=revision,local_dir=str(CACHE/f'{lang}-source'),allow_patterns=['*.json','*.spm','*.bin','*.safetensors','README.md'])
    target=CACHE/lang
    if not (target/'model.bin').exists():
        print('Converting',lang,flush=True)
        TransformersConverter(source).convert(str(target),quantization='int8',force=True)
    tokenizer=AutoTokenizer.from_pretrained(source)
    engine=ctranslate2.Translator(str(target),device='cpu',compute_type='int8',inter_threads=2,intra_threads=6)
    file=OUT/f'draft-{lang}.json'
    result=json.loads(file.read_text(encoding='utf-8')) if file.exists() else {}
    pending=[t for t in texts if t not in result]
    for i in range(0,len(pending),24):
        batch=pending[i:i+24]
        tokens=[tokenizer.convert_ids_to_tokens(tokenizer.encode(t)) for t in batch]
        translated=engine.translate_batch(tokens,beam_size=4,max_decoding_length=384)
        for original,r in zip(batch,translated):
            text=tokenizer.decode(tokenizer.convert_tokens_to_ids(r.hypotheses[0]),skip_special_tokens=True)
            # Protect interpolation slots; retry fragments if MT rewrites their delimiters.
            if sorted(re.findall(r'\{\d+\}',text))!=sorted(re.findall(r'\{\d+\}',original)):
                chunks=re.split(r'(\{\d+\})',original);indexes=[j for j,c in enumerate(chunks) if j%2==0 and c.strip()]
                split=engine.translate_batch([tokenizer.convert_ids_to_tokens(tokenizer.encode(chunks[j])) for j in indexes],beam_size=4,max_decoding_length=384)
                for j,rr in zip(indexes,split):
                    space_before=' ' if chunks[j].startswith(' ') else '';space_after=' ' if chunks[j].endswith(' ') else ''
                    chunks[j]=space_before+tokenizer.decode(tokenizer.convert_tokens_to_ids(rr.hypotheses[0]),skip_special_tokens=True).strip()+space_after
                text=''.join(chunks)
            result[original]=text
        file.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(lang,len(result),'/',len(texts),flush=True)
    (OUT/f'provenance-{lang}.json').write_text(json.dumps({'model':model,'revision':revision,'license':'Apache-2.0','method':'local OPUS-MT draft; editorial review required'},indent=2),encoding='utf-8')
