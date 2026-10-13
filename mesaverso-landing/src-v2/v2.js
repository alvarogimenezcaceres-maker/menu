(()=>{
const $=s=>document.querySelector(s), html=document.documentElement;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
/* tema: respeta el sistema, el botón lo cambia */
const setTheme=t=>{html.dataset.theme=t;$('#theme').setAttribute('aria-label',t==='dark'?'Cambiar a tema claro':'Cambiar a tema oscuro')};
setTheme(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
$('#theme').onclick=()=>setTheme(html.dataset.theme==='dark'?'light':'dark');

/* 3D real: model-viewer (1,07 MB) y el GLB solo cuando el visitante lo pide */
const MV='/vendor/model-viewer.min.js',GLB='/assets/torta-de-zanahoria-3d.glb';
let mvP=null;
const loadMV=()=>mvP||(mvP=new Promise((ok,no)=>{if(customElements.get('model-viewer'))return ok();
  const s=document.createElement('script');s.type='module';s.src=MV;s.onload=()=>ok();s.onerror=()=>{mvP=null;no()};document.head.append(s)}));
function makeViewer(withAr){
  const mv=document.createElement('model-viewer');
  mv.setAttribute('src',GLB);mv.setAttribute('camera-controls','');mv.setAttribute('interaction-prompt','none');
  mv.setAttribute('shadow-intensity','0');mv.setAttribute('alt','Torta de zanahoria en 3D, girá con el dedo');
  if(!reduce)mv.setAttribute('auto-rotate','');
  if(withAr){mv.setAttribute('ar','');mv.setAttribute('ar-modes','webxr scene-viewer quick-look');
    const b=document.createElement('button');b.slot='ar-button';b.type='button';b.className='btn btn--primary btn--sm arbtn';b.textContent='Ver en tu mesa';
    b.style.cssText='position:absolute;left:50%;bottom:4px;transform:translateX(-50%)';mv.append(b)}
  return mv}
const fail3d=b=>{b.textContent='No se pudo cargar el 3D. Probá de nuevo';b.disabled=false};
$('#go3d2').onclick=function(){const b=this;b.disabled=true;b.textContent='Cargando 3D…';
  loadMV().then(()=>{$('#mv3d').replaceChildren(makeViewer(true));b.textContent='Listo: giralo con el dedo'}).catch(()=>fail3d(b))};

/* ---- demo ---- */
const Gs=n=>'₲ '+String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');


/* ---- pausar las animaciones infinitas cuando la escena sale de pantalla ---- */
if('IntersectionObserver' in window){
  const io=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('is-paused',!e.isIntersecting)),{rootMargin:'80px'});
  document.querySelectorAll('.d3__stage').forEach(el=>io.observe(el));
}
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const num=v=>{const n=parseInt(String(v).replace(/\D/g,''),10);return Number.isFinite(n)&&n>0?n:null};
const dots=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');

/* ---- vista previa de tu menú: todo ocurre en el navegador; no se guarda ni se envía lo que se escribe ---- */
const EX={
  'Restaurante':[['Milanesa napolitana',45000],['Lomito completo',38000],['Flan casero',15000]],
  'Hamburguesería':[['Hamburguesa clásica',32000],['Papas con cheddar',20000],['Limonada',12000]],
  'Cafetería':[['Café con leche',14000],['Torta de zanahoria',22000],['Jugo de naranja',16000]],
  'Pizzería':[['Pizza muzzarella',55000],['Fugazzeta',62000],['Cerveza',18000]]};
const pv={name:$('#pvName'),d:[$('#pvD1'),$('#pvD2'),$('#pvD3')],p:[$('#pvP1'),$('#pvP2'),$('#pvP3')],screen:$('#pvScreen')};
const pvCart=[0,0,0];
function pvRender(){
  const typed=pv.name.value.trim();
  const rows=pv.d.map((d,i)=>({n:d.value.trim(),p:num(pv.p[i].value),i})).filter(r=>r.n);
  const panel=el('div','panel');
  const bar=el('div','pbar');bar.append(el('span',null,'Menú'),el('span',null,'Mesa 4'));
  panel.append(bar,el('h3','pvname',typed||'Tu local'),el('span','pill tagex','Vista previa · ejemplo'));
  if(!rows.length)panel.append(el('p','empty','Escribí un plato y aparece acá.'));
  rows.forEach(r=>{
    const row=el('div','row'),info=el('div');
    info.append(el('b',null,r.n));if(r.p)info.append(el('small',null,Gs(r.p)));
    const b=el('button','add','+');b.type='button';b.dataset.n=String(pvCart[r.i]||0);b.dataset.i=String(r.i);
    b.setAttribute('aria-label','Agregar '+r.n+(pvCart[r.i]?', hay '+pvCart[r.i]:''));
    b.onclick=()=>{pvCart[r.i]=(pvCart[r.i]||0)+1;pvRender();const nb=pv.screen.querySelector('[data-i="'+r.i+'"]');if(nb)nb.focus()};
    row.append(el('span','row__ph','FOTO'),info,b);panel.append(row)});
  const cnt=rows.reduce((a,r)=>a+(pvCart[r.i]||0),0),tot=rows.reduce((a,r)=>a+(r.p||0)*(pvCart[r.i]||0),0);
  const cta=el('button','pcta',cnt?'Enviar pedido'+(tot?' · '+Gs(tot):''):'Enviar pedido');cta.type='button';cta.disabled=!cnt;
  panel.append(el('p','hint',cnt?'Así se arma el pedido de tu cliente.':'Tocá el + para armar un pedido.'),cta);
  pv.screen.replaceChildren(panel);
  $('#pvShare').href='https://wa.me/?text='+encodeURIComponent('Mirá cómo quedaría '+(typed?'el menú de '+typed:'mi menú')+' en Mesaverso: '+location.origin+'/');
}
const pvChips=[...document.querySelectorAll('#pvChips button')];
pvChips.forEach(b=>b.onclick=()=>{
  EX[b.dataset.ex].forEach(([n,p],i)=>{pv.d[i].value=n;pv.p[i].value=dots(p)});
  pvChips.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));pvCart.fill(0);pvRender()});
