export async function makeToken(payload,password){
 const fields={...payload,Password:password};delete fields.Token;
 const value=Object.keys(fields).filter(k=>fields[k]!==null&&typeof fields[k]!=='object').sort().map(k=>String(fields[k])).join('');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function sameToken(a,b){if(typeof a!=='string'||a.length!==64||typeof b!=='string'||b.length!==64)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function verifiedState(state,order,terminal){return state.Success===true&&state.TerminalKey===terminal&&String(state.PaymentId)===String(order.payment_id)&&String(state.OrderId)===String(order.order_id)&&Number.isSafeInteger(state.Amount)&&state.Amount===order.amount;}
