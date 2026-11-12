import subprocess as sp, xml.etree.ElementTree as ET, re, json
from pathlib import Path
root=Path(__file__).resolve().parent
adb=['adb','-s','CNXNU20922109640']
def run(*args):return sp.check_output(adb+list(args),timeout=20)
def tree():
    run('shell','uiautomator','dump','/sdcard/ui-redesign-window.xml')
    return ET.fromstring(run('shell','cat','/sdcard/ui-redesign-window.xml'))
def click(label,contains=False):
    nodes=[n for n in tree().iter('node') if ((label in (n.attrib.get('text') or n.attrib.get('content-desc',''))) if contains else (n.attrib.get('text') or n.attrib.get('content-desc',''))==label)]
    if not nodes:raise RuntimeError('Missing native label: '+label)
    n=nodes[0];x1,y1,x2,y2=map(int,re.findall(r'\d+',n.attrib['bounds']));run('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    tree()
def shot(name): (root/name).write_bytes(run('exec-out','screencap','-p'))
click('Nexus Gaming Arena',True);shot('flutter-venue-details.png');run('shell','input','keyevent','4')
click('Rezervă');shot('flutter-reserve.png')
run('shell','input','swipe','550','1700','550','850','350');tree();shot('flutter-reserve-floor.png')
click('Permis');shot('flutter-pass.png')
click('Bar');shot('flutter-bar.png')
click('Cont');shot('flutter-account.png')
click('Confidențialitate',True);shot('flutter-reset-dialog.png');run('shell','input','keyevent','4');tree()
print('Native Explore / details / reserve / floor / pass / bar / account / reset dialog captured; reset not submitted.')
