#!/usr/bin/env python3
"""Generate NetHack Electron POC tile assets from the art-direction HTML via ComfyUI.

Default is safe: --dry-run plans work only. Use --subset N for a small end-to-end test
or --full to process every asset. Completed installed assets are skipped unless --force.
"""
from __future__ import annotations
import argparse, json, os, re, shutil, sys, time, uuid, urllib.error, urllib.parse, urllib.request
from dataclasses import dataclass, asdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = ROOT / 'docs/electron-poc/early-level-asset-art-directions.html'
WORKFLOW_PATH = ROOT / 'asset-generation/workflows/krea2_basic.json'
MANIFEST_PATH = ROOT / 'asset-generation/manifests/early-level-assets.json'
STATUS_PATH = ROOT / 'asset-generation/manifests/generation-status.json'
OUTPUT_DIR = ROOT / 'asset-generation/outputs'
ELECTRON_TILE_DIR = ROOT / 'electron-poc/assets/tiles'
ELECTRON_GENERATED_DIR = ELECTRON_TILE_DIR / 'generated'
ELECTRON_MANIFEST_PATH = ELECTRON_TILE_DIR / 'manifest.json'

CATEGORY_SLUGS = {
    'Terrain and features': 'terrain-features',
    'Traps and hazards': 'traps-hazards',
    'Player, pets, and identity': 'player-pets-identity',
    'Common early monsters': 'common-early-monsters',
    'Objects and inventory items': 'objects-inventory',
    'UI, status, and overlays': 'ui-status-overlays',
}

def slugify(text: str) -> str:
    text = re.sub(r'[^a-zA-Z0-9]+', '-', text.strip().lower()).strip('-')
    return text or 'asset'

@dataclass
class Asset:
    id: str
    name: str
    category: str
    categorySlug: str
    priority: str
    glyph: str
    why: str
    artDirection: str
    renderingNotes: str
    prompt: str
    outputPath: str = ''
    installedPath: str = ''
    status: str = 'pending'

class AssetHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.category = ''
        self.in_h2 = False
        self.in_td = False
        self.in_code = False
        self.current_cell = []
        self.current_row = None
        self.rows = []
    def handle_starttag(self, tag, attrs):
        if tag == 'h2': self.in_h2 = True; self.current_cell=[]
        elif tag == 'tr': self.current_row=[]
        elif tag == 'td': self.in_td=True; self.current_cell=[]
        elif tag == 'code': self.in_code=True
    def handle_endtag(self, tag):
        if tag == 'h2':
            text=' '.join(''.join(self.current_cell).split())
            self.category = re.sub(r'\s+\d+\s+assets.*$', '', text).strip()
            self.in_h2=False; self.current_cell=[]
        elif tag == 'td' and self.current_row is not None:
            self.current_row.append(' '.join(''.join(self.current_cell).split()))
            self.in_td=False; self.current_cell=[]
        elif tag == 'tr':
            if self.current_row and len(self.current_row) == 6 and self.current_row[0].startswith('P'):
                self.rows.append((self.category, self.current_row))
            self.current_row=None
        elif tag == 'code': self.in_code=False
    def handle_data(self, data):
        if self.in_h2 or self.in_td: self.current_cell.append(data)

def load_assets() -> list[Asset]:
    p = AssetHTMLParser(); p.feed(HTML_PATH.read_text())
    assets=[]; seen={}
    for category, row in p.rows:
        priority, name, glyph, why, art, notes = row
        base=slugify(name); n=seen.get(base,0); seen[base]=n+1
        aid=base if n==0 else f'{base}-{n+1}'
        cat_slug=CATEGORY_SLUGS.get(category, slugify(category))
        prompt=(f"A single 32x32 pixel-art style symbolic NetHack dungeon tile icon for '{name}'. "
                f"{art} Clean orthographic game tile, centered silhouette, readable at 16-32 px, dark transparent or simple dungeon-floor background, no text, no UI frame.")
        assets.append(Asset(aid,name,category,cat_slug,priority,glyph,why,art,notes,prompt))
    return assets

def write_manifests(assets, status):
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps({'source': str(HTML_PATH.relative_to(ROOT)), 'count': len(assets), 'assets': [asdict(a) for a in assets]}, indent=2))
    ELECTRON_TILE_DIR.mkdir(parents=True, exist_ok=True)
    ELECTRON_MANIFEST_PATH.write_text(json.dumps({'version': 1, 'tileSize': 32, 'assets': [asdict(a) for a in assets if a.installedPath]}, indent=2))
    STATUS_PATH.write_text(json.dumps(status, indent=2))

def check_comfy(endpoint):
    try:
        with urllib.request.urlopen(endpoint.rstrip('/') + '/system_stats', timeout=5) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        raise SystemExit(f"ERROR: ComfyUI is not reachable at {endpoint}: {e}")

def load_existing_status():
    if STATUS_PATH.exists():
        try: return json.loads(STATUS_PATH.read_text())
        except Exception: pass
    return {'assets': {}, 'runs': []}

