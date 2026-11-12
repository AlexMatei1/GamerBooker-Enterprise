from pathlib import Path
import hashlib,json,datetime
r=Path(__file__).resolve().parents[2]
sources=[
'apps/mobile-app/src/App.tsx','apps/mobile-app/src/api/client.ts','apps/mobile-app/src/types/mobile.ts','apps/mobile-app/src/utils/demoTime.ts',
'apps/mobile-app/src/components/SeatPicker.tsx','apps/mobile-app/src/components/BookingCheckout.tsx','apps/mobile-app/src/components/ActivePassView.tsx','apps/mobile-app/src/components/BarOrderingView.tsx','apps/mobile-app/src/services/realtime.ts',
'apps/venue-dashboard/src/api/client.ts','apps/venue-dashboard/src/services/realtime.ts','apps/venue-dashboard/src/components/LiveFloorView.tsx','apps/venue-dashboard/src/components/BarBoard.tsx','apps/venue-dashboard/src/components/FinancialLedger.tsx','apps/venue-dashboard/src/components/OperationsRunbooks.tsx','apps/venue-dashboard/src/components/StationClientShell.tsx',
'apps/flutter-mobile/lib/parity_app.dart']
artifacts=['apps/mobile-app/dist/index.html','apps/venue-dashboard/dist/index.html','apps/flutter-mobile/build/app/outputs/flutter-apk/app-debug.apk']
records=[]
for name in sources+artifacts:
 p=r/name;records.append({'path':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mtimeUtc':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(),'bytes':p.stat().st_size})
result={'recordedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requestedModel':'gpt-6.1-sol','clientIdentity':'not independently authenticated','records':records}
(r/'notes/ui-redesign/correction1-source-artifacts.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps([record for record in records if record['path'].endswith('.apk')]))
