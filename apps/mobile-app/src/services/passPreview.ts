import {ServiceClock} from './lifecycleState';
export const serviceClock=new ServiceClock();
export interface PreviewAmounts {rate:number;subtotal:number;baseDeposit:number;discount:number;deposit:number;remaining:number;total:number;promo:string}
export interface PreviewPass {
 id:string;venueId:string;venueName:string;stationName:string;startAt:number;endAt:number;activeEndAt?:number;checkedInAt?:number;durationHours:number;cancellationDeadline:number;
 policy:{cancelHours:number;revision:number};amounts?:PreviewAmounts;code:string;qr:boolean[][];status:'CONFIRMED'|'ACTIVE'|'CANCELLED'|'COMPLETED';canCancel:boolean;serverNow:number;
}
export type PreviewQuote=Omit<PreviewPass,'code'|'qr'|'status'|'canCancel'>&{expiresAt:number};
const key='gamerbooker-local-preview-owner-v1';
let session=localStorage.getItem(key)||'';
let connecting:Promise<void>|null=null;
async function request<T>(route:string,body?:unknown):Promise<T>{
 let response:Response;
 try{response=await fetch('/preview/customer/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Preview-Client':'customer',Authorization:'Bearer '+session},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new Error('Serviciul local este offline. Nicio modificare confirmată.');}
 const result=await response.json().catch(()=>({error:'Pornește previzualizarea pe http://127.0.0.1:8787'}));
 const serverNow=Number(response.headers.get('X-Preview-Now'));if(serverNow>0)serviceClock.sync(serverNow);
 if(!response.ok)throw new Error(result.error||'Serviciu local indisponibil');return result;
}
export const passPreview={
 async connect(){if(!session){if(!connecting)connecting=(async()=>{const data=await request<{session:string}>('session',{});session=data.session;localStorage.setItem(key,session);})().finally(()=>{connecting=null;});await connecting;}return request<PreviewPass[]>('passes');},
 list:()=>request<PreviewPass[]>('passes'),quote:(body:unknown)=>request<PreviewQuote>('quote',body),
 book:(quoteId:string,requestId:string)=>request<PreviewPass>('book',{quoteId,requestId}),cancel:(id:string)=>request<PreviewPass>('cancel',{id}),barEligibility:(id:string)=>request<PreviewPass>('bar-eligibility',{id})
};
export const localTime=(value:number)=>new Date(value).toLocaleString('ro-RO',{dateStyle:'medium',timeStyle:'medium'});