def workflow_to_api(prompt_text, prefix, seed=None):
    wf=json.loads(WORKFLOW_PATH.read_text())
    nodes={str(n['id']): n for n in wf['nodes'] if n.get('type') != 'MarkdownNote'}
    links={l[0]: l for l in wf.get('links', [])}
    api={}
    # Resolve rgthree Anything Everywhere nodes for ComfyUI API validation: the UI
    # workflow uses these as broadcast inputs, while the API graph needs explicit
    # links on each consuming node input.
    default_sources={}
    for n in nodes.values():
        if n.get('type') == 'Anything Everywhere':
            for inp in n.get('inputs', []) or []:
                typ=inp.get('type')
                if typ and typ != '*' and inp.get('link') in links:
                    l=links[inp['link']]
                    default_sources.setdefault(typ, [str(l[1]), l[2]])
    # conservative widget-name maps for common nodes in this workflow
    widget_names={
      'PrimitiveStringMultiline':['value'], 'CLIPTextEncode':['text'], 'SaveImage':['filename_prefix'],
      'RandomNoise':['noise_seed','control_after_generate'], 'KSamplerSelect':['sampler_name'],
      'BasicScheduler':['scheduler','steps','denoise'], 'VAEDecodeTiled':['tile_size','overlap','temporal_size','temporal_overlap'],
      'LatentUpscaleBy':['upscale_method','scale_by'], 'UNETLoader':['unet_name','weight_dtype'],
      'VAELoader':['vae_name'], 'CLIPLoader':['clip_name','type','device'], 'ModelSamplingAuraFlow':['shift'],
      'ImageCASharpening+':['amount'], 'CFGGuider':['cfg'], 'SDXL Empty Latent Image (rgthree)':['resolution','batch_size','clip_scale'],
      'ComfyUI-Krea2T-Enhancer':['debug','strength','enabled'], 'EmptyLatentImage':['width','height','batch_size'],
      'Lora Loader Stack (rgthree)':['lora_01','strength_01','lora_02','strength_02','lora_03','strength_03','lora_04','strength_04'],
      # comfyui-rmbg exposes these as widgets in the saved UI workflow, but the
      # API validator requires them as inputs. Without this mapping the
      # background-removal node runs without its model input and ComfyUI ignores
      # the transparent output.
      'RMBG':['model','sensitivity','process_res','mask_blur','mask_offset','invert_output','refine_foreground','background','background_color'],
    }
    for sid,n in nodes.items():
        inputs={}
        for inp in n.get('inputs',[]) or []:
            if inp.get('link') in links:
                l=links[inp['link']]; inputs[inp['name']]=[str(l[1]), l[2]]
            elif inp.get('type') in default_sources:
                inputs[inp['name']]=default_sources[inp['type']]
        vals=list(n.get('widgets_values') or [])
        if n['type']=='PrimitiveStringMultiline': vals=[prompt_text]
        if n['type']=='SaveImage': vals=[prefix]
        if n['type']=='RandomNoise' and seed is not None and vals: vals[0]=int(seed)
        for k,v in zip(widget_names.get(n['type'], []), vals):
            if k not in inputs: inputs[k]=v
        api[sid]={'class_type': n['type'], 'inputs': inputs}
    return api

def post_json(url, payload, timeout=30):
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url, data=data, headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors='replace')
        raise RuntimeError(f'ComfyUI HTTP {e.code} for {url}: {body[:4000]}') from e

def comfy_generate(endpoint, asset, seed=None, timeout=900):
    endpoint=endpoint.rstrip('/'); client=str(uuid.uuid4())
    prefix=f'nethack/{asset.categorySlug}/{asset.id}'
    api=workflow_to_api(asset.prompt, prefix, seed)
    resp=post_json(endpoint+'/prompt', {'prompt': api, 'client_id': client}, timeout=30)
    pid=resp.get('prompt_id')
    if not pid: raise RuntimeError(f'ComfyUI did not return prompt_id: {resp}')
    deadline=time.time()+timeout
    while time.time()<deadline:
        with urllib.request.urlopen(endpoint+'/history/'+pid, timeout=10) as r:
            hist=json.loads(r.read().decode())
        if pid in hist:
            outputs=hist[pid].get('outputs',{})
            images=[]
            for out in outputs.values(): images.extend(out.get('images',[]) or [])
            if images:
                return download_image(endpoint, images[-1], asset)
            raise RuntimeError(f'ComfyUI completed without image output for {asset.id}: {hist[pid].get("status")}')
        time.sleep(2)
    raise TimeoutError(f'Timed out waiting for ComfyUI prompt {pid} for {asset.id}')