[pv.name,...pv.d].forEach(i=>i.addEventListener('input',pvRender));
pv.p.forEach(i=>i.addEventListener('input',()=>{const n=num(i.value);i.value=n?dots(n):'';pvRender()}));
$('#pvCta').addEventListener('click',()=>{const n=pv.name.value.trim();if(n)$('#fBusiness').value=n});
pvChips[0].click();

/* ---- ejemplo de comisión (calculadora ilustrativa) ---- */
const cM=$('#cMonto'),cP=$('#cPct'),cO=$('#cOut'),cN=$('#cNote');
function calc(){const m=num(cM.value)||0;let p=parseInt(cP.value.replace(/\D/g,''),10);if(!Number.isFinite(p))p=0;p=Math.min(p,50);
  const r=Math.round(m*p/100);cO.textContent=Gs(r);
  cN.textContent='Ejemplo: si pagaras un '+p+' % de comisión por '+Gs(m)+' en pedidos, serían '+Gs(r)+'. Es un ejemplo, no la tarifa de ninguna empresa.'}
cM.addEventListener('input',()=>{const n=num(cM.value);cM.value=n?dots(n):'';calc()});
cP.addEventListener('input',()=>{cP.value=cP.value.replace(/\D/g,'').slice(0,2);calc()});calc();

