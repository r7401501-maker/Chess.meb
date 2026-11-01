/* Бильярд («восьмёрка»): физика, правила и отрисовка. Каждый удар хранится записью в games.hist,
   у соперника он проигрывается тем же расчётом, а в конце состояние берётся из записи. */
const Pool=(()=>{
const W=800,H=400,R=11,M=26,DT=1/240,FR=.9972,E=.78,VMAX=1500;
const PK=[[M-5,M-5,25],[W/2,M-10,27],[W-M+5,M-5,25],[M-5,H-M+5,25],[W/2,H-M+10,27],[W-M+5,H-M+5,25]];
const COL=['#f4f1e8','#f2c230','#2f5fd0','#d8392b','#6a2fa8','#f08a24','#1f9a52','#8a1f2b','#16161a'];
const ORD=[1,9,2,10,8,3,11,4,12,5,13,6,14,7,15];
const mk=(x,y)=>({x,y,vx:0,vy:0,in:0,t:1});
const rack=()=>{
  const B=[mk(W*.25,H/2)],pos={};
  ORD.forEach((n,k)=>{let i=0;while((i+1)*(i+2)/2<=k)i++;const j=k-i*(i+1)/2;pos[n]=[W*.7+i*R*1.77,H/2+(j-i/2)*R*2.05]});
  for(let n=1;n<16;n++)B.push(mk(pos[n][0],pos[n][1]));
  return B;
};
const RK8=rack()[8];
const ser=B=>B.map(b=>b.in?'x':Math.round(b.x*10)+','+Math.round(b.y*10)).join(';');
const par=s=>s.split(';').map(t=>{if(t==='x'){const b=mk(0,0);b.in=1;return b}const a=t.split(',');return mk(a[0]/10,a[1]/10)});
const moving=B=>B.some(b=>!b.in&&(b.vx||b.vy));

function step(B,ev){
  const rl=v=>{if(ev.fx&&Math.abs(v)>25)ev.fx.push(['rail',Math.min(1,Math.abs(v)/800)])};
  for(const b of B){
    if(b.in)continue;
    b.x+=b.vx*DT;b.y+=b.vy*DT;b.vx*=FR;b.vy*=FR;
    if(b.vx*b.vx+b.vy*b.vy<16)b.vx=b.vy=0;
  }
  for(let i=0;i<16;i++){
    const b=B[i];if(b.in)continue;
    for(const p of PK)if((b.x-p[0])**2+(b.y-p[1])**2<p[2]*p[2]){
      b.in=1;b.t=0;b.px=p[0];b.py=p[1];b.sx=b.x;b.sy=b.y;b.vx=b.vy=0;ev.pot.push(i);if(ev.fx)ev.fx.push(['pocket']);break;
    }
    if(b.in)continue;
    if(b.x<M+R){b.x=M+R;rl(b.vx);b.vx=Math.abs(b.vx)*E}else if(b.x>W-M-R){b.x=W-M-R;rl(b.vx);b.vx=-Math.abs(b.vx)*E}
    if(b.y<M+R){b.y=M+R;rl(b.vy);b.vy=Math.abs(b.vy)*E}else if(b.y>H-M-R){b.y=H-M-R;rl(b.vy);b.vy=-Math.abs(b.vy)*E}
  }
  for(let i=0;i<16;i++){
    if(B[i].in)continue;
    for(let j=i+1;j<16;j++){
      if(B[j].in)continue;
      const a=B[i],c=B[j];let dx=c.x-a.x,dy=c.y-a.y;const d2=dx*dx+dy*dy;
      if(d2>=4*R*R||d2===0)continue;
      const d=Math.sqrt(d2);dx/=d;dy/=d;
      const o=(2*R-d)/2;a.x-=dx*o;a.y-=dy*o;c.x+=dx*o;c.y+=dy*o;
      const rel=(a.vx-c.vx)*dx+(a.vy-c.vy)*dy;
      if(rel>0){
        const k=rel*.98;a.vx-=k*dx;a.vy-=k*dy;c.vx+=k*dx;c.vy+=k*dy;
        if(ev.fx)ev.fx.push(['ball',Math.min(1,rel/900)]);
        if(ev.hit==null&&(i===0||j===0))ev.hit=i===0?j:i;
      }
    }
  }
}

/* правила: t = кто бьёт, grp = группы {w,b} ('s' цельные 1-7, 't' полосатые 9-15), n = номер удара */
function rules(t,grp,n,pre,B,ev){
  const o=t==='w'?'b':'w',g={w:grp.w,b:grp.b},potted=ev.pot.filter(i=>i>0&&!pre[i].in),scratch=!!B[0].in;
  const own=i=>i>0&&i!==8&&(g[t]==='s'?i<8:g[t]==='t'?i>8:true);
  let cleared=false;
  if(g[t]){cleared=true;for(let i=1;i<16;i++)if(own(i)&&!pre[i].in)cleared=false}
  let foul=scratch||ev.hit==null;
  if(!foul){const h=ev.hit;foul=g[t]?(h===8?!cleared:!own(h)):h===8}
  let res=null,respot=false;
  if(potted.includes(8)){if(n===0)respot=true;else res=(!foul&&cleared)?t:o}
  if(!g[t]&&!foul&&n>0){const f=potted.find(i=>i!==8);if(f){g[t]=f<8?'s':'t';g[o]=f<8?'t':'s'}}
  const keep=!foul&&potted.some(own);
  return{foul,res,respot,g,potted,next:keep?t:o,hand:foul?1:0};
}

const S={id:null,B:rack(),n:0,t:'w',grp:{w:null,b:null},hand:0,mode:'idle',aim:null,cv:null,last:0,acc:0,steps:0,ev:null,cb:null,prev:null,raf:0};
const live=()=>!!(GM&&cur&&GM.kind==='pool'&&cur===GM.id);
const mine=()=>{const g=GM,c=myCol(g);return live()&&g.status==='play'&&!!c&&c===S.t&&S.n===g.hist.length&&S.mode==='idle'};
const meta=e=>{S.t=e?e.p:'w';S.grp={w:(e&&e.g[0])||null,b:(e&&e.g[1])||null};S.hand=e?e.h:0};
function load(g){S.id=g.id;S.n=g.hist.length;const e=g.hist[S.n-1];S.B=e?par(e.s):rack();meta(e);S.mode='idle';S.cb=null;S.aim=null;S.k=null}

// Удар: сначала кий замахивается и бьёт (у соперника виден ЕГО кий и скин), потом шары катятся
function run(a,v,cb,pid,wind){
  S.ev={pot:[],hit:null,fx:[]};S.cb=cb;
  S.k={a,v,t:0,wind:!!wind,pal:(typeof cuePal==='function'&&cuePal(P[pid]))||'def'};
  S.mode='strike';
}
function launch(){
  const k=S.k,c=S.B[0];c.vx=Math.cos(k.a)*k.v*VMAX;c.vy=Math.sin(k.a)*k.v*VMAX;
  if(typeof Snd!=='undefined')try{Snd.play('cue',k.v)}catch(e){}
  S.k=null;S.mode='anim';S.acc=0;S.steps=0;
}
function replay(e,len){
  const c=S.B[0];if(e.c){c.x=e.c[0];c.y=e.c[1];c.in=0}
  const pv=GM.hist[len-2],sc=pv?pv.p:'w';
  run(e.a,e.v,()=>{S.B=par(e.s);S.n=len;meta(e);sync()},GM[sc==='w'?'white':'black'],true);
}
function sync(){
  const g=GM;if(!g||g.kind!=='pool')return;
  if(S.id!==g.id){load(g);S.prev=g.status;return}
  if(S.mode!=='idle')return;
  if(g.hist.length>S.n){
    const e=g.hist[g.hist.length-1];
    if(g.hist.length===S.n+1)replay(e,g.hist.length);else load(g);
  }else if(g.hist.length<S.n)load(g);
  if(S.prev==='play'&&g.status==='done'&&myCol(g)===g.result)confetti();
  S.prev=g.status;
}

function shoot(a,v){
  const g=GM,pre=S.B.map(b=>({...b})),n=S.n,t=S.t,grp=S.grp;
  const cs=S.hand?[+S.B[0].x.toFixed(1),+S.B[0].y.toFixed(1)]:null;
  run(a,v,ev=>{
    const r=rules(t,grp,n,pre,S.B,ev);
    if(S.B[0].in)S.B[0]=mk(W*.25,H/2);
    if(r.respot)S.B[8]=mk(RK8[0],RK8[1]);
    const e={n:'🎱 '+(r.potted.length?r.potted.join(', '):'мимо')+(r.foul?' · фол':''),s:ser(S.B),a:+a.toFixed(4),v:+v.toFixed(3),p:r.next,g:[r.g.w||'',r.g.b||''],h:r.hand,f:r.foul?1:0};
    if(cs)e.c=cs;
    S.n=n+1;meta(e);publish(g,e,r.res);
  },ME.id,false);
}
async function publish(g0,e,res){
  const hist=[...g0.hist,e];
  GM={...GM,hist};paint();
  const{data,error}=await db.from('games').update({hist,draw_by:null}).eq('id',g0.id).select();
  if(error){msg('Удар не отправлен: '+error.message);S.id=null;return refresh()}
  if(data&&data[0]&&cur===g0.id&&data[0].hist.length>=GM.hist.length)GM=data[0];
  if(res)await finish(res);
}

/* ---------- ввод ---------- */
let drag=null;
const pt=e=>{const r=S.cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H]};
function place(x,y){
  x=Math.min(W-M-R,Math.max(M+R,x));y=Math.min(H-M-R,Math.max(M+R,y));
  for(let i=1;i<16;i++){const b=S.B[i];if(!b.in&&(b.x-x)**2+(b.y-y)**2<(2*R+1)**2)return}
  S.B[0].x=x;S.B[0].y=y;
}
function wire(cv){
  cv.onpointerdown=e=>{
    if(!mine())return;
    e.preventDefault();cv.setPointerCapture(e.pointerId);
    const p=pt(e),c=S.B[0];
    drag=(S.hand&&Math.hypot(p[0]-c.x,p[1]-c.y)<3*R)?'move':'aim';
    cv.onpointermove(e);
  };
  cv.onpointermove=e=>{
    if(!drag||!mine())return;
    const p=pt(e),c=S.B[0];
    if(drag==='move')place(p[0],p[1]);
    else{const dx=c.x-p[0],dy=c.y-p[1];S.aim={a:Math.atan2(dy,dx),v:Math.min(1,Math.hypot(dx,dy)/260)}}
  };
  cv.onpointerup=cv.onpointercancel=()=>{
    const a=S.aim;S.aim=null;
    if(drag==='aim'&&a&&a.v>.06&&mine())shoot(a.a,a.v);
    drag=null;
  };
}

/* ---------- отрисовка ---------- */
function rr(x,a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()}
function ray(c,dx,dy){
  let t=1e9,hit=0;
  if(dx>0)t=Math.min(t,(W-M-R-c.x)/dx);if(dx<0)t=Math.min(t,(M+R-c.x)/dx);
  if(dy>0)t=Math.min(t,(H-M-R-c.y)/dy);if(dy<0)t=Math.min(t,(M+R-c.y)/dy);
  for(let i=1;i<16;i++){
    const b=S.B[i];if(b.in)continue;
    const fx=b.x-c.x,fy=b.y-c.y,p=fx*dx+fy*dy;if(p<=0)continue;
    const d2=fx*fx+fy*fy-p*p;if(d2>=4*R*R)continue;
    const q=p-Math.sqrt(4*R*R-d2);if(q<t){t=q;hit=i}
  }
  return{x:c.x+dx*t,y:c.y+dy*t,i:hit};
}
function ball(x,b,i){
  let px=b.x,py=b.y,sc=1,al=1;
  if(b.in){
    if(b.t>=1)return;
    px=b.sx+(b.px-b.sx)*b.t;py=b.sy+(b.py-b.sy)*b.t;sc=1-b.t*.75;al=1-b.t*.6;
    x.strokeStyle='rgba(255,230,150,'+((1-b.t)*.9)+')';x.lineWidth=2.5;x.beginPath();x.arc(b.px,b.py,8+b.t*34,0,7);x.stroke();
  }
  x.save();x.globalAlpha=al;
  const sg=x.createRadialGradient(px+3,py+5,1,px+3,py+5,R*1.35);sg.addColorStop(0,'rgba(0,0,0,.55)');sg.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=sg;x.beginPath();x.arc(px+3,py+5,R*1.35,0,7);x.fill();
  x.translate(px,py);x.scale(sc,sc);
  const c=COL[i>8?i-8:i];
  x.beginPath();x.arc(0,0,R,0,7);x.fillStyle=(i>8||i===0)?COL[0]:c;x.fill();
  if(i>8){x.save();x.beginPath();x.arc(0,0,R,0,7);x.clip();x.fillStyle=c;x.fillRect(-R,-R*.5,2*R,R);x.restore()}
  if(i>0){
    x.beginPath();x.arc(0,0,R*.48,0,7);x.fillStyle='#f8f5ec';x.fill();
    x.fillStyle='#111';x.font='bold '+(R*.78)+'px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(i,0,.6);
  }
  let g=x.createRadialGradient(-R*.35,-R*.4,R*.1,0,0,R);
  g.addColorStop(0,'rgba(255,255,255,.28)');g.addColorStop(.45,'rgba(255,255,255,0)');g.addColorStop(.8,'rgba(0,0,0,.28)');g.addColorStop(1,'rgba(0,0,0,.6)');
  x.beginPath();x.arc(0,0,R,0,7);x.fillStyle=g;x.fill();
  g=x.createRadialGradient(-R*.4,-R*.45,0,-R*.4,-R*.45,R*.38);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.beginPath();x.arc(-R*.4,-R*.45,R*.38,0,7);x.fill();
  x.restore();
}
function paintTable(x){
  let sd=7;const rnd=()=>(sd=sd*16807%2147483647)/2147483647;
  let g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#9c6b3d');g.addColorStop(.5,'#693d1d');g.addColorStop(1,'#3a1f0f');
  rr(x,0,0,W,H,30);x.fillStyle=g;x.fill();
  for(let i=0;i<120;i++){
    const y=rnd()*H,x0=rnd()*W,l=60+rnd()*240;
    x.strokeStyle=rnd()>.5?'rgba(0,0,0,'+(rnd()*.14)+')':'rgba(255,214,150,'+(rnd()*.12)+')';
    x.lineWidth=.5+rnd()*1.3;x.beginPath();x.moveTo(x0,y);x.quadraticCurveTo(x0+l/2,y+(rnd()-.5)*6,x0+l,y+(rnd()-.5)*3);x.stroke();
  }
  rr(x,2,2,W-4,H-4,28);x.strokeStyle='rgba(255,226,180,.42)';x.lineWidth=2;x.stroke();
  rr(x,.5,.5,W-1,H-1,30);x.strokeStyle='rgba(0,0,0,.65)';x.lineWidth=1.5;x.stroke();
  rr(x,M-9,M-9,W-2*M+18,H-2*M+18,14);g=x.createLinearGradient(0,M-9,0,H-M+9);g.addColorStop(0,'#0c5232');g.addColorStop(1,'#07391f');
  x.fillStyle=g;x.fill();x.strokeStyle='rgba(0,0,0,.6)';x.lineWidth=2;x.stroke();
  rr(x,M,M,W-2*M,H-2*M,5);
  g=x.createRadialGradient(W/2,H/2,30,W/2,H/2,W*.6);g.addColorStop(0,'#2eb875');g.addColorStop(.55,'#188b50');g.addColorStop(1,'#0b5832');
  x.fillStyle=g;x.fill();
  x.save();rr(x,M,M,W-2*M,H-2*M,5);x.clip();
  for(let i=0;i<5200;i++){x.fillStyle=rnd()>.5?'rgba(255,255,255,.045)':'rgba(0,0,0,.06)';x.fillRect(M+rnd()*(W-2*M),M+rnd()*(H-2*M),1.2,1.8)}
  const edge=(x0,y0,x1,y1,rx,ry,rw,rh)=>{const e=x.createLinearGradient(x0,y0,x1,y1);e.addColorStop(0,'rgba(0,0,0,.5)');e.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=e;x.fillRect(rx,ry,rw,rh)};
  edge(0,M,0,M+20,M,M,W-2*M,20);edge(0,H-M,0,H-M-20,M,H-M-20,W-2*M,20);
  edge(M,0,M+20,0,M,M,20,H-2*M);edge(W-M,0,W-M-20,0,W-M-20,M,20,H-2*M);
  x.strokeStyle='rgba(255,255,255,.10)';x.lineWidth=2;x.beginPath();x.moveTo(W*.25,M);x.lineTo(W*.25,H-M);x.stroke();
  x.fillStyle='rgba(255,255,255,.2)';for(const p of[[W*.25,H/2],[W*.7,H/2],[W/2,H/2]]){x.beginPath();x.arc(p[0],p[1],2.4,0,7);x.fill()}
  x.fillStyle='rgba(255,255,255,.13)';x.font='italic 700 26px Georgia,serif';x.textAlign='center';x.textBaseline='middle';x.fillText('Chess.meb',(M+W*.25)/2,H/2);
  x.restore();
  rr(x,M,M,W-2*M,H-2*M,5);x.strokeStyle='rgba(150,255,190,.35)';x.lineWidth=1.2;x.stroke();
  for(const p of PK){
    const rg=x.createLinearGradient(p[0]-p[2],p[1]-p[2],p[0]+p[2],p[1]+p[2]);rg.addColorStop(0,'#fff1b8');rg.addColorStop(.5,'#c9a24b');rg.addColorStop(1,'#6e4f12');
    x.beginPath();x.arc(p[0],p[1],p[2]*.97+3,0,7);x.strokeStyle=rg;x.lineWidth=5;x.stroke();
    const hg=x.createRadialGradient(p[0],p[1],2,p[0],p[1],p[2]);hg.addColorStop(0,'#000');hg.addColorStop(.7,'#0a0705');hg.addColorStop(1,'#2a1a0e');
    x.beginPath();x.arc(p[0],p[1],p[2]*.9,0,7);x.fillStyle=hg;x.fill();
  }
  x.shadowColor='rgba(255,236,170,.9)';x.shadowBlur=6;
  const pearl=(px,py)=>{const pg=x.createRadialGradient(px-.8,py-.8,.3,px,py,3.4);pg.addColorStop(0,'#fff');pg.addColorStop(1,'#d8c48a');x.fillStyle=pg;x.beginPath();x.arc(px,py,3.2,0,7);x.fill()};
  for(let i=1;i<8;i++){if(i===4)continue;pearl(W/8*i,8.5);pearl(W/8*i,H-8.5)}
  for(let i=1;i<4;i++){pearl(8.5,H/4*i);pearl(W-8.5,H/4*i)}
  x.shadowBlur=0;
}
/* ---------- кии: каждый рисуется один раз в спрайт (дерево, кольца, обмотка, инкрустация), дальше только поворот ---------- */
const CL=330;
const CUES={
  def:{n:'Классика',chalk:'#2f66a8',fer:['#f8f3e6','#cfc7b4'],shaft:{c:['#f4dfae','#d2a766'],st:'grain'},joint:['#dcdce2','#7c7c86'],fore:{c:['#6a4226','#2c170c']},ring:'#b69349',wrap:{c:['#3b2a1e','#1c120b'],st:'leather',th:'#8a6a3a'},sleeve:{c:['#6a4226','#2c170c']},cap:['#2a2a2a','#0a0a0a'],glow:null},
  gold:{n:'Золото',d:'Позолота с гравировкой, чёрное дерево с золотыми вставками, корона и рубины на рукояти',chalk:'#2f6db5',fer:['#fff0b0','#d19a1e'],shaft:{c:['#ffe27a','#c88a12'],st:'engrave'},joint:['#fff6d0','#8a6310'],fore:{c:['#1a130c','#050403'],pt:'#f6d56b'},ring:'#f3cf62',wrap:{c:['#2a2014','#0a0704'],st:'thread',th:'#f0c850'},sleeve:{c:['#fff1b8','#b07f16'],st:'crown',gem:'#e0314b'},cap:['#fff1b8','#8a6310'],glow:'rgba(255,205,70,.65)'},
  ice:{n:'Лёд',d:'Морозный кристалл, синее дерево со снежными вставками, снежинка на рукояти',chalk:'#8fd0ff',fer:['#ffffff','#b9dcf5'],shaft:{c:['#ffffff','#a8d6fb'],st:'frost'},joint:['#ffffff','#6aa4d6'],fore:{c:['#2f78c4','#0d2a52'],pt:'#e6f6ff'},ring:'#bfe4ff',wrap:{c:['#eaf6ff','#9cc7ea'],st:'linen'},sleeve:{c:['#4a8fd6','#12376d'],st:'flake',gem:'#bfe9ff'},cap:['#ffffff','#7fb6e6'],glow:'rgba(150,215,255,.7)'},
  neon:{n:'Неон',d:'Тёмный кий со светящимися линиями, карбоновая обмотка, неоновые вставки',chalk:'#ff3fd0',fer:['#d9fbff','#2fc7e6'],shaft:{c:['#161824','#07080c'],st:'neon',ac:'#27e0ff'},joint:['#ff7fe6','#7a1a6a'],fore:{c:['#12122a','#05050c'],pt:'#ff4fd8'},ring:'#27e0ff',wrap:{c:['#1b1c28','#08080d'],st:'carbon'},sleeve:{c:['#1d1236','#07030f'],st:'bars',gem:'#27e0ff',ac:'#ff4fd8'},cap:['#27e0ff','#0a6c80'],glow:'rgba(40,220,255,.75)'},
  ruby:{n:'Рубин',d:'Светлый клён, бордовое дерево с золотыми вставками, кожаная обмотка и рубины',chalk:'#b3213a',fer:['#fff3d6','#cdb98a'],shaft:{c:['#f6e2b8','#d6ad6c'],st:'grain'},joint:['#fbe8a8','#8c6a1c'],fore:{c:['#9a182b','#3b060f'],pt:'#f1cf6a'},ring:'#e8c15a',wrap:{c:['#7a1020','#2a0409'],st:'leather',th:'#e8c15a'},sleeve:{c:['#a31c31','#32050c'],st:'scroll',gem:'#ff5a72'},cap:['#f1cf6a','#7e5c14'],glow:'rgba(255,90,110,.55)'}
};
const SPR={};
function cueSprite(id,k){
  id=CUES[id]?id:'def';k=Math.max(2,Math.min(6,Math.ceil(k||3)));
  const key=id+k;if(SPR[key])return SPR[key];
  const p=CUES[id],PAD=16,HH=36,w=Math.round((CL+2*PAD)*k),h=HH*k;
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const x=cv.getContext('2d'),cy=h/2,X=l=>(PAD+l)*k,hw=l=>(4.8+l*.0188)/2*k;
  let sd=id.length*97+13;const rnd=()=>(sd=sd*16807%2147483647)/2147483647;
  const outline=()=>{x.beginPath();x.moveTo(X(0),cy-hw(0));x.lineTo(X(CL),cy-hw(CL));x.quadraticCurveTo(X(CL+3.5),cy,X(CL),cy+hw(CL));x.lineTo(X(0),cy+hw(0));x.quadraticCurveTo(X(-1.6),cy,X(0),cy-hw(0));x.closePath()};
  const along=(l0,l1,c0,c1)=>{const g=x.createLinearGradient(X(l0),0,X(l1),0);g.addColorStop(0,c0);g.addColorStop(1,c1);return g};
  const sec=(l0,l1,f)=>{x.fillStyle=f;x.fillRect(X(l0),cy-hw(l1)-3,X(l1)-X(l0),2*hw(l1)+6)};
  const line=(l0,y0,l1,y1,col,lw)=>{x.strokeStyle=col;x.lineWidth=lw*k;x.beginPath();x.moveTo(X(l0),cy+y0*hw(l0));x.lineTo(X(l1),cy+y1*hw(l1));x.stroke()};
  const gem=(l,r,c)=>{
    const g=x.createRadialGradient(X(l)-r*.35*k,cy-r*.4*k,.2*k,X(l),cy,r*k);g.addColorStop(0,'#fff');g.addColorStop(.25,c);g.addColorStop(1,'rgba(0,0,0,.75)');
    x.beginPath();x.arc(X(l),cy,r*k,0,7);x.fillStyle=g;x.fill();x.strokeStyle='rgba(0,0,0,.55)';x.lineWidth=.35*k;x.stroke();
  };
  const crown=(l,cw,ch,fill,stroke)=>{
    const a=X(l-cw/2),b=X(l+cw/2),t=cy-ch*k/2,u=cy+ch*k/2,m=(b-a)/6;
    x.beginPath();x.moveTo(a,u);x.lineTo(a-m*.1,t+ch*k*.1);x.lineTo(a+m*1.4,t+ch*k*.55);x.lineTo(a+m*3,t-ch*k*.12);x.lineTo(b-m*1.4,t+ch*k*.55);x.lineTo(b+m*.1,t+ch*k*.1);x.lineTo(b,u);x.closePath();
    x.fillStyle=fill;x.fill();x.strokeStyle=stroke;x.lineWidth=.3*k;x.stroke();
  };

  if(p.glow){x.save();x.shadowColor=p.glow;x.shadowBlur=9*k;x.fillStyle='#000';outline();x.fill();x.restore()}
  x.save();outline();x.clip();

  // наконечник: мел и кожа
  sec(-2,1.8,p.chalk);sec(1.8,4,'#4a3126');
  // ферула
  sec(4,14,along(4,14,p.fer[0],p.fer[1]));line(4,-1,4,1,'rgba(0,0,0,.45)',.35);line(14,-1,14,1,'rgba(0,0,0,.45)',.35);

  // верхняя часть (шафт)
  const sh=p.shaft;sec(14,168,along(14,168,sh.c[0],sh.c[1]));
  if(sh.st==='grain'){
    for(let i=0;i<54;i++){
      const l0=14+rnd()*140,len=18+rnd()*70,y=(rnd()*1.8-.9),dark=rnd()>.5;
      x.strokeStyle=dark?`rgba(125,72,22,${.07+rnd()*.17})`:`rgba(255,246,222,${.08+rnd()*.2})`;x.lineWidth=(.22+rnd()*.5)*k;
      x.beginPath();x.moveTo(X(l0),cy+y*hw(l0));x.quadraticCurveTo(X(l0+len/2),cy+(y+(rnd()-.5)*.14)*hw(l0),X(l0+len),cy+y*hw(l0+len));x.stroke();
    }
  }else if(sh.st==='engrave'){
    for(let l=15;l<168;l+=2.1){line(l,-1.1,l+3.6,1.1,'rgba(96,58,0,.2)',.3);line(l+1,-1.1,l+4.6,1.1,'rgba(255,251,210,.24)',.25)}
    for(let l=34;l<168;l+=26){line(l,-1,l,1,'rgba(70,40,0,.65)',.5);line(l+.8,-1,l+.8,1,'rgba(255,246,190,.7)',.3);line(l+3,-1,l+3,1,'rgba(70,40,0,.35)',.3)}
    for(let l=47;l<165;l+=26){
      const c=X(l),dw=7*k,dh=2.3*k;x.beginPath();x.moveTo(c-dw,cy);x.lineTo(c,cy-dh);x.lineTo(c+dw,cy);x.lineTo(c,cy+dh);x.closePath();
      x.fillStyle='rgba(88,52,0,.42)';x.fill();x.strokeStyle='rgba(255,246,190,.85)';x.lineWidth=.3*k;x.stroke();
    }
  }else if(sh.st==='frost'){
    for(let i=0;i<22;i++){
      const l=16+rnd()*148,y=(rnd()*1.6-.8)*hw(l),s=(5+rnd()*13)*k;
      x.beginPath();x.moveTo(X(l),cy+y);x.lineTo(X(l)+s,cy+y-s*.35*(rnd()-.3));x.lineTo(X(l)+s*.55,cy+y+s*.5);x.closePath();
      x.fillStyle=rnd()>.5?'rgba(255,255,255,.4)':'rgba(110,180,250,.26)';x.fill();
    }
    for(let i=0;i<5;i++){const l=20+rnd()*120;line(l,rnd()*1.6-.8,l+25+rnd()*30,rnd()*1.6-.8,'rgba(255,255,255,.55)',.3)}
    for(let i=0;i<60;i++){const l=15+rnd()*152;x.fillStyle='rgba(255,255,255,'+(.5+rnd()*.5)+')';x.beginPath();x.arc(X(l),cy+(rnd()*1.8-.9)*hw(l),(.22+rnd()*.35)*k,0,7);x.fill()}
  }else if(sh.st==='neon'){
    x.save();x.shadowColor=sh.ac;x.shadowBlur=5*k;
    for(const y of[-.34,.34]){x.setLineDash([26*k,4*k]);line(18,y,164,y,sh.ac,.9)}
    x.setLineDash([]);x.restore();
    for(let l=28;l<166;l+=32){x.fillStyle=p.fore.pt;x.beginPath();x.arc(X(l),cy,.8*k,0,7);x.fill()}
  }

  // стык
  sec(168,176,along(168,176,p.joint[0],p.joint[1]));
  for(let l=169;l<176;l+=1.7){line(l,-1,l,1,'rgba(0,0,0,.45)',.3);line(l+.55,-1,l+.55,1,'rgba(255,255,255,.4)',.22)}

  // передняя часть (форэнд): дерево и вставки-«пики»
  sec(176,246,along(176,246,p.fore.c[0],p.fore.c[1]));
  for(let i=0;i<26;i++){const l0=178+rnd()*60,len=10+rnd()*30,y=rnd()*1.8-.9;line(l0,y,l0+len,y+(rnd()-.5)*.1,rnd()>.5?'rgba(255,255,255,.07)':'rgba(0,0,0,.2)',.3)}
  if(p.fore.pt){
    for(let j=0;j<4;j++){
      const l0=182+j*15;
      for(const[s,off]of[[-1,0],[1,7.5]]){
        const a=l0+off;x.beginPath();x.moveTo(X(a),cy+s*hw(a));x.lineTo(X(a+15),cy+s*hw(a+15));x.lineTo(X(a+7.5),cy+s*.02*hw(a));x.closePath();
        x.fillStyle=p.fore.pt;x.fill();x.strokeStyle='rgba(0,0,0,.55)';x.lineWidth=.3*k;x.stroke();
      }
    }
    for(let j=0;j<4;j++){x.fillStyle='#fff';x.globalAlpha=.9;x.beginPath();x.arc(X(189.5+j*15),cy-.02*hw(190),.55*k,0,7);x.fill();x.globalAlpha=1}
  }

  // кольцо и обмотка
  sec(246,250,p.ring);line(246,-1,246,1,'rgba(0,0,0,.5)',.35);line(250,-1,250,1,'rgba(0,0,0,.5)',.35);
  const wr=p.wrap;sec(250,298,along(250,298,wr.c[0],wr.c[1]));
  if(wr.st==='linen'){for(let l=250.5;l<298;l+=1.5){line(l,-1,l+1.4,1,'rgba(255,255,255,.16)',.3);line(l+.7,-1,l+2.1,1,'rgba(0,0,0,.2)',.3)}}
  else if(wr.st==='leather'){
    x.setLineDash([3*k,2.4*k]);line(251,-.56,297,-.56,wr.th,.4);line(251,.56,297,.56,wr.th,.4);x.setLineDash([]);
    for(let i=0;i<70;i++){x.fillStyle='rgba(0,0,0,.2)';x.beginPath();x.arc(X(250+rnd()*48),cy+(rnd()*1.8-.9)*hw(270),.22*k,0,7);x.fill()}
  }else if(wr.st==='carbon'){
    for(let l=250,i=0;l<298;l+=2.4,i++)for(let j=-4,m=0;j<4;j++,m++){
      if((i+m)%2)continue;x.fillStyle='rgba(255,255,255,.1)';x.fillRect(X(l),cy+j*hw(l)/4,2.4*k,hw(l)/4)
    }
    for(let l=250;l<298;l+=2.4)line(l,-1,l,1,'rgba(0,0,0,.3)',.2);
  }else if(wr.st==='thread'){
    for(let l=250;l<298;l+=3.4){line(l,-1,l+4.2,1,'rgba(0,0,0,.55)',1.15);line(l+.3,-1,l+4.5,1,wr.th,.85);line(l+.9,-1,l+5.1,1,'rgba(255,248,200,.5)',.25)}
    line(250,-.93,298,-.93,wr.th,.4);line(250,.93,298,.93,wr.th,.4);
  }
  sec(298,302,p.ring);line(298,-1,298,1,'rgba(0,0,0,.5)',.35);line(302,-1,302,1,'rgba(0,0,0,.5)',.35);

  // рукоять-втулка с рисунком
  const sl=p.sleeve;sec(302,322,along(302,322,sl.c[0],sl.c[1]));
  line(303.5,-.78,320.5,-.78,'rgba(0,0,0,.45)',.3);line(303.5,.78,320.5,.78,'rgba(0,0,0,.45)',.3);
  if(sl.st==='crown'){crown(312,13,7.2,'rgba(80,46,0,.62)','rgba(255,244,180,.95)');gem(306,1.5,sl.gem);gem(318,1.5,sl.gem);gem(312,1.15,'#fff6c8')}
  else if(sl.st==='flake'){
    x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=.38*k;
    for(let a=0;a<6;a++){const an=a*Math.PI/3;x.beginPath();x.moveTo(X(312),cy);x.lineTo(X(312)+Math.cos(an)*4.6*k,cy+Math.sin(an)*4.6*k);x.stroke();
      const ex=X(312)+Math.cos(an)*3*k,ey=cy+Math.sin(an)*3*k;x.beginPath();x.moveTo(ex+Math.cos(an+1)*1.3*k,ey+Math.sin(an+1)*1.3*k);x.lineTo(ex,ey);x.lineTo(ex+Math.cos(an-1)*1.3*k,ey+Math.sin(an-1)*1.3*k);x.stroke()}
    gem(312,1.3,sl.gem);
  }else if(sl.st==='bars'){
    x.save();x.shadowColor=sl.ac;x.shadowBlur=4*k;
    for(const l of[306,309,315,318])line(l,-.55,l,.55,sl.ac,.7);
    x.restore();gem(312,1.8,sl.gem);
  }else if(sl.st==='scroll'){
    x.strokeStyle=p.ring;x.lineWidth=.4*k;x.beginPath();
    for(let l=304;l<=320;l+=.5){const yy=Math.sin((l-304)*.9)*.4*hw(l);l===304?x.moveTo(X(l),cy+yy):x.lineTo(X(l),cy+yy)}x.stroke();
    gem(312,2,sl.gem);gem(306,1.1,sl.gem);gem(318,1.1,sl.gem);
  }

  // торцевая накладка
  sec(322,CL+4,along(322,CL+3,p.cap[0],p.cap[1]));line(322,-1,322,1,'rgba(0,0,0,.5)',.4);

  // объём цилиндра: свет сверху, тень снизу
  const cg=x.createLinearGradient(0,cy-hw(CL)-1,0,cy+hw(CL)+1);
  cg.addColorStop(0,'rgba(0,0,0,.5)');cg.addColorStop(.1,'rgba(255,255,255,.34)');cg.addColorStop(.3,'rgba(255,255,255,.2)');cg.addColorStop(.47,'rgba(255,255,255,0)');cg.addColorStop(.72,'rgba(0,0,0,.2)');cg.addColorStop(.92,'rgba(0,0,0,.45)');cg.addColorStop(1,'rgba(0,0,0,.7)');
  x.fillStyle=cg;x.fillRect(0,0,w,h);
  const sp=x.createLinearGradient(X(0),0,X(CL),0);sp.addColorStop(0,'rgba(255,255,255,0)');sp.addColorStop(.08,'rgba(255,255,255,.7)');sp.addColorStop(.9,'rgba(255,255,255,.5)');sp.addColorStop(1,'rgba(255,255,255,0)');
  x.strokeStyle=sp;x.lineWidth=.75*k;x.lineCap='round';x.beginPath();x.moveTo(X(2),cy-hw(2)*.47);x.lineTo(X(CL-3),cy-hw(CL-3)*.47);x.stroke();
  x.restore();
  x.lineWidth=.42*k;x.strokeStyle='rgba(0,0,0,.65)';outline();x.stroke();

  // мягкая тень под кием (рисуется со сдвигом, поэтому отдельный спрайт)
  const sc=document.createElement('canvas');sc.width=w;sc.height=h;const sx=sc.getContext('2d');
  sx.shadowColor='rgba(0,0,0,.42)';sx.shadowBlur=3*k;sx.shadowOffsetX=w*2;sx.fillStyle='#000';
  sx.translate(-w*2,0);sx.beginPath();sx.moveTo(X(0),cy-hw(0));sx.lineTo(X(CL),cy-hw(CL));sx.lineTo(X(CL),cy+hw(CL));sx.lineTo(X(0),cy+hw(0));sx.closePath();sx.fill();
  return SPR[key]={img:cv,sh:sc,k,pad:PAD,H:HH};
}
function cue(x,c,a,pull,id){
  const dx=Math.cos(a),dy=Math.sin(a),ox=c.x-dx*pull,oy=c.y-dy*pull,k=Math.max(2,Math.ceil((S.cv.width/W)*2)),sp=cueSprite(id,k),z=1/sp.k;
  x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
  for(const[img,ex,ey]of[[sp.sh,4,5],[sp.img,0,0]]){
    x.save();x.translate(ox+ex,oy+ey);x.rotate(a+Math.PI);x.scale(z,z);x.drawImage(img,-sp.pad*sp.k,-sp.H*sp.k/2);x.restore();
  }
}
// превью в магазине: part 0 = весь кий, 1 = увеличенная рукоять с узорами
function cueDraw(cv){
  const sp=cueSprite(cv.dataset.cue,5),z=cv.dataset.z==='1',sx=z?(sp.pad+166)*sp.k:0,sw=z?sp.img.width-sx:sp.img.width,sy=5*sp.k,sh=26*sp.k;
  cv.width=900;cv.height=Math.round(900*sh/sw);
  const x=cv.getContext('2d');x.imageSmoothingQuality='high';x.clearRect(0,0,cv.width,cv.height);
  x.drawImage(sp.img,sx,sy,sw,sh,0,0,cv.width,cv.height);
}
function draw(){
  const cv=S.cv,x=cv.getContext('2d'),s=cv.width/W;
  if(!S.tbl||S.tbl.width!==cv.width){
    const t=document.createElement('canvas');t.width=cv.width;t.height=cv.height;
    const tx=t.getContext('2d');tx.setTransform(s,0,0,s,0,0);paintTable(tx);S.tbl=t;
  }
  x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);x.drawImage(S.tbl,0,0);x.setTransform(s,0,0,s,0,0);
  for(let i=15;i>0;i--)ball(x,S.B[i],i);
  ball(x,S.B[0],0);
  if(S.k){
    const k=S.k,c=S.B[0],pull=R+7+k.v*70,gap=R+1.5;
    let d;
    if(k.wind&&k.t<.36){const u=k.t/.36;d=R+7+(pull-R-7)*(1-(1-u)*(1-u))}
    else{const u=Math.min(1,(k.wind?k.t-.36:k.t)/.14);d=pull-(pull-gap)*u*u}
    cue(x,c,k.a,d,k.pal);
  }
  if(mine()&&S.hand){x.setLineDash([4,4]);x.strokeStyle='rgba(255,214,90,.95)';x.lineWidth=2;x.beginPath();x.arc(S.B[0].x,S.B[0].y,R+6,0,7);x.stroke();x.setLineDash([])}
  if(S.aim&&mine()){
    const c=S.B[0],a=S.aim.a,dx=Math.cos(a),dy=Math.sin(a),h=ray(c,dx,dy);
    const lg=x.createLinearGradient(c.x,c.y,h.x,h.y);lg.addColorStop(0,'rgba(255,255,255,.95)');lg.addColorStop(1,'rgba(255,255,255,.35)');
    x.setLineDash([9,7]);x.strokeStyle=lg;x.lineWidth=2.2;x.lineCap='round';x.beginPath();x.moveTo(c.x+dx*R,c.y+dy*R);x.lineTo(h.x,h.y);x.stroke();x.setLineDash([]);
    x.beginPath();x.arc(h.x,h.y,R,0,7);x.fillStyle='rgba(255,255,255,.14)';x.fill();x.strokeStyle='rgba(255,255,255,.9)';x.lineWidth=1.8;x.stroke();
    if(h.i){
      const o=S.B[h.i],nx=o.x-h.x,ny=o.y-h.y,nl=Math.hypot(nx,ny)||1,ux=nx/nl,uy=ny/nl;
      x.strokeStyle='rgba(255,214,90,.95)';x.lineWidth=2.4;x.beginPath();x.moveTo(o.x,o.y);x.lineTo(o.x+ux*70,o.y+uy*70);x.stroke();
      const dp=dx*ux+dy*uy,tx=dx-dp*ux,ty=dy-dp*uy,tl=Math.hypot(tx,ty);
      if(tl>.05){x.strokeStyle='rgba(255,255,255,.45)';x.lineWidth=1.8;x.beginPath();x.moveTo(h.x,h.y);x.lineTo(h.x+tx/tl*38,h.y+ty/tl*38);x.stroke()}
    }
    cue(x,c,a,R+7+S.aim.v*70,(typeof cuePal==='function'&&cuePal(P[ME.id]))||'def');
    x.fillStyle='rgba(0,0,0,.5)';rr(x,W-M-130,H-14,130,8,4);x.fill();
    const pg=x.createLinearGradient(W-M-130,0,W-M,0);pg.addColorStop(0,'#38d27a');pg.addColorStop(.6,'#f2c230');pg.addColorStop(1,'#e5484d');
    x.save();rr(x,W-M-130,H-14,130,8,4);x.clip();x.fillStyle=pg;x.fillRect(W-M-130,H-14,Math.max(8,130*S.aim.v),8);x.restore();
  }
}
function loop(ts){
  const dt=Math.min((ts-S.last)/1000||0,.05);S.last=ts;
  if(S.mode==='strike'){S.k.t+=dt;if(S.k.t>=(S.k.wind?.5:.14))launch()}
  if(S.mode==='anim'){
    S.acc+=dt;let end=false;
    while(S.acc>=DT){S.acc-=DT;step(S.B,S.ev);S.steps++;if(!moving(S.B)||S.steps>2880){end=true;break}}
    const fx=S.ev&&S.ev.fx;
    if(fx&&fx.length){
      if(typeof Snd!=='undefined'){const m={};for(const f of fx)m[f[0]]=Math.max(m[f[0]]||0,f[1]==null?.6:f[1]);for(const k in m)try{Snd.play(k,m[k])}catch(e){}}
      fx.length=0;
    }
    if(end){S.mode='idle';for(const b of S.B)b.vx=b.vy=0;const cb=S.cb;S.cb=null;if(cb)cb(S.ev)}
  }
  for(const b of S.B)if(b.in&&b.t<1)b.t=Math.min(1,b.t+dt*4);
  if(S.cv&&S.cv.isConnected)draw();
  if(live())requestAnimationFrame(loop);else S.raf=0;
}
function mount(){
  if(!live())return;
  const w=$('#pcw');if(!w)return;
  if(!S.cv){S.cv=document.createElement('canvas');S.cv.id='pc';wire(S.cv)}
  w.appendChild(S.cv);
  const cw=Math.round(w.clientWidth*Math.min(devicePixelRatio||1,2));
  if(cw>0&&S.cv.width!==cw){S.cv.width=cw;S.cv.height=Math.round(cw/2)}
  sync();
  if(!S.raf){S.raf=1;S.last=performance.now();requestAnimationFrame(loop)}
}

