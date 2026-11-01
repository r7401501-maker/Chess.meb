/* Звуки и вибрация для всех игр. Всё синтезируется на лету через Web Audio, аудиофайлов нет.
   Шахматы: тихий тёплый стук дерева. Шашки: мягкий глухой «войлочный» звук. Бильярд: щелчок шаров, глухой борт, падение в лузу.
   Общий тракт: мягкий фильтр + компрессор + короткая «комната» (реверберация), поэтому звук объёмный, а не писклявый. */
const Snd=(()=>{
const KEY='ch_snd';
let st={};try{st=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){}
const o={on:st.on!==false,vib:st.vib!==false};
let ac=null,A=null;const last={};
const rnd=(a,b)=>a+Math.random()*(b-a);

// короткая тёплая комната: затухающий шум, слегка приглушённый
function room(c){
  const n=Math.floor(c.sampleRate*.55),b=c.createBuffer(2,n,c.sampleRate);
  for(let ch=0;ch<2;ch++){
    const d=b.getChannelData(ch);let y=0;
    for(let i=0;i<n;i++){
      const t=i/c.sampleRate;y=y*.62+(Math.random()*2-1)*.38;
      d[i]=y*Math.exp(-t*8.5)*Math.min(1,t/.008);
    }
  }
  return b;
}
function build(c){
  const comp=c.createDynamicsCompressor();
  comp.threshold.value=-22;comp.knee.value=20;comp.ratio.value=3;comp.attack.value=.003;comp.release.value=.22;
  const mg=c.createGain();mg.gain.value=.9;comp.connect(mg);mg.connect(c.destination);
  const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=9000;lp.Q.value=.4;
  const dry=c.createGain();dry.gain.value=1;lp.connect(dry);dry.connect(comp);
  const rv=c.createConvolver();rv.buffer=room(c);const wet=c.createGain();wet.gain.value=.17;
  lp.connect(rv);rv.connect(wet);wet.connect(comp);
  const nb=c.createBuffer(1,c.sampleRate,c.sampleRate),d=nb.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  return{c,in:lp,nb,d:lp};
}
function ctx(){
  if(ac)return ac;
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ac=new C();A=build(ac)}catch(e){ac=null;A=null}
  return ac;
}
// у каждого звука своя лёгкая панорама, чтобы повторы не звучали одинаково
function begin(p){
  const c=A.c;
  if(c.createStereoPanner){const s=c.createStereoPanner();s.pan.value=p||0;s.connect(A.in);A.d=s}else A.d=A.in;
}
// затухающий тон (мода дерева, шара, ноты)
function ring(f,d,v,t,x){
  x=x||{};const c=A.c,T=c.currentTime+(t||0),s=c.createOscillator(),g=c.createGain();
  s.type=x.type||'sine';s.frequency.setValueAtTime(f,T);
  if(x.f2)s.frequency.exponentialRampToValueAtTime(x.f2,T+d);
  g.gain.setValueAtTime(.0001,T);g.gain.linearRampToValueAtTime(v,T+(x.a||.002));g.gain.exponentialRampToValueAtTime(.0001,T+d);
  s.connect(g);g.connect(A.d);s.start(T);s.stop(T+d+.05);
}
// шумовой щелчок: контакт, трение
function hit(v,t,f,d,q,type){
  const c=A.c,T=c.currentTime+(t||0),s=c.createBufferSource(),b=c.createBiquadFilter(),g=c.createGain();
  s.buffer=A.nb;b.type=type||'bandpass';b.frequency.value=f;b.Q.value=q||1;
  g.gain.setValueAtTime(v,T);g.gain.exponentialRampToValueAtTime(.0001,T+d);
  s.connect(b);b.connect(g);g.connect(A.d);s.start(T,Math.random()*.5,d+.05);
}
// шум с плавным спадом частоты (катится по сукну, шар в кармане)
function sweep(v,t,f0,f1,d){
  const c=A.c,T=c.currentTime+(t||0),s=c.createBufferSource(),b=c.createBiquadFilter(),g=c.createGain();
  s.buffer=A.nb;b.type='lowpass';b.Q.value=.7;b.frequency.setValueAtTime(f0,T);b.frequency.exponentialRampToValueAtTime(f1,T+d);
  g.gain.setValueAtTime(.0001,T);g.gain.linearRampToValueAtTime(v,T+.03);g.gain.exponentialRampToValueAtTime(.0001,T+d);
  s.connect(b);b.connect(g);g.connect(A.d);s.start(T,Math.random()*.4,d+.05);
}
// деревянный блок: основной тон и неточные обертоны, у каждого свой срок затухания
function wood(f,v,t,d){
  ring(f,d,v,t);ring(f*2.35,d*.6,v*.42,t);ring(f*4.1,d*.35,v*.2,t);
}
// нота маримбы: мягкая атака, короткий верхний обертон
function mar(f,v,t,d){
  ring(f,d,v,t,{a:.004});ring(f*4,d*.22,v*.26,t);ring(f*10,.03,v*.08,t);hit(v*.35,t,f*3,.006,1);
}
const arp=(fs,v,gap,d)=>fs.forEach((f,i)=>mar(f,v,i*gap,d));

const S={
  /* ---- шахматы: тихий деревянный стук ---- */
  move:()=>{const r=rnd(.95,1.05);begin(rnd(-.12,.12));
    hit(.36,0,2300*r,.009,.8);wood(238*r,.5,0,.1);ring(118*r,.15,.42,0,{f2:90*r});hit(.1,.017,1700*r,.007,1)},
  capture:()=>{const r=rnd(.95,1.05);begin(rnd(-.12,.12));
    hit(.26,0,2000*r,.01,.8);wood(215*r,.32,0,.1);ring(112*r,.16,.26,0,{f2:84*r});
    hit(.3,.052,1700*r,.012,.8);wood(190*r,.38,.052,.13);ring(98*r,.2,.34,.052,{f2:72*r})},
  check:()=>{begin(0);wood(560,.2,0,.085);wood(660,.21,.11,.1);ring(1320,.45,.04,.11)},
  promo:()=>{begin(0);arp([523.25,659.25,783.99,1046.5],.15,.075,.4)},

  /* ---- шашки: мягкий, глухой, «войлочный» ---- */
  dmove:()=>{const r=rnd(.95,1.05);begin(rnd(-.1,.1));
    hit(.14,0,1000*r,.016,.6);wood(168*r,.42,0,.13);ring(92*r,.19,.36,0,{f2:70*r})},
  dcapture:()=>{const r=rnd(.95,1.05);begin(rnd(-.1,.1));
    hit(.12,0,950*r,.018,.6);wood(160*r,.34,0,.13);ring(88*r,.2,.3,0,{f2:68*r});
    hit(.12,.065,850*r,.02,.6);wood(140*r,.3,.065,.16);ring(78*r,.24,.28,.065,{f2:58*r})},
  dking:()=>{begin(0);S.dmove();ring(784,.55,.07,.05);ring(1175,.6,.045,.09);ring(1568,.7,.025,.14)},

  /* ---- общие ---- */
  start:()=>{begin(0);mar(392,.13,0,.4);mar(587.33,.14,.13,.55)},
  win:()=>{begin(0);arp([523.25,659.25,783.99,1046.5,1318.5],.15,.105,.65);ring(261.63,1.5,.05,0,{a:.05});ring(392,1.4,.03,.1,{a:.05})},
  lose:()=>{begin(0);arp([440,349.23,293.66],.13,.17,.55)},
  draw:()=>{begin(0);mar(440,.12,0,.45);mar(440,.11,.22,.55)},
  tick:()=>{begin(0);hit(.4,0,2600,.01,1);wood(920,.24,0,.045)},

  /* ---- бильярд ---- */
  // удар кием по бите: сухой щелчок наклейки и глухой толчок
  cue:x=>{begin(rnd(-.1,.1));
    hit(1+x*.4,0,3400,.007,2);ring(2900,.03,.28+x*.16,0);ring(150+x*60,.13,1+x*.6,0,{f2:78});hit(.2,.01,900,.04,.7)},
  // шар о шар: фенольный звонкий щелчок, сила зависит от скорости
  ball:x=>{const v=.25+x*.75,r=rnd(.97,1.03);begin(rnd(-.35,.35));
    hit(v*2.4,0,4300,.005,1.5);ring(2450*r,.05+x*.04,.66*v,0);ring(4100*r,.03,.36*v,0);ring(1320*r,.07,.44*v,0);ring(340*r,.05,.58*v,0)},
  // шар о борт: глухой резиновый удар
  rail:x=>{const v=.2+x*.8;begin(rnd(-.4,.4));
    hit(v*.8,0,430,.03,.7);ring(96,.11,1.1*v,0,{f2:60});ring(215,.06,.3*v,0)},
  // шар в лузе: глухие отскоки и шорох по кожаной сетке
  pocket:()=>{begin(rnd(-.3,.3));
    ring(190,.1,.42,0,{f2:105});ring(165,.08,.26,.12,{f2:100});ring(145,.07,.15,.2,{f2:95});
    hit(.2,0,700,.03,.8);sweep(.14,.04,1100,260,.55)},
};
const H={start:['i','light'],move:['i','light'],capture:['i','medium'],check:['n','warning'],promo:['n','success'],win:['n','success'],lose:['n','error'],draw:['i','soft'],cue:['i','medium'],pocket:['i','light'],dmove:['i','soft'],dcapture:['i','light'],dking:['n','success']};
function hap(n){
  const h=H[n];if(!h)return;
  try{
    const t=window.Telegram&&Telegram.WebApp&&Telegram.WebApp.HapticFeedback;
    if(t){if(h[0]==='i')t.impactOccurred(h[1]);else t.notificationOccurred(h[1])}
    else if(navigator.vibrate)navigator.vibrate(h[0]==='n'?[30,40,30]:15);
  }catch(e){}
}
function play(n,x){
  if(!S[n])return;
  const now=performance.now(),gap=(n==='ball'||n==='rail')?35:60;
  if(now-(last[n]||0)<gap)return;
  last[n]=now;
  if(o.vib)hap(n);
  if(!o.on)return;
  const c=ctx();if(!c)return;
  if(c.state==='suspended')c.resume();
  try{S[n](Math.max(0,Math.min(1,x==null?.6:x)))}catch(e){}
}
function set(k,v){
  o[k]=!!v;
  try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}
  if(v){last.move=0;play(k==='vib'?'capture':'move')}
}
// отрисовка звука в буфер без воспроизведения (для проверки и записи образцов)
async function render(n,x,secs){
  const c=new OfflineAudioContext(2,Math.round(44100*(secs||1.5)),44100),prev=A;
  A=build(c);S[n](x==null?.6:x);
  const b=await c.startRendering();A=prev;return b;
}
['pointerdown','touchend','keydown'].forEach(e=>addEventListener(e,()=>{const c=ctx();if(c&&c.state==='suspended')c.resume()},{passive:true}));
return{play,set,render,get on(){return o.on},get vib(){return o.vib},names:Object.keys(S)};
})();