/* ---- formulario de cierre ---- */
const form=$('#lead'),t0=Date.now();
const val=id=>$('#'+id).value.trim(),say=(id,m)=>{$('#'+id).textContent=m||''};
form.addEventListener('submit',async ev=>{
  ev.preventDefault();['eName','eBusiness','ePhone','eType','eOk'].forEach(i=>say(i,''));
  let first=null;const bad=(id,msg,field)=>{say(id,msg);first=first||$('#'+field)};
  if(val('fName').length<2)bad('eName','Escribí tu nombre.','fName');
  if(val('fBusiness').length<2)bad('eBusiness','Escribí el nombre de tu local.','fBusiness');
  const dg=val('fPhone').replace(/\D/g,'');
  if(dg.length<6||dg.length>15||!/^[+\d\s().-]+$/.test(val('fPhone')))bad('ePhone','Revisá el número: solo números, por ejemplo 0981 123 456.','fPhone');
  if(!$('#fOk').checked)bad('eOk','Marcá la casilla para que podamos escribirte.','fOk');
  if(first){first.focus();return}
  const send=$('#send'),st=$('#sendState');send.disabled=true;st.textContent='Enviando…';
  const how=val('fHow');
  const body={name:val('fName'),business:val('fBusiness'),phone:val('fPhone'),type:$('#fType').value,
    message:'Pedidos hoy: '+(how||'sin responder')+' | Acepta que le escribamos por WhatsApp | Origen: landing nueva',website:$('#fWeb').value,t:t0};
  try{
    const r=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.ok){form.hidden=true;$('#okTitle').textContent='¡Listo, '+body.business+'! Ya te anotamos.';const ok=$('#okBox');ok.classList.add('show');ok.focus();document.dispatchEvent(new Event('mv-lead-sent'))}
    else if(r.status===422&&j.fields){
      if(j.fields.name)say('eName',j.fields.name);if(j.fields.business)say('eBusiness',j.fields.business);
      if(j.fields.phone)say('ePhone',j.fields.phone);if(j.fields.type)say('eType',j.fields.type);
      st.textContent='Revisá los datos marcados.';send.disabled=false}
    else{st.textContent=j.error||'No pudimos enviar tu solicitud. Escribinos por WhatsApp.';send.disabled=false}
  }catch(e){st.textContent='No pudimos enviar tu solicitud. Escribinos por WhatsApp.';send.disabled=false}
});
})();
// Lazy scenes: load a module with import() only when its section nears the viewport (same origin, covered by script-src 'self').
document.querySelectorAll('[data-mod]').forEach(sec=>{
  const stage=sec.querySelector('[data-stage]');
  const load=()=>import(sec.dataset.mod).then(m=>{stage.innerHTML='';stage.classList.add('is-live');m.default(stage)}).catch(()=>{});
  if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>{if(es[0].isIntersecting){io.disconnect();load()}},{rootMargin:'600px'});io.observe(sec)}
});
/* ---- hero: teléfono de ejemplo en vivo (no se envía nada): tocás +, el total y la comanda de cocina se actualizan ---- */
(()=>{
  const inp=document.getElementById('heroName'),rows=document.getElementById('heroRows');if(!inp||!rows)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R={parrilla:[['Asado de tira',68000],['Vacío',72000],['Mandioca frita',16000]],cafe:[['Café con leche',14000],['Medialuna',8000],['Tostado mixto',18000]],lomo:[['Lomito árabe',32000],['Hamburguesa',28000],['Papas fritas',15000]],bar:[['Cerveza',14000],['Tabla de picada',65000],['Hamburguesa',28000]]};
  const chips=[...document.querySelectorAll('#heroChips .chip')],nm=document.getElementById('heroLocal'),total=document.getElementById('heroTotal'),lines=document.getElementById('heroLines'),code=document.getElementById('heroCode'),ticket=document.getElementById('heroTicket'),send=document.getElementById('heroSend');
  const Gs=n=>'₲ '+String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';code.textContent='#MV-'+Array.from({length:4},()=>A[Math.floor(Math.random()*A.length)]).join('');
  let rubro='parrilla',qty=[1,1,0];
  const bump=()=>{if(reduce)return;ticket.classList.remove('is-pop');void ticket.offsetWidth;ticket.classList.add('is-pop')};
  function paint(pop){
    const n=inp.value.trim();nm.textContent=n||'Tu local';
    const list=R[rubro];
    rows.replaceChildren(...list.map(([t,pr],i)=>{
      const li=document.createElement('li'),d=document.createElement('div'),name=document.createElement('span'),price=document.createElement('small'),btn=document.createElement('button');
      name.textContent=t;price.textContent=Gs(pr);d.append(name,price);
      btn.type='button';btn.className='phone__add';btn.setAttribute('aria-label','Agregar '+t);btn.textContent=qty[i]?String(qty[i]):'+';btn.dataset.on=qty[i]?'1':'0';
      btn.addEventListener('click',()=>{qty[i]=qty[i]>=3?0:qty[i]+1;draw();bump()});
      li.append(d,btn);return li}));
    draw();
    chips.forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.r===rubro)));
    document.documentElement.dataset.local=n;document.documentElement.dataset.rubro=rubro;document.dispatchEvent(new CustomEvent('mv-local',{detail:n}));
    if(pop)bump();
  }
  function draw(){
    const list=R[rubro];let sum=0;const out=[];
    [...rows.children].forEach((li,i)=>{const b=li.querySelector('button');b.textContent=qty[i]?String(qty[i]):'+';b.dataset.on=qty[i]?'1':'0'});
    list.forEach(([t,pr],i)=>{if(qty[i]){sum+=pr*qty[i];const r=document.createElement('div'),x=document.createElement('b'),y=document.createElement('span');x.textContent=qty[i]+'×';y.textContent=t;r.append(x,y);out.push(r)}});
    if(!out.length){const e=document.createElement('div');e.className='ticket__empty';e.textContent='Esperando pedido…';out.push(e)}
    lines.replaceChildren(...out);total.textContent=Gs(sum);send.dataset.on=sum?'1':'0';
  }
  inp.addEventListener('input',()=>{
    paint(false);const n=inp.value.trim(),a=document.getElementById('pvName'),b=document.getElementById('fBusiness');
    if(a){a.value=n;a.dispatchEvent(new Event('input'))}if(b&&n)b.value=n;
  });
  chips.forEach(c=>c.addEventListener('click',()=>{rubro=c.dataset.r;qty=[1,1,0];paint(true)}));
  paint(false);
})();