/* ---------- экран партии ---------- */
function view(){
  const g=GM,col=myCol(g),e=g.hist[g.hist.length-1],t=e?e.p:'w',gr=e?e.g:['',''],hand=e?e.h:0;
  const can=g.status==='play'&&col===t,off=g.status!=='play'||!col?'disabled':'';
  const gn=c=>{const x=gr[c==='w'?0:1];return x==='s'?'цельные 1–7':x==='t'?'полосатые 9–15':'группа не выбрана'};
  const card=c=>{const p=P[c==='w'?g.white:g.black];return `<div class="pl ${g.status==='play'&&t===c?'act':''}">${av(p)}<div class="n"><b>${p?(typeof pn==='function'?pn(p):esc(p.name)):'Ждём соперника…'}</b><small>🎱 ${rate(p,'pool')} · ${gn(c)}</small></div></div>`};
  const B=e?par(e.s):rack();let tray='';
  for(let i=1;i<16;i++)if(B[i].in){const c=COL[i>8?i-8:i];tray+=`<i class="tb" style="background:${i>8?`linear-gradient(#f4f1e8 22%,${c} 22% 78%,#f4f1e8 78%)`:c}">${i}</i>`}
  let st;
  if(g.status==='open')st='Ждём соперника…';
  else if(g.status==='done'){const w=P[g.result==='w'?g.white:g.black];st='🏆 '+(w?esc(w.name):'Игрок')+' побеждает'+(g.rated?'. Рейтинг обновлён.':'.')}
  else{
    st=can?(hand?'Поставьте биту (потяните её) и бейте':'Ваш удар: потяните от биты назад и отпустите'):col?'Ход соперника':'Ход '+(t==='w'?'первого игрока':'второго игрока');
    if(e&&e.f)st='⚠ Фол. '+st;
  }
  let ban='';
  if(g.status==='open'&&col)ban='<div class="ban"><button data-a="cancel">Отменить вызов</button></div>';
  if(g.status==='play'&&g.draw_by&&col)ban=g.draw_by===col?'<div class="ban">Вы предложили ничью</div>':'<div class="ban">Соперник предлагает ничью<div class="row"><button class="pri" data-a="dyes">Принять</button><button data-a="dno">Отклонить</button></div></div>';
  return `${card(col==='w'?'b':'w')}<div id="pcw"></div>${card(col==='w'?'w':'b')}<div class="tray">${tray}</div><div id="st" class="${g.status==='open'?'wait':g.status==='done'?'fin':''}">${st}</div>${ban}
  <div class="row"><button data-a="draw" ${off}>Ничья</button><button data-a="resign" ${off}>Сдаться</button><button class="pri" data-a="back">Лобби</button></div>`;
}

if(typeof document!=='undefined'){
  const s=document.createElement('style');
  s.textContent=`#pc{display:block;width:100%;border-radius:18px;touch-action:none;box-shadow:0 24px 40px -16px rgba(0,0,0,.8),0 0 0 2px rgba(201,162,75,.55),0 0 36px rgba(33,160,98,.18)}
#pcw{min-height:40px}
.tray{display:flex;flex-wrap:wrap;gap:4px;min-height:26px;align-items:center}
.tb{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:700 11px system-ui,sans-serif;font-style:normal;color:#fff;text-shadow:0 0 2px #000;box-shadow:inset -2px -3px 4px rgba(0,0,0,.35),0 1px 2px rgba(0,0,0,.4)}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0}
.tiles button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 4px;border-radius:16px;font-weight:600;background:var(--bg);background:linear-gradient(160deg,color-mix(in srgb,var(--btn) 22%,var(--bg)),var(--bg));border:1px solid color-mix(in srgb,var(--btn) 40%,transparent);transition:transform .15s}
.tiles button i{font-style:normal;font-size:30px;line-height:1;transition:transform .25s cubic-bezier(.2,.8,.3,1.4)}
.tiles button:active{transform:scale(.95)}
.tiles button:active i{transform:scale(1.2) rotate(-8deg)}`;
  document.head.appendChild(s);
}
return{view,mount,cueDraw,cueSprite,CUES,T:{rack,step,rules,ser,par,moving,mk,RK8}};
})();
