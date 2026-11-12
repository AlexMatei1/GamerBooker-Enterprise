import subprocess as sp, xml.etree.ElementTree as ET, re, json, time, hashlib
from pathlib import Path
root=Path(__file__).resolve().parent
workspace=root.parents[1]
adb=['adb','-s','CNXNU20922109640']
apk=workspace/'apps/flutter-mobile/build/app/outputs/flutter-apk/app-debug.apk'
def run(*args):return sp.check_output(adb+list(args),timeout=20)
def tree():
    run('shell','uiautomator','dump','/sdcard/ui-redesign-correction1.xml')
    return ET.fromstring(run('shell','cat','/sdcard/ui-redesign-correction1.xml'))
def label(n):return n.attrib.get('text') or n.attrib.get('content-desc','')
def text(t=None):return '\n'.join(label(n) for n in (t if t is not None else tree()).iter('node'))
def tap(n):
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.attrib['bounds']));run('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
def click(name,contains=False,scroll=False):
    for attempt in range(5 if scroll else 1):
        nodes=[n for n in tree().iter('node') if (name in label(n) if contains else name==label(n))]
        if nodes:tap(nodes[0]);tree();return
        if scroll:run('shell','input','swipe','550','1750','550','850','300')
    raise RuntimeError('Missing native control: '+name)
def shot(name): (root/('correction1-native-'+name+'.png')).write_bytes(run('exec-out','screencap','-p'))
def top():run('shell','input','swipe','550','700','550','1800','300');tree();run('shell','input','swipe','550','700','550','1800','300');tree()
checks=[]
def check(name,condition):
    checks.append({'name':name,'result':'PASS' if condition else 'FAIL'})
    if not condition:raise RuntimeError(name)
install=sp.Popen(adb+['install','-r',str(apk)],stdout=sp.PIPE,stderr=sp.STDOUT)
try:
    for attempt in range(15):
        if install.poll() is not None:break
        current=tree()
        for n in current.iter('node'):
            if label(n) in ['CONTINUARE','INSTALAȚI ORICUM']:
                shot('one-time-installer');tap(n);break
    if install.poll() is None:raise RuntimeError('One update install still pending; no duplicate launched')
    output=install.communicate(timeout=5)[0].decode(errors='replace')
    check('Current-source update install Success',install.returncode==0 and 'Success' in output)
    run('shell','am','start','-n','ro.gamerbooker.app.preview/ro.gamerbooker.app.MainActivity')
    for attempt in range(5):
        current=tree()
        opened=False
        for n in current.iter('node'):
            if label(n)=='DESCHIDEȚI':tap(n);opened=True;break
        if 'GamerBooker.' in text(current):break
        time.sleep(.3)
    check('Flutter preview opened', 'GamerBooker.' in text())
    shot('explore')
    click('CyberSphere Esports Cluj',contains=True,scroll=True);shot('cluj-details');click('Alege un loc →')
    check('Cluj reserve own selection', 'CyberSphere' in text() and 'CJ-01' in text())
    shot('cluj-reserve-top');click('22:00');click('5h');click('Vezi totalul →')
    current=text();check('Cluj checkout150 and next day03', 'CJ-01' in current and '150.00 RON' in current and 'Mâine, 03:00' in current)
    shot('cluj-checkout-top')
    click('Am citit rezumatul și condițiile demonstrative.',scroll=True)
    click('Simulează rezervarea · 45.00 RON',scroll=True)
    current=tree();check('Checkout to Pass starts at top',any('Ne vedem în sală.' in label(n) and int(re.findall(r'\d+',n.attrib['bounds'])[1])<800 for n in current.iter('node')))
    shot('pass-top');click('Prelungește +1h · demo',scroll=True);top()
    check('Native extension advances next day04', 'Mâine, 04:00' in text())
    shot('pass-extended-top');click('Rezervă');check('Tab switch Reserve starts at top','Unde joci?' in text());shot('reserve-after-pass')
    click('Vezi totalul →');check('Reserve to checkout starts at top','Verifică totalul' in text());shot('checkout-after-tab')
    click('Bar');check('Bar tab starts at top','Pauză de bar' in text());shot('bar-top')
    click('Cont');shot('account-top')
except Exception as error:
    checks.append({'name':'Native run completion','result':'FAIL','error':str(error)});shot('failure');raise
finally:
    result={'checks':checks,'serial':'CNXNU20922109640','apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'apkMtime':apk.stat().st_mtime}
    (root/'correction1-native-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result))
