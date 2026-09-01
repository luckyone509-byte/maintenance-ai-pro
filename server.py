#!/usr/bin/env python3
import base64, html, io, json, os, re, subprocess, tempfile, sqlite3, uuid, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

import requests
from PIL import Image, ImageEnhance, ImageFilter
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get('MAINT_AI_HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', os.environ.get('MAINT_AI_PORT', '8080')))
MAX_BYTES = 20 * 1024 * 1024
UA = 'MaintenanceAIPro/1.0 (+production field diagnostic assistant)'
DB_PATH = Path(os.environ.get('MAINT_AI_DB', str(ROOT/'data'/'maintenance_ai.db')))
API_TOKEN = os.environ.get('MAINT_AI_API_TOKEN','').strip()
DB_LOCK = threading.Lock()

MFRS = {
 'ge': {'name':'GE Appliances','support':'https://www.geappliances.com/ge/service-and-support/literature.htm','domains':['geappliances.com']},
 'hotpoint': {'name':'Hotpoint / GE Appliances','support':'https://www.geappliances.com/ge/service-and-support/literature.htm','domains':['geappliances.com']},
 'frigidaire': {'name':'Frigidaire','support':'https://www.frigidaire.com/en/owner-center/product-support','domains':['frigidaire.com']},
 'electrolux': {'name':'Electrolux','support':'https://owner.electrolux.com/support','domains':['electrolux.com']},
 'whirlpool': {'name':'Whirlpool','support':'https://www.whirlpool.com/services/manuals.html','domains':['whirlpool.com']},
 'maytag': {'name':'Maytag','support':'https://www.maytag.com/services/manuals.html','domains':['maytag.com']},
 'amana': {'name':'Amana','support':'https://www.amana.com/services/manuals.html','domains':['amana.com']},
 'kitchenaid': {'name':'KitchenAid','support':'https://www.kitchenaid.com/service-and-support/manuals.html','domains':['kitchenaid.com']},
 'samsung': {'name':'Samsung','support':'https://www.samsung.com/us/support/downloads/','domains':['samsung.com']},
 'lg': {'name':'LG','support':'https://www.lg.com/us/support/manuals-documents','domains':['lg.com']},
 'bosch': {'name':'Bosch','support':'https://www.bosch-home.com/us/owner-support/manuals','domains':['bosch-home.com']},
 'carrier': {'name':'Carrier','support':'https://www.carrier.com/residential/en/us/products/manuals/','domains':['carrier.com']},
 'goodman': {'name':'Goodman','support':'https://www.goodmanmfg.com/resources/literature-library','domains':['goodmanmfg.com']},
 'daikin': {'name':'Daikin','support':'https://daikincomfort.com/resources/manuals','domains':['daikincomfort.com']},
 'trane': {'name':'Trane','support':'https://www.trane.com/residential/en/resources/owners-guides/','domains':['trane.com']},
 'rheem': {'name':'Rheem','support':'https://www.rheem.com/resource-center/','domains':['rheem.com']},
 'ruud': {'name':'Ruud','support':'https://www.ruud.com/resources/','domains':['ruud.com']},
 'lennox': {'name':'Lennox','support':'https://www.lennox.com/residential/owners/assistance/manuals','domains':['lennox.com']},
 'york': {'name':'YORK','support':'https://www.york.com/residential-equipment/resources','domains':['york.com']},
}
ALLOWED_MANUAL_DOMAINS = {d for v in MFRS.values() for d in v['domains']}



def db_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn=sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory=sqlite3.Row
    return conn

def init_db():
    with DB_LOCK, db_conn() as c:
        c.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          trade TEXT, complaint TEXT, manufacturer TEXT, model TEXT, serial TEXT, location TEXT,
          measurements_json TEXT NOT NULL DEFAULT '{}', observations TEXT, diagnosis_json TEXT,
          repair TEXT, verification TEXT, note TEXT, tech_sheet_name TEXT, source TEXT NOT NULL DEFAULT 'web'
        );
        CREATE INDEX IF NOT EXISTS idx_cases_model ON cases(model);
        CREATE INDEX IF NOT EXISTS idx_cases_trade ON cases(trade);
        CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at DESC);
        CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        c.execute("INSERT OR REPLACE INTO app_meta(key,value) VALUES('schema_version','1')")
        c.commit()

def row_case(r):
    d=dict(r)
    for col,out in [('measurements_json','measurements'),('diagnosis_json','diagnosis')]:
        raw=d.pop(col,None)
        try: d[out]=json.loads(raw) if raw else ({} if out=='measurements' else None)
        except Exception: d[out]={} if out=='measurements' else None
    d['timestamp']=d.get('created_at')
    d['techSheetName']=d.pop('tech_sheet_name',None)
    return d

