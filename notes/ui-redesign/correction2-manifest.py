from pathlib import Path
import hashlib,json,datetime,struct
r=Path(__file__).resolve().parents[2]
e=r/'notes/ui-redesign'
previous=json.loads((e/'correction1-source-artifacts.json').read_text(encoding='utf-8-sig'))
old={x['path']:x for x in previous['records']}
allowed={'apps/venue-dashboard/src/components/OperationsRunbooks.tsx','apps/venue-dashboard/src/components/FinancialLedger.tsx'}
def record(name):
 p=r/name;data=p.read_bytes()
 result={'path':name,'sha256':hashlib.sha256(data).hexdigest(),'mtimeUtc':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(),'bytes':len(data)}
 if name in old:result['matchesCorrection1']=result['sha256']==old[name]['sha256']
 return result
scope=[record(name) for name in old if '/src/' in name or name=='apps/flutter-mobile/lib/parity_app.dart']
assert all(x['matchesCorrection1'] for x in scope if x['path'] not in allowed),'Out-of-scope source differs from correction1'
artifacts=[]
for app in ['venue-dashboard','mobile-app']:
 artifacts.extend(record(p.relative_to(r).as_posix()) for p in sorted((r/f'apps/{app}/dist').rglob('*')) if p.is_file())
artifacts.append(record('apps/flutter-mobile/build/app/outputs/flutter-apk/app-debug.apk'))
screens=[]
for name in ['ledger','void-dialog','void-outcome','audit-refund-outcomes']:
 rec=record(f'notes/ui-redesign/correction2-{name}.png');data=(r/rec['path']).read_bytes();rec.update({'width':struct.unpack('>II',data[16:24])[0],'height':struct.unpack('>II',data[16:24])[1],'url':'http://127.0.0.1:5173','provenance':'Existing installed Chrome headless, dedicated task profile, CDP device metrics1440x900 and Page.captureScreenshot; actual UI, unedited PNG'});screens.append(rec)
result={'recordedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requestedModel':'gpt-6.1-sol','clientIdentity':'not independently authenticated','round':'Correction2 copy-only; final independent verification/review pending','scopeChecks':scope,'artifacts':artifacts,'screenshots':screens,'priorChecks':'Correction1 web21/native9 attributed to that prior run; not rerun in correction2'}
(e/'correction2-source-artifacts.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'unchangedOtherCorrection1Sources':sum(x['matchesCorrection1'] for x in scope if x['path'] not in allowed),'apk':artifacts[-1],'mobileIndex':next(x for x in artifacts if x['path']=='apps/mobile-app/dist/index.html'),'dashboardIndex':next(x for x in artifacts if x['path']=='apps/venue-dashboard/dist/index.html'),'screenshotHashes':[{k:v for k,v in x.items() if k in ['path','sha256','width','height']} for x in screens]},indent=2))
