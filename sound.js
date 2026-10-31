/* Звуки и вибрация для всех игр. Звуки синтезируются на лету через Web Audio, аудиофайлов нет. */
const Snd=(()=>{
const KEY='ch_snd';
let st={};try{st=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){}
const o={on:st.on!==false,vib:st.vib!==false};
let ac=null,mg=null,nb=null;const last={};

function ctx(){
  if(ac)return ac;
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
    ac=new C();mg=ac.createGain();mg.gain.value=.8;mg.connect(ac.destination);
    nb=ac.createBuffer(1,Math.floor(ac.sampleRate*.3),ac.sampleRate);
    const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  }catch(e){ac=null}
  return ac;
}
function tone(f,d,v,type,t0,f2){
  const t=ac.currentTime+(t0||0),g=ac.createGain(),s=ac.createOscillator();
  s.type=type||'sine';s.frequency.setValueAtTime(f,t);
  if(f2)s.frequency.exponentialRampToValueAtTime(f2,t+d);
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  s.connect(g);g.connect(mg);s.start(t);s.stop(t+d+.03);
}
function noise(d,v,f,q,t0){
  const t=ac.currentTime+(t0||0),s=ac.createBufferSource(),b=ac.createBiquadFilter(),g=ac.createGain();
  s.buffer=nb;b.type='bandpass';b.frequency.value=f;b.Q.value=q||1;
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  s.connect(b);b.connect(g);g.connect(mg);s.start(t);s.stop(t+d+.03);
}
const arp=(fs,d,v,gap,type)=>fs.forEach((f,i)=>tone(f,d,v,type||'triangle',i*gap));
const S={
  move:()=>{noise(.05,.5,1800,1.2);tone(210,.09,.5,'sine',0,120)},
  capture:()=>{noise(.07,.7,1400,1);tone(160,.12,.7,'triangle',0,80);noise(.04,.4,2400,2,.07)},
  check:()=>{tone(660,.14,.25);tone(880,.2,.25,'sine',.12)},
  promo:()=>arp([523,659,784,1047],.16,.22,.07),
  start:()=>{tone(392,.16,.25);tone(587,.28,.25,'sine',.14)},
  win:()=>arp([523,659,784,1047],.3,.26,.11),
  lose:()=>arp([392,330,262],.4,.22,.16),
  draw:()=>{tone(440,.25,.22);tone(440,.3,.22,'sine',.2)},
  tick:()=>tone(1300,.04,.2,'square'),
  cue:x=>{noise(.03,.8,3200,2);tone(120+x*60,.1,.6+x*.3,'sine',0,70)},
  ball:x=>{noise(.03,.2+x*.6,3600,3);tone(1700+x*400,.05,.12+x*.35)},
  rail:x=>{tone(110,.09,.15+x*.5,'sine',0,70);noise(.04,.1+x*.3,500,1)},
  pocket:()=>{tone(260,.22,.5,'sine',0,60);noise(.12,.25,500,1,.04)},
};
const H={start:['i','light'],move:['i','light'],capture:['i','medium'],check:['n','warning'],promo:['n','success'],win:['n','success'],lose:['n','error'],draw:['i','soft'],cue:['i','medium'],pocket:['i','light']};
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
['pointerdown','touchend','keydown'].forEach(e=>addEventListener(e,()=>{const c=ctx();if(c&&c.state==='suspended')c.resume()},{passive:true}));
return{play,set,get on(){return o.on},get vib(){return o.vib},names:Object.keys(S)};
})();