def download_image(endpoint, img, asset):
    params=urllib.parse.urlencode({'filename': img['filename'], 'subfolder': img.get('subfolder',''), 'type': img.get('type','output')})
    out_dir=OUTPUT_DIR/asset.categorySlug; out_dir.mkdir(parents=True, exist_ok=True)
    out=out_dir/(asset.id+'.png')
    with urllib.request.urlopen(endpoint.rstrip()+'/view?'+params, timeout=60) as r: out.write_bytes(r.read())
    return out

def install_asset(src: Path, asset: Asset):
    dest=ELECTRON_GENERATED_DIR/asset.categorySlug/(asset.id+'.png')
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    cat_dir=ELECTRON_TILE_DIR/'by-category'/asset.categorySlug; cat_dir.mkdir(parents=True, exist_ok=True)
    link=cat_dir/(asset.id+'.png')
    if link.exists() or link.is_symlink(): link.unlink()
    try: link.symlink_to(Path('..')/'..'/'generated'/asset.categorySlug/(asset.id+'.png'))
    except OSError: shutil.copy2(src, link)
    asset.outputPath=str(src.relative_to(ROOT)); asset.installedPath=str(dest.relative_to(ROOT)); asset.status='installed'

def main():
    global WORKFLOW_PATH
    ap=argparse.ArgumentParser()
    ap.add_argument('--endpoint', default=os.environ.get('COMFYUI_ENDPOINT','http://127.0.0.1:8188'))
    ap.add_argument('--workflow', default=str(WORKFLOW_PATH), help='ComfyUI workflow JSON to use; default is the regular opaque/background workflow')
    ap.add_argument('--workflow-label', default='', help='Audit label recorded in generation-status for this workflow')
    ap.add_argument('--dry-run', action='store_true', help='plan only; does not contact ComfyUI unless --check-endpoint')
    ap.add_argument('--check-endpoint', action='store_true')
    ap.add_argument('--subset', type=int, default=0, help='first N assets after filters')
    ap.add_argument('--ids', help='comma-separated asset ids to process')
    ap.add_argument('--priority', action='append', help='filter priority, e.g. --priority P0')
    ap.add_argument('--full', action='store_true', help='allow all matching assets')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--seed', type=int)
    args=ap.parse_args()
    WORKFLOW_PATH = Path(args.workflow).expanduser().resolve()
    workflow_label = args.workflow_label or WORKFLOW_PATH.name
    workflow_record = str(WORKFLOW_PATH.relative_to(ROOT) if WORKFLOW_PATH.is_relative_to(ROOT) else WORKFLOW_PATH)
    assets=load_assets(); status=load_existing_status(); old=status.get('assets',{})
    for a in assets:
        prev=old.get(a.id,{})
        if prev.get('installedPath') and (ROOT/prev['installedPath']).exists():
            a.status='installed'; a.outputPath=prev.get('outputPath',''); a.installedPath=prev['installedPath']
    selected=assets
    if args.priority: selected=[a for a in selected if a.priority in set(args.priority)]
    if args.ids:
        wanted={x.strip() for x in args.ids.split(',') if x.strip()}; selected=[a for a in selected if a.id in wanted]
    if args.subset: selected=selected[:args.subset]
    elif not args.full and not args.dry_run:
        raise SystemExit('Refusing unbounded generation. Use --subset N or --full.')
    if args.dry_run:
        endpoint_status = None
        if args.check_endpoint:
            stats = check_comfy(args.endpoint)
            endpoint_status = {'endpoint': args.endpoint, 'comfyui_version': stats.get('system', {}).get('comfyui_version', 'unknown')}
        print(json.dumps({'count': len(assets), 'selected': [a.id for a in selected], 'workflow': workflow_record, 'workflowLabel': workflow_label, 'electronManifest': str(ELECTRON_MANIFEST_PATH), 'endpoint': endpoint_status}, indent=2))
        write_manifests(assets, status); return
    if args.check_endpoint or True:
        stats=check_comfy(args.endpoint); print('ComfyUI reachable:', stats.get('system',{}).get('comfyui_version','unknown'))
    for a in selected:
        if a.status=='installed' and not args.force:
            print('skip installed', a.id); continue
        print('generate', a.id, '-', a.name)
        rec={'status':'running','startedAt':time.strftime('%FT%TZ', time.gmtime()), 'prompt': a.prompt, 'workflow': workflow_record, 'workflowLabel': workflow_label}
        status.setdefault('assets',{})[a.id]=rec; write_manifests(assets,status)
        try:
            src=comfy_generate(args.endpoint, a, args.seed)
            install_asset(src,a)
            status['assets'][a.id]={**asdict(a), 'completedAt':time.strftime('%FT%TZ', time.gmtime()), 'workflow': workflow_record, 'workflowLabel': workflow_label}
            write_manifests(assets,status)
            print('installed', a.installedPath)
        except Exception as e:
            status['assets'][a.id]={**rec, 'status':'error', 'error':str(e), 'failedAt':time.strftime('%FT%TZ', time.gmtime())}
            write_manifests(assets,status)
            raise
    write_manifests(assets,status)
if __name__ == '__main__': main()
