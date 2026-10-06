(()=>{
const $=s=>document.querySelector(s), html=document.documentElement;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
/* tema: respeta el sistema, el botón lo cambia */
const setTheme=t=>{html.dataset.theme=t;$('#theme').setAttribute('aria-label',t==='dark'?'Cambiar a tema claro':'Cambiar a tema oscuro')};
setTheme(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
$('#theme').onclick=()=>setTheme(html.dataset.theme==='dark'?'light':'dark');

/* inclinación del plato: mouse con hover, táctil arrastrando en horizontal. Solo transform (compositor). */
const stage=$('#stage'),tilt=$('#tilt');let down=false,sx=0;
const set=(x,y)=>{tilt.style.setProperty('--ry',x+'deg');tilt.style.setProperty('--rx',y+'deg')};
if(!reduce){
  stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();
    if(e.pointerType==='mouse'){set(((e.clientX-r.left)/r.width-.5)*30,-((e.clientY-r.top)/r.height-.5)*14)}
    else if(down){set(Math.max(-35,Math.min(35,(e.clientX-sx)*.3)),0)}});
  stage.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'){down=true;sx=e.clientX;tilt.classList.add('is-drag')}});
  const up=()=>{down=false;tilt.classList.remove('is-drag');set(0,0)};
  stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
  stage.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')set(0,0)});
}
/* 3D real: model-viewer (1,07 MB sin comprimir) solo al pedirlo. Rutas de este repo; en producción: /vendor/ y /assets/ */
const MV='../../mesaverso-landing/node_modules/@google/model-viewer/dist/model-viewer.min.js';
const GLB='../../mesaverso-landing/src/assets/torta-de-zanahoria-3d.glb';
$('#go3d').onclick=function(){
  const b=this;b.disabled=true;b.textContent='Cargando 3D…';
  const mount=()=>{const mv=document.createElement('model-viewer');
    mv.setAttribute('src',GLB);mv.setAttribute('camera-controls','');mv.setAttribute('interaction-prompt','none');
    mv.setAttribute('shadow-intensity','0');mv.setAttribute('alt','Torta de zanahoria en 3D, girá con el dedo');
    if(!reduce)mv.setAttribute('auto-rotate','');
    tilt.replaceChildren(mv);set(0,0);b.remove()};
  const s=document.createElement('script');s.type='module';s.src=MV;s.onload=()=>setTimeout(mount,50);
  s.onerror=()=>{b.textContent='3D no disponible en este prototipo';b.disabled=false};document.head.append(s);
};

/* ---- demo ---- */
const Gs=n=>'₲ '+String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const MENU=[{id:'t',n:'Torta de zanahoria',p:28000,img:true},{id:'m',n:'Milanesa napolitana',p:45000},{id:'c',n:'Chipá guasu',p:18000}];
const STEPS=[
 {t:'Cliente',d:'Mira el plato en 3D, arma su pedido y lo envía.'},
 {t:'Mozo',d:'El pedido entra a la mesa. Un toque para aceptarlo.'},
 {t:'Cocina',d:'La comanda sale impresa, sin que nadie la copie.'},
 {t:'Cuenta',d:'Dividida entre todos, cobrada y cerrada.'}];
let st={i:0,cart:{},split:1,paid:false};
const cartLines=()=>MENU.filter(m=>st.cart[m.id]).map(m=>({...m,q:st.cart[m.id]}));
const total=()=>cartLines().reduce((a,l)=>a+l.p*l.q,0);
const ensureCart=()=>{if(!total())st.cart={t:1,m:1}};
const posterSrc=$('#dishimg').src;

const ol=$('#steps');
STEPS.forEach((s,i)=>{const li=document.createElement('li');li.setAttribute('role','presentation');
  li.innerHTML=`<button class="step" role="tab" id="tab${i}" aria-controls="screen" aria-selected="false" tabindex="-1"><span class="step__n">0${i+1}</span><span class="step__t">${s.t}</span><span class="step__d">${s.d}</span></button>`;
  ol.append(li)});
const tabs=[...ol.querySelectorAll('.step')];
tabs.forEach((b,i)=>{b.onclick=()=>go(i);b.onkeydown=e=>{const k={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];
  if(k){e.preventDefault();const n=(i+k+4)%4;go(n);tabs[n].focus()}}});

const view=[
 ()=>`<div class="pbar"><span>Tu local</span><span>Mesa 4</span></div><h3 class="ph1">Menú</h3>
  ${MENU.map(m=>`<div class="row">${m.img?`<img class="row__thumb" src="${posterSrc}" alt="" width="52" height="52">`:`<span class="row__ph" aria-hidden="true">FOTO</span>`}
   <div><b>${m.n}</b><small>${Gs(m.p)}${m.img?' · 3D':''}</small></div>
   <button class="add" data-id="${m.id}" data-n="${st.cart[m.id]||0}" aria-label="Agregar ${m.n}${st.cart[m.id]?', hay '+st.cart[m.id]:''}">+</button></div>`).join('')}
  <p class="hint">${total()?'Listo para enviar.':'Tocá el + para armar el pedido.'}</p>
  <button class="pcta" id="act" ${total()?'':'disabled'}>Enviar pedido · ${Gs(total())}</button>`,
 ()=>{ensureCart();return `<div class="pbar"><span>Pantalla del mozo</span><span>Mesa 4</span></div><h3 class="ph1">Pedido nuevo</h3>
  <div class="pcard"><span class="pill">Nuevo · ahora</span>${cartLines().map(l=>`<div style="display:flex;justify-content:space-between"><span>${l.q} × ${l.n}</span><span>${Gs(l.p*l.q)}</span></div>`).join('')}<b style="display:flex;justify-content:space-between;border-top:1px solid var(--scr-line);padding-top:6px"><span>Total</span><span>${Gs(total())}</span></b></div>
  <p class="hint">Entró por el QR de la mesa. Nadie lo tipeó.</p>
  <button class="pcta" id="act">Aceptar e imprimir</button>`},
 ()=>{ensureCart();return `<div class="pbar"><span>Cocina</span><span>Comanda</span></div><h3 class="ph1">Imprimiendo…</h3>
  <div class="ticket" aria-label="Comanda"><div class="r"><b>MESA 4</b><span>#0042</span></div><hr>${cartLines().map(l=>`<div class="r"><span>${l.q} × ${l.n}</span></div>`).join('')}<hr><div>Sin cebolla en la milanesa</div></div>
  <button class="pcta" id="act">Marcar listo</button>`},
 ()=>{ensureCart();const per=Math.ceil(total()/st.split);return st.paid?
  `<div class="pbar"><span>Mesa 4</span><span>Cerrada</span></div><div class="done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg><h3 class="ph1">Venta cerrada</h3><p class="hint">${Gs(total())} · cobrada entre ${st.split}</p></div><button class="pcta" id="act">Volver a probar</button>`:
  `<div class="pbar"><span>Mesa 4</span><span>Cuenta</span></div><h3 class="ph1">La cuenta</h3>
  <div class="pcard"><span class="hint">Total</span><span class="total">${Gs(total())}</span></div>
  <div class="hint" id="splitl">Dividir entre</div><div class="seg" role="group" aria-labelledby="splitl">${[1,2,3].map(n=>`<button data-s="${n}" aria-pressed="${st.split===n}">${n}</button>`).join('')}</div>
  <div class="pcard"><span class="hint">Cada uno paga</span><span class="total">${Gs(per)}</span></div>
  <button class="pcta" id="act">Marcar pagada</button>`}
];
const screen=$('#screen');
function render(anim){
  const p=document.createElement('div');p.className='panel'+(anim?' in':'');p.innerHTML=view[st.i]();
  screen.replaceChildren(p);
  p.querySelectorAll('.add').forEach(b=>b.onclick=()=>{st.cart[b.dataset.id]=(st.cart[b.dataset.id]||0)+1;render(false);screen.querySelector('[data-id="'+b.dataset.id+'"]').focus()});
  p.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{st.split=+b.dataset.s;render(false);screen.querySelector('[data-s="'+st.split+'"]').focus()});
  const a=p.querySelector('#act');
  if(a)a.onclick=()=>{
    if(st.i===3){ if(!st.paid){st.paid=true;render(true)} else {st.cart={};st.split=1;st.paid=false;go(0)} }
    else setTimeout(()=>go(st.i+1),reduce?0:180)};
}
function go(i){st.i=i;
  tabs.forEach((b,k)=>{b.setAttribute('aria-selected',k===i);b.tabIndex=k===i?0:-1});
  screen.setAttribute('aria-labelledby','tab'+i);$('#cap').textContent=STEPS[i].d;
  ol.style.setProperty('--p',i/3);render(true)}
/* largo del recorrido para el punto de luz */
const len=()=>{const t=ol.querySelector('.steps__track');ol.style.setProperty('--len',(matchMedia('(min-width:900px)').matches?t.offsetHeight:t.offsetWidth)+'px')};
addEventListener('resize',len);go(0);len();
})();
