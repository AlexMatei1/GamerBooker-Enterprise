import React,{useEffect,useRef,useState} from 'react';
type Venue={id:string;name:string;policy:{cancelHours:number;revision:number}};
export function PassPreviewOperations(){
 const [venues,setVenues]=useState<Venue[]>([]),[venueId,setVenueId]=useState('v-arena-bucharest-01'),[hours,setHours]=useState(3),[code,setCode]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[camera,setCamera]=useState(false);
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null);
 const capability=document.querySelector<HTMLMetaElement>('meta[name="preview-staff-capability"]')?.content||'';
 async function request<T>(route:string,body?:unknown):Promise<T>{
  if(!capability)throw new Error('Deschide dashboard-ul izolat: http://127.0.0.1:8788');
  let response:Response;try{response=await fetch('/preview/staff/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Preview-Client':'staff',Authorization:'Bearer '+capability},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new Error('Serviciu offline. Niciun check-in sau politică confirmată.');}
  const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
 }
 async function load(){try{const list=await request<Venue[]>('venues');setVenues(list);setHours(list.find(v=>v.id===venueId)?.policy.cancelHours??3);}catch(e){setMessage((e as Error).message);}}
 useEffect(()=>{void load();return()=>stream.current?.getTracks().forEach(t=>t.stop());},[venueId]);
 async function scan(value=code){if(busy)return;setBusy(true);try{const pass=await request<{stationName:string;endAt:number}>('scan',{venueId,code:value.trim()});setMessage('CHECK-IN CONFIRMAT · '+pass.stationName+' · sfârșit rezervat '+new Date(pass.endAt).toLocaleString('ro-RO'));setCode('');}catch(e){setMessage('REFUZAT · '+(e as Error).message);}finally{setBusy(false);}}
 async function openCamera(){
  type Detector={detect:(image:HTMLVideoElement)=>Promise<{rawValue:string}[]>};
  const ctor=(window as unknown as {BarcodeDetector?:new(options:{formats:string[]})=>Detector}).BarcodeDetector;
  if(!ctor){setMessage('Scannerul optic nu este disponibil în acest browser. Folosește scanner USB (tastatură + Enter) sau introdu codul manual.');return;}
  try{stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});setCamera(true);const detector=new ctor({formats:['qr_code']});
   const poll=async()=>{if(!stream.current)return;if(video.current){video.current.srcObject=stream.current;await video.current.play();const found=await detector.detect(video.current);if(found[0]){setCode(found[0].rawValue);stream.current.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false);setMessage('Cod citit. Verifică locația și confirmă check-in.');return;}}setTimeout(()=>void poll(),500);};setTimeout(()=>void poll(),100);
  }catch(e){setMessage('Camera indisponibilă: '+(e as Error).message);}
 }
 return <section className="pass-preview-operations" style={{padding:24,border:'1px solid #bbc5bd',borderRadius:12,marginBottom:24,background:'#fffdf8',color:'#171c21'}}><h2>Permise / Check-in local</h2><label>Locație <select aria-label="Locație permise" value={venueId} onChange={e=>setVenueId(e.target.value)}>{venues.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><form onSubmit={e=>{e.preventDefault();void scan();}} style={{display:'flex',gap:12,margin:'16px 0',flexWrap:'wrap'}}><input aria-label="Cod check-in" value={code} onChange={e=>setCode(e.target.value)} placeholder="Scanner USB + Enter / cod GBLOCAL-…" autoComplete="off" style={{minWidth:360,padding:12}}/><button disabled={busy||!code.trim()} type="submit">Verifică și confirmă check-in</button><button type="button" onClick={()=>void openCamera()}>Scanează cu camera</button></form>{camera&&<><video ref={video} muted playsInline style={{width:320}}/><button onClick={()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false);}}>Închide camera</button></>}
 <p role="status" style={{fontWeight:700,overflowWrap:'anywhere'}}>{message}</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await request('policy',{venueId,cancelHours:hours});setMessage('Politică salvată. Se aplică numai ofertelor viitoare; permisele existente păstrează snapshot-ul.');await load();}catch(err){setMessage((err as Error).message);}finally{setBusy(false);}}}><label>Anulare: minimum <input aria-label="Ore înainte de început" type="number" min="0" max="168" step="1" value={hours} onChange={e=>setHours(Number(e.target.value))} style={{width:80,padding:8}}/> ore înainte de început (0–168).</label> <button disabled={busy}>Salvează politica locației</button></form></section>;
}