// Hide the floating WhatsApp button while a field has the focus (it covered the inputs on phones).
(() => {
  const root = document.documentElement;
  const isField = (t) => t && t.matches && t.matches("input:not([type=checkbox]):not([type=radio]),textarea,select");
  document.addEventListener("focusin", (e) => { if (isField(e.target)) root.dataset.typing = "1"; });
  document.addEventListener("focusout", () => { delete root.dataset.typing; });
})();

// The hero already carries two primary buttons: keep the floating WhatsApp button out of the way until the visitor scrolls past it.
(() => {
  const hero = document.getElementById("top");
  if (!hero || !("IntersectionObserver" in window)) return;
  const root = document.documentElement;
  new IntersectionObserver(([e]) => { if (e.isIntersecting) root.dataset.inHero = "1"; else delete root.dataset.inHero; }, { rootMargin: "0px 0px -35% 0px" }).observe(hero);
})();

// Mobile menu: opens under the header, closes with a link, Escape or a tap on the button.
(() => {
  const btn = document.getElementById("navbtn"), menu = document.getElementById("navmenu");
  if (!btn || !menu) return;
  const set = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.setAttribute("aria-label", open ? "Cerrar el menú" : "Abrir el menú"); };
  btn.addEventListener("click", () => set(menu.hidden));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { set(false); btn.focus(); } });
  matchMedia("(min-width: 900px)").addEventListener("change", (m) => { if (m.matches) set(false); });
})();
