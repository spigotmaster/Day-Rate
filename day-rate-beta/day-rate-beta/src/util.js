export const $=s=>document.querySelector(s);
export const pad=n=>String(n).padStart(2,'0');
export const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
export const parse=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
export const today=()=>ds(new Date(Date.now()-4*36e5));