def save_case_record(data):
    from datetime import datetime, timezone
    now=datetime.now(timezone.utc).isoformat()
    cid=str(data.get('id') or uuid.uuid4())
    vals=(cid, data.get('timestamp') or now, now, data.get('trade',''), data.get('complaint',''),
          data.get('manufacturer',''), data.get('model',''), data.get('serial',''), data.get('location',''),
          json.dumps(data.get('measurements') or {},ensure_ascii=False), data.get('observations',''),
          json.dumps(data.get('diagnosis'),ensure_ascii=False) if data.get('diagnosis') is not None else None,
          data.get('repair',''), data.get('verification',''), data.get('note',''), data.get('techSheetName',''), 'web')
    with DB_LOCK, db_conn() as c:
        c.execute("""INSERT INTO cases(id,created_at,updated_at,trade,complaint,manufacturer,model,serial,location,measurements_json,observations,diagnosis_json,repair,verification,note,tech_sheet_name,source)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, trade=excluded.trade, complaint=excluded.complaint, manufacturer=excluded.manufacturer, model=excluded.model, serial=excluded.serial, location=excluded.location, measurements_json=excluded.measurements_json, observations=excluded.observations, diagnosis_json=excluded.diagnosis_json, repair=excluded.repair, verification=excluded.verification, note=excluded.note, tech_sheet_name=excluded.tech_sheet_name""", vals)
        c.commit()
        r=c.execute('SELECT * FROM cases WHERE id=?',(cid,)).fetchone()
    return row_case(r)

def list_case_records(limit=200):
    limit=max(1,min(int(limit or 200),1000))
    with DB_LOCK, db_conn() as c:
        rows=c.execute('SELECT * FROM cases ORDER BY created_at DESC LIMIT ?',(limit,)).fetchall()
    return [row_case(r) for r in rows]

def import_case_records(items):
    saved=[]
    for item in items or []:
        if isinstance(item,dict): saved.append(save_case_record(item))
    return saved


def jdump(obj): return json.dumps(obj, ensure_ascii=False).encode('utf-8')

def host_allowed(hostname):
    host=(hostname or '').lower().strip('.')
    return any(host==d or host.endswith('.'+d) for d in ALLOWED_MANUAL_DOMAINS)

def data_bytes(data_url):
    if ',' in data_url: data_url=data_url.split(',',1)[1]
    raw=base64.b64decode(data_url)
    if len(raw)>MAX_BYTES: raise ValueError('File too large')
    return raw

def norm_id(s): return re.sub(r'[^A-Z0-9]','',str(s or '').upper())

def parse_asset(text):
    t=' '.join(str(text or '').replace('\r','\n').split())
    mfr=''
    for key,meta in MFRS.items():
        if key.lower() in t.lower() or meta['name'].split()[0].lower() in t.lower(): mfr=meta['name']; break
    model=''; serial=''
    pats_model=[r'(?:MODEL|MOD|MODEL NO\.?|M/N)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,24})',r'\b([A-Z]{2,5}[0-9][A-Z0-9-]{4,18})\b']
    pats_serial=[r'(?:SERIAL|SER|SERIAL NO\.?|S/N)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{4,28})']
    for p in pats_model:
        x=re.search(p,t,re.I)
        if x: model=x.group(1).strip('.,;'); break
    for p in pats_serial:
        x=re.search(p,t,re.I)
        if x: serial=x.group(1).strip('.,;'); break
    return {'manufacturer':mfr,'model':model,'serial':serial}

def ocr_image(raw):
    img=Image.open(io.BytesIO(raw)).convert('L')
    img=ImageEnhance.Contrast(img).enhance(1.8)
    img=img.filter(ImageFilter.SHARPEN)
    with tempfile.NamedTemporaryFile(suffix='.png',delete=False) as f:
        img.save(f.name); name=f.name
    try:
        p=subprocess.run(['tesseract',name,'stdout','--psm','6'],capture_output=True,text=True,timeout=30)
        if p.returncode: raise RuntimeError(p.stderr.strip() or 'OCR failed')
        return p.stdout
    finally:
        try: os.unlink(name)
        except OSError: pass

def pdf_text(raw):
    reader=PdfReader(io.BytesIO(raw)); pages=[]
    for i,p in enumerate(reader.pages,1):
        txt=p.extract_text() or ''
        pages.append(f'\n--- PAGE {i} ---\n{txt}')
    return ''.join(pages), len(reader.pages)

def manual_source(mfr):
    x=(mfr or '').lower()
    for k,v in MFRS.items():
        if k in x or v['name'].lower() in x: return v
    return None

def unwrap_ddg(url):
    try:
        if 'duckduckgo.com/l/' in url:
            qs=parse_qs(urlparse(url).query)
            if qs.get('uddg'): return unquote(qs['uddg'][0])
    except Exception: pass
    return url

def search_web(query, limit=8):
    """Best-effort public web search. No API key required; callers must support graceful failure."""
    r=requests.get('https://html.duckduckgo.com/html/', params={'q':query}, headers={'User-Agent':UA}, timeout=12)
    r.raise_for_status()
    body=r.text
    pat=re.compile(r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',re.I|re.S)
    out=[]
    for href,title in pat.findall(body):
        href=html.unescape(unwrap_ddg(href))
        title=re.sub(r'<[^>]+>',' ',html.unescape(title)); title=re.sub(r'\s+',' ',title).strip()
        if href.startswith('//'): href='https:'+href
        if href.startswith('http'): out.append({'url':href,'title':title})
        if len(out)>=limit: break
    return out

def candidate_score(item, model, src):
    u=item.get('url',''); title=item.get('title',''); host=(urlparse(u).hostname or '').lower(); blob=f'{u} {title}'.lower()
    score=0; reasons=[]; model_n=norm_id(model); blob_n=norm_id(blob)
    official=bool(src and any(host==d or host.endswith('.'+d) for d in src['domains']))
    if official: score+=35; reasons.append('official manufacturer domain')
    if model_n and model_n in blob_n: score+=35; reasons.append('exact model appears in result')
    elif model and len(model)>=5 and norm_id(model[:5]) in blob_n: score+=12; reasons.append('model-family prefix appears')
    if '.pdf' in u.lower(): score+=15; reasons.append('direct PDF candidate')
    if any(k in blob for k in ('service manual','tech sheet','mini manual','service data','wiring diagram')): score+=10; reasons.append('service-document wording')
    if any(k in blob for k in ('owner manual','user manual','use and care')): score-=8; reasons.append('appears consumer-facing')
    return max(0,min(95,score)),reasons,official

def discover_manuals(mfr, model):
    src=manual_source(mfr)
    if not src: return {'official':None,'candidates':[],'search_available':False,'message':'Manufacturer is not mapped yet.'}
    queries=[]
    for domain in src['domains']:
        queries += [
            f'site:{domain} "{model}" "service manual" pdf',
            f'site:{domain} "{model}" "tech sheet" pdf',
            f'site:{domain} "{model}" "wiring diagram" pdf',
        ]
    seen=set(); candidates=[]; search_ok=False; errors=[]
    for q in queries:
        try:
            results=search_web(q,limit=6); search_ok=True
        except Exception as e:
            errors.append(str(e)); continue
        for x in results:
            url=x['url'];
            if url in seen: continue
            seen.add(url)
            score,reasons,official=candidate_score(x,model,src)
            if official or score>=35:
                candidates.append({**x,'score':score,'reasons':reasons,'official':official,'direct_pdf':'.pdf' in url.lower()})
    candidates.sort(key=lambda x:(x['score'],x['direct_pdf']),reverse=True)
    return {'official':src,'candidates':candidates[:12],'search_available':search_ok,'errors':errors[:2]}

def fetch_official_pdf(url):
    u=urlparse(url)
    if u.scheme!='https' or not host_allowed(u.hostname):
        raise ValueError('Only HTTPS PDFs from recognized manufacturer domains can be auto-fetched.')
    r=requests.get(url,timeout=20,headers={'User-Agent':UA},allow_redirects=True)
    r.raise_for_status()
    if not host_allowed(urlparse(r.url).hostname): raise ValueError('Redirect left the recognized manufacturer domain.')
    if len(r.content)>MAX_BYTES: raise ValueError('PDF too large')
    ctype=r.headers.get('content-type','')
    if 'pdf' not in ctype.lower() and not r.url.lower().split('?')[0].endswith('.pdf'):
        raise ValueError('Candidate did not return a PDF.')
    return r.content,r.url

def verify_pdf(url, manufacturer, model):
    raw,final_url=fetch_official_pdf(url)
    text,pages=pdf_text(raw)
    model_n=norm_id(model); text_n=norm_id(text)
    exact=bool(model_n and model_n in text_n)
    prefix=bool(model_n and len(model_n)>=5 and model_n[:5] in text_n)
    score=40 # official fetch already established
    reasons=['retrieved from recognized manufacturer domain']
    if exact: score+=50; reasons.append('exact model appears inside PDF')
    elif prefix: score+=20; reasons.append('model-family prefix appears inside PDF')
    service_terms=sum(1 for x in ['service','diagnostic','wiring','error code','test mode','tech sheet'] if x in text.lower())
    score+=min(10,service_terms*2)
    if service_terms: reasons.append('service/diagnostic content detected')
    verified=exact
    return {'verified':verified,'score':min(100,score),'reasons':reasons,'text':text,'pages':pages,'characters':len(text),'source_url':final_url}



def _tokens(s):
    return {x for x in re.findall(r'[a-z0-9]{3,}', str(s or '').lower()) if x not in {'the','and','for','with','this','that','from','into','then','when','unit','system'}}

def manual_evidence(text, query, limit=4):
    if not text or not query: return []
    q=_tokens(query)
    chunks=re.split(r'(?=\n--- PAGE \d+ ---\n)', text)
    scored=[]
    for ch in chunks:
        pm=re.search(r'--- PAGE (\d+) ---',ch)
        page=int(pm.group(1)) if pm else None
        body=re.sub(r'\n--- PAGE \d+ ---\n',' ',ch).strip()
        bt=_tokens(body)
        score=len(q & bt)
        if score:
            # choose sentence/window containing most query terms
            sentences=re.split(r'(?<=[.!?])\s+|\n+',body)
            best=max(sentences, key=lambda x: len(q & _tokens(x)), default=body)
            best=re.sub(r'\s+',' ',best).strip()
            if len(best)>420: best=best[:417]+'...'
            scored.append({'page':page,'score':score,'excerpt':best})
    scored.sort(key=lambda x:x['score'],reverse=True)
    return scored[:limit]

def history_evidence(history, complaint, trade, model, limit=3):
    q=_tokens(' '.join([complaint or '', trade or '', model or '']))
    out=[]
    for case in history or []:
        blob=' '.join([str(case.get('complaint','')),str(case.get('trade','')),str(case.get('model','')),str((case.get('diagnosis') or {}).get('title',''))])
        ct=_tokens(blob); union=q|ct
        sim=(len(q&ct)/len(union)) if union else 0
        if model and case.get('model') and norm_id(model)==norm_id(case.get('model')): sim+=0.35
        if trade and case.get('trade')==trade: sim+=0.1
        if sim>0.08:
            out.append({'score':round(min(sim,1)*100),'complaint':case.get('complaint',''),'diagnosis':(case.get('diagnosis') or {}).get('title',''),'model':case.get('model',''),'timestamp':case.get('timestamp','')})
    out.sort(key=lambda x:x['score'],reverse=True)
    return out[:limit]

def evidence_analysis(data):
    trade=data.get('trade','Other'); complaint=data.get('complaint',''); m=data.get('measurements') or {}; manual=data.get('manual_text',''); history=data.get('history') or []; model=data.get('model','')
    candidates=[]
    def add(title,base,support,missing,next_test,disproof,keywords=''):
        manual_hits=manual_evidence(manual, ' '.join([title, complaint, keywords]), 3)
        hist_hits=history_evidence(history, complaint, trade, model, 3)
        manual_bonus=min(10, sum(3 for h in manual_hits if h['score']>=2))
        hist_bonus=min(8, sum(3 for h in hist_hits if h['score']>=35))
        score=min(97,base+manual_bonus+hist_bonus)
        candidates.append({'title':title,'confidence':score,'support':support,'missing':missing,'next_test':next_test,'disproof':disproof,'manual_evidence':manual_hits,'history_evidence':hist_hits,'confidence_components':{'field_evidence':base,'manual_bonus':manual_bonus,'history_bonus':hist_bonus}})
    def n(k):
        try:return float(m[k])
        except:return None
    if trade=='HVAC':
        sh,sc,dt,run,rla,stat,lo,hi=n('superheat'),n('subcooling'),n('delta_t'),n('running_amps'),n('rla'),n('static_pressure'),n('low_psig'),n('high_psig')
        drier_in,drier_out,drier_dt=n('drier_in_temp'),n('drier_out_temp'),n('drier_delta_t')
        if drier_dt is None and drier_in is not None and drier_out is not None:
            drier_dt=abs(drier_in-drier_out)
        if sh is not None and sc is not None:
            if sh>=20 and sc<=5: add('Likely low refrigerant charge / refrigerant loss',78,[f'High superheat: {sh:g}°F',f'Low subcooling: {sc:g}°F'],['Airflow verification','Leak confirmation / charge verification'],'Confirm airflow, leak-search, then verify charge using manufacturer method.','Normal airflow plus verified correct charge disproves low charge.','low charge leak superheat subcooling refrigerant')
            if sh>=20 and sc>=15:
                drier_confirmed=drier_dt is not None and drier_dt>=3
                support=[f'High superheat: {sh:g}°F',f'High subcooling: {sc:g}°F']
                if drier_dt is not None: support.append(f'Filter-drier temperature drop: {drier_dt:g}°F')
                add(
                    'Likely restricted liquid-line filter drier' if drier_confirmed else 'Likely liquid-line / metering-device restriction',
                    92 if drier_confirmed else 84,
                    support,
                    ['Confirm temperature drop with secure, insulated probe contact'] if drier_confirmed else ([f'Filter-drier drop is only {drier_dt:g}°F — check the metering device'] if drier_dt is not None else ['Filter-drier inlet and outlet temperatures']),
                    'Repeat the filter-drier inlet/outlet test with stabilized probes, then confirm metering-device feed before opening the system.' if drier_confirmed else 'Measure filter-drier inlet/outlet temperatures and inspect metering-device feed.',
                    'A repeatable drop below 3°F with normal metering-device feed argues against a filter-drier restriction.' if drier_confirmed else 'No abnormal temperature/pressure drop and normal metering feed argue against restriction.',
                    'restriction filter drier temperature drop txv piston metering device'
                )
            if sh<=5 and sc>=15: add('Possible overcharge or evaporator overfeeding',70,[f'Low superheat: {sh:g}°F',f'High subcooling: {sc:g}°F'],['Airflow / indoor load','Manufacturer charging target'],'Verify airflow and indoor load before correcting charge.','Correct weighed charge with normal airflow shifts suspicion to metering-device overfeed.','overcharge overfeeding low superheat')
            if sh<=5 and 7<=sc<15: add('Low superheat — check low airflow / low heat load before refrigerant adjustment',72,[f'Low superheat: {sh:g}°F',f'Subcooling is not low: {sc:g}°F'],['Measured airflow or total external static','Indoor return/supply temperatures','Metering-device type/target superheat'],'Verify filter, evaporator condition, blower speed/operation and total external static; then confirm target superheat for the installed metering device.','Normal verified airflow and a manufacturer-consistent superheat target shift suspicion toward metering-device overfeed.','low superheat frozen evaporator airflow piston overfeed')
        if drier_dt is not None and drier_dt>=3 and not (sh is not None and sc is not None and sh>=20 and sc>=15):
            add('Possible liquid-line filter-drier restriction',76,[f'Filter-drier temperature drop: {drier_dt:g}°F'],['Stabilized superheat and subcooling'],'Confirm probe contact, record stabilized superheat/subcooling, and inspect metering-device feed.','A repeatable drop below 3°F with normal refrigerant feeding argues against a filter-drier restriction.','filter drier restriction temperature drop')
        if stat is not None and stat>0.8: add('High external static pressure / airflow restriction',82,[f'Total external static: {stat:g} in. w.c.'],['Equipment maximum rated static'],'Inspect filter, evaporator, return/supply restrictions and blower setup.','Static within rated maximum with verified airflow disproves excessive-static diagnosis.','static pressure airflow blower filter coil')
        if run is not None and rla is not None and run<rla*.45:
            support=[f'Running amps {run:g} A vs RLA {rla:g} A']
            if lo is not None and hi is not None: support.append(f'Pressure differential: {hi-lo:g} psi')
            add('Possible weak / non-pumping compressor',73,support,['Need compression differential/equalization evidence'],'Compare suction/discharge differential and observe equalization after shutdown.','Normal differential and capacity disprove a pumping failure.','compressor weak valves equalization amp draw')
        if dt is not None and dt<14: add('Low cooling capacity — cause not yet isolated',50,[f'Low temperature split: {dt:g}°F'],['Need airflow + refrigeration correlation'],'Correlate airflow/static with SH, SC, saturation temperatures and compressor amps.','Stable normal ΔT under normal load reduces likelihood of capacity fault.','delta t capacity airflow refrigerant')
    elif trade=='Electrical':
        hn,hg,ng=n('hot_neutral'),n('hot_ground'),n('neutral_ground')
        if hn is not None and hg is not None and hn<20 and hg>100:
            add('Likely open / loose neutral',88,[f'Hot-neutral: {hn:g} V',f'Hot-ground: {hg:g} V'],['Upstream neutral integrity'],'Trace the neutral upstream and inspect terminations/voltage drop.','Normal hot-neutral voltage with a solid neutral path disproves an open neutral.','open neutral loose neutral voltage')
    elif trade=='Water Heater':
        la=n('lower_amps')
        if la is not None and la<1:
            add('Lower element is not drawing current',78,[f'Lower element current: {la:g} A'],['Voltage at element during an active call','Element resistance with power off'],'Verify 240 V at the lower element during a lower-element call, then ohm the element power-off.','Expected voltage and normal current during an active call disprove the fault.','lower element thermostat 240 resistance')
    if not candidates:
        add(f'Insufficient evidence for a confident {trade} diagnosis',30,[f'{len(m)} measurement(s) recorded' if m else 'Complaint documented'],['More discriminating test data'],'Capture the next measurement that separates the leading failure modes.','Not applicable until a specific diagnosis is supported.',complaint)
    candidates.sort(key=lambda x:x['confidence'],reverse=True)
    return {'ranked_diagnoses':candidates[:3],'manual_available':bool(manual.strip()),'history_cases_considered':len(history)}


def parse_field_language(text):
    """Extract common maintenance readings from free-form field speech/text."""
    import re
    t = (text or "").lower()
    patterns = {
        "low_psig": [r"(?:suction|low side|low)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)\s*(?:psi|psig)?", r"(-?\d+(?:\.\d+)?)\s*(?:psi|psig)?\s*(?:suction|low side)"],
        "high_psig": [r"(?:head|high side|discharge|high)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)\s*(?:psi|psig)?", r"(-?\d+(?:\.\d+)?)\s*(?:psi|psig)?\s*(?:head|high side|discharge)"],
        "superheat": [r"(?:superheat|super heat|\bsh\b)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)", r"(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)?\s*(?:superheat|super heat|\bsh\b)"],
        "subcooling": [r"(?:subcooling|sub cooling|subcool|\bsc\b)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)", r"(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)?\s*(?:subcooling|sub cooling|subcool|\bsc\b)"],
        "delta_t": [r"(?:delta\s*t|temperature split|temp split)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "running_amps": [r"(?:running amps|compressor amps|amp draw|amps)\s*(?:is|are|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "rla": [r"(?:rla)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "lra": [r"(?:lra)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "return_temp": [r"(?:return air|return temp)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "supply_temp": [r"(?:supply air|supply temp)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "static_pressure": [r"(?:static pressure|tesp|total external static)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "drier_in_temp": [r"(?:filter[ -]?drier|drier)\s*(?:inlet|in)\s*(?:temperature|temp)?\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "drier_out_temp": [r"(?:filter[ -]?drier|drier)\s*(?:outlet|out)\s*(?:temperature|temp)?\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "drier_delta_t": [r"(?:filter[ -]?drier|drier)\s*(?:temperature|temp)?\s*(?:drop|delta\s*t)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
        "voltage": [r"(?:voltage|supply voltage)\s*(?:is|at|=|:)?\s*(-?\d+(?:\.\d+)?)"],
    }
    out = {}
    for key, pats in patterns.items():
        for pat in pats:
            m = re.search(pat, t)
            if m:
                try: out[key] = float(m.group(1))
                except: pass
                break
    return out

def senior_tech_analysis(data):
    text = data.get("text","")
    trade = data.get("trade","HVAC")
    incoming = data.get("measurements") or {}
    parsed = parse_field_language(text)
    merged = dict(incoming)
    merged.update(parsed)
    try:
        if 'drier_delta_t' not in merged and 'drier_in_temp' in merged and 'drier_out_temp' in merged:
            merged['drier_delta_t']=abs(float(merged['drier_in_temp'])-float(merged['drier_out_temp']))
    except (TypeError, ValueError):
        pass

    payload = {
        "trade": trade,
        "complaint": " ".join(x for x in [data.get("complaint",""), text] if x).strip(),
        "manufacturer": data.get("manufacturer",""),
        "model": data.get("model",""),
        "serial": data.get("serial",""),
        "measurements": merged,
        "observations": data.get("observations",""),
        "manual_text": data.get("manual_text",""),
        "history": data.get("history") or []
    }
    result = evidence_analysis(payload)
    ranked = result.get("ranked_diagnoses") or []
    best = ranked[0] if ranked else {
        "title": f"Insufficient evidence for a confident {trade} diagnosis",
        "confidence": 25, "support": [], "missing": ["More field evidence is required"],
        "next_test": "Capture the next discriminating measurement.",
        "disproof": "No specific diagnosis is supported yet.",
        "manual_evidence": []
    }

    challenges = list(best.get("missing") or [])
    txt = text.lower()
    if any(w in txt for w in ["definitely", "has to be", "must be", "i know it is", "bad compressor", "low on freon", "low refrigerant"]):
        challenges.insert(0, "Do not lock onto the first suspected component until a measurement separates it from the main alternatives.")
    if trade == "HVAC" and ("freeze" in txt or "frozen" in txt) and not any(k in merged for k in ("static_pressure","delta_t")):
        challenges.append("Freeze-up complaint needs airflow evidence before refrigerant adjustment.")
    if trade == "HVAC" and not all(k in merged for k in ("superheat","subcooling")):
        challenges.append("Refrigerant diagnosis is stronger when superheat and subcooling are interpreted together.")

    manual_hits = best.get("manual_evidence") or []
    response = (
        f"My primary call is: {best.get('title')}. "
        f"Confidence is {best.get('confidence',0)}%. "
        f"The next measurement I want is: {best.get('next_test')}"
    )
    return {
        "ok": True,
        "parsed_measurements": parsed,
        "merged_measurements": merged,
        "verdict": best.get("title"),
        "confidence": best.get("confidence",0),
        "response": response,
        "support": best.get("support") or [],
        "challenge": challenges[:6],
        "next_test": best.get("next_test",""),
        "disproof": best.get("disproof",""),
        "manual_evidence": manual_hits[:4],
        "ranked_diagnoses": ranked[:3]
    }



def _tokens(text):
    import re
    return set(x for x in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(x) > 2)

def _norm_asset(x):
    import re
    return re.sub(r"[^A-Z0-9]","",(x or "").upper())

def case_similarity(current, past):
    score=0.0; reasons=[]
    cm=_norm_asset(current.get("model","")); pm=_norm_asset(past.get("model",""))
    cb=(current.get("manufacturer") or "").lower(); pb=(past.get("manufacturer") or "").lower()
    if cm and pm and cm==pm:
        score+=45; reasons.append("Exact model match")
    elif cm and pm and (cm.startswith(pm[:6]) or pm.startswith(cm[:6])) and min(len(cm),len(pm))>=6:
        score+=25; reasons.append("Same model family")
    if cb and pb and cb==pb:
        score+=10; reasons.append("Same manufacturer")
    if current.get("trade") and current.get("trade")==past.get("trade"):
        score+=8; reasons.append("Same trade/system")
    ct=_tokens(" ".join([current.get("complaint",""),current.get("observations","")]))
    pt=_tokens(" ".join([past.get("complaint",""),past.get("observations",""),past.get("note","")]))
    if ct and pt:
        overlap=len(ct & pt)/max(1,len(ct | pt))
        pts=min(20,overlap*60)
        if pts>=3: reasons.append("Similar complaint/symptoms")
        score+=pts
    cd=(current.get("diagnosis") or {}).get("title","").lower()
    pd=(past.get("diagnosis") or {}).get("title","").lower()
    if cd and pd:
        a=_tokens(cd); b=_tokens(pd)
        if a and b:
            ov=len(a&b)/max(1,len(a|b))
            pts=min(12,ov*30); score+=pts
            if pts>=4: reasons.append("Similar diagnosis")
    cmets=current.get("measurements") or {}; pmets=past.get("measurements") or {}
    comparable=0; close=0
    for k,v in cmets.items():
        if k in pmets:
            try:
                a=float(v); b=float(pmets[k]); comparable+=1
                tolerance=max(abs(a)*0.18,3)
                if abs(a-b)<=tolerance: close+=1
            except: pass
    if comparable:
        pts=10*(close/comparable); score+=pts
        if close: reasons.append(f"{close}/{comparable} comparable readings are close")
    return min(100,round(score)),reasons

def field_case_intelligence(data):
    current=data.get("current") or {}
    history=data.get("history") or []
    ranked=[]
    for c in history:
        score,reasons=case_similarity(current,c)
        if score>=10:
            ranked.append({"score":score,"reasons":reasons,"case":c})
    ranked.sort(key=lambda x:x["score"],reverse=True)
    top=ranked[:5]
    outcomes={}
    for x in ranked:
        c=x["case"]
        repair=(c.get("repair") or "").strip()
        if repair and x["score"]>=25:
            key=repair.lower()
            outcomes.setdefault(key,{"repair":repair,"count":0,"best_score":0,"examples":[]})
            outcomes[key]["count"]+=1
            outcomes[key]["best_score"]=max(outcomes[key]["best_score"],x["score"])
            outcomes[key]["examples"].append(c.get("id"))
    outcome_list=sorted(outcomes.values(),key=lambda x:(x["count"],x["best_score"]),reverse=True)[:5]
    suggestion="Not enough matching repair history yet."
    if outcome_list:
        o=outcome_list[0]
        suggestion=f"The strongest historical repair pattern is: {o['repair']} It appears in {o['count']} relevant saved case(s). Treat this as supporting history, not proof; confirm with current measurements."
    repeat="No repeated model-specific failure pattern yet."
    exact=[x for x in ranked if "Exact model match" in x["reasons"] and (x["case"].get("repair") or "").strip()]
    if len(exact)>=2:
        repairs={}
        for x in exact:
            r=x["case"].get("repair","").strip()
            repairs[r]=repairs.get(r,0)+1
        r,n=max(repairs.items(),key=lambda kv:kv[1])
        if n>=2: repeat=f"This exact model has {n} saved matching cases where the recorded repair was: {r}"
    return {"ok":True,"matches":top,"total_matches":len(ranked),"outcomes":outcome_list,"suggestion":suggestion,"repeat_pattern":repeat}


class Handler(SimpleHTTPRequestHandler):
    def _authorized(self):
        if not API_TOKEN: return True
        auth=self.headers.get('Authorization','')
        return auth == 'Bearer '+API_TOKEN
    def translate_path(self,path):
        path=urlparse(path).path; rel=unquote(path).lstrip('/') or 'index.html'
        target=(ROOT/rel).resolve()
        try: target.relative_to(ROOT.resolve())
        except ValueError: return str(ROOT/'__blocked__')
        return str(target)
    def _json(self,status,obj):
        body=jdump(obj); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u=urlparse(self.path)
        if u.path=='/api/health': return self._json(200,{'ok':True,'product':'Maintenance AI Pro','version':'1.0.0','database':'sqlite','database_path':str(DB_PATH),'ocr':'tesseract','pdf':'pypdf','manual_discovery':'best-effort web search + official-domain verification','evidence_engine':'field readings + verified manual excerpts + persistent repair history'})
        if u.path.startswith('/api/') and not self._authorized(): return self._json(401,{'ok':False,'error':'Unauthorized'})
        if u.path=='/api/cases':
            q=parse_qs(u.query); limit=(q.get('limit') or ['200'])[0]
            return self._json(200,{'ok':True,'cases':list_case_records(limit),'persistent':True})
        return super().do_GET()
    def do_POST(self):
        try:
            if urlparse(self.path).path.startswith('/api/') and not self._authorized(): return self._json(401,{'ok':False,'error':'Unauthorized'})
            n=int(self.headers.get('Content-Length','0'))
            if n<=0 or n>MAX_BYTES*2: raise ValueError('Invalid request size')
            data=json.loads(self.rfile.read(n)); path=urlparse(self.path).path
            if path=='/api/cases':
                return self._json(200,{'ok':True,'case':save_case_record(data),'persistent':True})
            if path=='/api/cases/import':
                items=data.get('cases') if isinstance(data,dict) else []
                saved=import_case_records(items)
                return self._json(200,{'ok':True,'imported':len(saved)})
            if path=='/api/evidence/analyze':
                return self._json(200,{'ok':True,**evidence_analysis(data)})
            if path=='/api/senior-tech':
                return self._json(200,senior_tech_analysis(data))
            if path=='/api/case-intelligence':
                return self._json(200,field_case_intelligence(data))
            if path=='/api/ocr':
                raw=data_bytes(data.get('image','')); text=ocr_image(raw); return self._json(200,{'ok':True,'text':text,'asset':parse_asset(text)})
            if path=='/api/manual/index':
                raw=data_bytes(data.get('pdf','')); text,pages=pdf_text(raw); return self._json(200,{'ok':True,'text':text,'pages':pages,'characters':len(text)})
            if path=='/api/manual/fetch':
                raw,final_url=fetch_official_pdf(data.get('url','')); text,pages=pdf_text(raw)
                return self._json(200,{'ok':True,'text':text,'pages':pages,'characters':len(text),'source_url':final_url})
            if path=='/api/manual/discover':
                mfr=data.get('manufacturer','').strip(); model=data.get('model','').strip()
                if not model: return self._json(400,{'ok':False,'error':'Model number is required.'})
                result=discover_manuals(mfr,model)
                return self._json(200,{'ok':True,'model':model,**result,'verification':'A candidate is authoritative only after exact model coverage is verified inside the document.'})
            if path=='/api/manual/verify':
                url=data.get('url','').strip(); model=data.get('model','').strip(); manufacturer=data.get('manufacturer','').strip()
                if not url or not model: return self._json(400,{'ok':False,'error':'URL and model number are required.'})
                result=verify_pdf(url,manufacturer,model)
                return self._json(200,{'ok':True,**result})
            if path=='/api/service/discover':
                mfr=data.get('manufacturer',''); model=data.get('model','').strip(); src=manual_source(mfr); exact=model or 'MODEL'
                qs=[f'{mfr} "{exact}" service manual filetype:pdf',f'{mfr} "{exact}" tech sheet mini manual filetype:pdf',f'{mfr} "{exact}" wiring diagram filetype:pdf',f'{mfr} "{exact}" parts diagram']
                return self._json(200,{'ok':True,'official':src,'queries':qs,'verification':'Confirm exact model-family coverage and serial/revision applicability before treating service data as authoritative.'})
            return self._json(404,{'ok':False,'error':'Unknown API endpoint'})
        except ValueError as e: return self._json(400,{'ok':False,'error':str(e)})
        except Exception as e: return self._json(500,{'ok':False,'error':str(e)})

if __name__=='__main__':
    init_db()
    os.chdir(ROOT)
    print(f'Maintenance AI Pro 1.0 running at http://{HOST}:{PORT}')
    print(f'Database: {DB_PATH}')
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
