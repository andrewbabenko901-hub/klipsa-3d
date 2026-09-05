// 39 элементов конструктора ClipGen. Каждый строит геометрию с верхом на y=0
// и растёт вниз на vysota(). Никаких булевых вычитаний.
import * as THREE from 'three';
import { cyl, box, tube, lathe, prizma, sektor, sechenie, slozhit, povernut } from './geom.js';

const T2 = Math.PI * 2;

export const ELEMENTY = {

  // ---------- ГОЛОВА ----------
  head_disc: { zona:'ГОЛОВА', imya:'Голова — диск', p:{d:18,t:2},
    v:v=>v.t, g:v=>cyl(v.d/2, v.d/2, v.t) },

  head_dome: { zona:'ГОЛОВА', imya:'Голова — купол', p:{d:16,t:2.6},
    v:v=>v.t, g:v=>{
      const R=v.d/2, pr=[]; const N=14;
      for(let i=0;i<=N;i++){const u=i/N; pr.push([R*Math.sqrt(Math.max(0,1-u*u)), v.t*u]);}
      pr.push([0, v.t]); return lathe(pr); } },

  head_rect: { zona:'ГОЛОВА', imya:'Голова — прямоугольник', p:{w:9,l:16,t:2},
    v:v=>v.t, g:v=>box(v.l, v.t, v.w) },

  head_screw: { zona:'ГОЛОВА', imya:'Голова винтовая', p:{d:12,t:3,drive:'torx'},
    v:v=>v.t, g:v=>{
      const l=[cyl(v.d/2, v.d/2*0.96, v.t)];
      const r=v.d*0.2, n=v.drive==='hex'?6:(v.drive==='torx'?6:2);
      if(v.drive==='slot') l.push(box(v.d*0.8, v.t*0.3, v.d*0.16, 0.01));
      else for(let i=0;i<n;i++) l.push(box(r*0.7, v.t*0.28, r*0.7, 0.01,
        r*0.8*Math.cos(T2*i/n), r*0.8*Math.sin(T2*i/n)));
      return slozhit(l); } },

  head_dish: { zona:'ГОЛОВА', imya:'Голова с чашкой', p:{d:16,t:3,dRec:9,dep:1.2},
    v:v=>v.t, g:v=>lathe([[0,0],[v.dRec/2,v.dep],[v.d/2,v.dep],[v.d/2,v.t],[0,v.t]]) },

  plate_hole: { zona:'ГОЛОВА', imya:'Площадка с окном', p:{w:14,l:22,t:1.8,okno:5},
    v:v=>v.t, g:v=>{
      const o=Math.max(0.4, v.okno/2);
      return slozhit([
        box(v.l, v.t, v.w/2-o, 0, 0,  (v.w/2+o)/2),
        box(v.l, v.t, v.w/2-o, 0, 0, -(v.w/2+o)/2),
        box(v.l/2-o, v.t, 2*o, 0,  (v.l/2+o)/2, 0),
        box(v.l/2-o, v.t, 2*o, 0, -(v.l/2+o)/2, 0)]); } },

  boss: { zona:'ГОЛОВА', imya:'Прилив квадратный', p:{w:5,h:2.2},
    v:v=>v.h, g:v=>box(v.w, v.h, v.w) },

  boss_round: { zona:'ГОЛОВА', imya:'Прилив круглый', p:{d:5,h:2.2},
    v:v=>v.h, g:v=>cyl(v.d/2, v.d/2, v.h) },

  washer_flat: { zona:'ГОЛОВА', imya:'Шайба плоская', p:{d:14,dBore:6,t:1.4},
    v:v=>v.t, g:v=>tube(v.d/2, v.dBore/2, v.t) },

  star_washer: { zona:'ГОЛОВА', imya:'Шайба звёздочка', p:{d:14,dBore:6,t:1,zub:8},
    v:v=>Math.max(v.t, v.t*2.2), g:v=>{
      const l=[tube(v.d/2*0.72, v.dBore/2, v.t)];
      for(let i=0;i<v.zub;i++){
        const a=T2*i/v.zub, R=v.d/2*0.86;
        l.push(box(v.d/2*0.34, v.t, v.d*0.14, 0, R*Math.cos(a), R*Math.sin(a), -a));
      } return slozhit(l); } },

  nut_hex: { zona:'ГОЛОВА', imya:'Гайка шестигранная', p:{s:10,dBore:5,h:6},
    v:v=>v.h, g:v=>{
      const R=v.s/Math.sqrt(3);
      return slozhit([prizma(R, v.h, 6), tube(v.dBore/2*1.001, v.dBore/2*0.999, v.h)]); } },

  // ---------- СЕРЕДИНА ----------
  stem_plain: { zona:'СЕРЕДИНА', imya:'Шейка гладкая', p:{d:5,len:10},
    v:v=>v.len, g:v=>cyl(v.d/2, v.d/2, v.len) },

  stem_split: { zona:'СЕРЕДИНА', imya:'Шейка разрезная', p:{d:6,len:12,legs:2,span:4,wing:1.4},
    v:v=>v.len, g:v=>{
      const l=[], n=Math.max(2, v.legs|0);
      for(let i=0;i<n;i++){
        const a=T2*i/n, sm=(v.span/2);
        l.push(box(v.d*0.45, v.len, v.d*0.45, 0, sm*Math.cos(a), sm*Math.sin(a), -a));
        l.push(box(v.wing, v.len*0.16, v.d*0.5, -v.len*0.8,
                   (sm+v.wing*0.6)*Math.cos(a), (sm+v.wing*0.6)*Math.sin(a), -a));
      } return slozhit(l); } },

  skirt: { zona:'СЕРЕДИНА', imya:'Юбка', p:{d:20,t:0.9,h:2.2},
    v:v=>v.h, g:v=>lathe([[v.d*0.16,0],[v.d/2,v.h],[v.d/2,v.h+v.t*0.01],[v.d*0.16,v.t]]) },

  cone_ring: { zona:'СЕРЕДИНА', imya:'Воротник-ограничитель', p:{d:16,dLow:9,h:4,t:1},
    v:v=>v.h, g:v=>{
      const rv=v.d/2, rn=v.dLow/2, t=Math.max(0.4,v.t);
      return lathe([[Math.max(0.3,rv-t),0],[rv,0],[rn,v.h],[Math.max(0.3,rn-t),v.h]],0,64,true); } },

  disc_stack: { zona:'СЕРЕДИНА', imya:'Стопка дисков', p:{d:16,dLow:12,t:1.4,t2:1.4,n:3,gap:2},
    v:v=>{const n=Math.max(1,Math.min(4,v.n|0)); const t2=v.t2>0?v.t2:v.t;
          return n>1?((v.t+t2)/2*n+(n-1)*v.gap):v.t;},
    g:v=>{
      const n=Math.max(1,Math.min(4,v.n|0)), t2=v.t2>0?v.t2:v.t, l=[]; let y=0;
      for(let i=0;i<n;i++){
        const k=n>1?i/(n-1):0, d=v.d+(v.dLow-v.d)*k, t=v.t+(t2-v.t)*k;
        l.push(cyl(d/2,d/2,t,y)); y-=t;
        if(i<n-1){ l.push(cyl(Math.min(d,v.dLow)*0.3, Math.min(d,v.dLow)*0.3, v.gap, y)); y-=v.gap; }
      } return slozhit(l); } },

  spool: { zona:'СЕРЕДИНА', imya:'Катушка', p:{d:14,dLow:14,dCore:6,t:1.5,h:8},
    v:v=>v.h, g:v=>slozhit([
      cyl(v.d/2,v.d/2,v.t,0),
      cyl(v.dCore/2,v.dCore/2,Math.max(0.1,v.h-2*v.t),-v.t),
      cyl(v.dLow/2,v.dLow/2,v.t,-(v.h-v.t))]) },

  bushing: { zona:'СЕРЕДИНА', imya:'Втулка', p:{d:10,dLow:10,len:8,wall:1.2},
    v:v=>v.len, g:v=>lathe([
      [v.d/2,0],[v.dLow/2,v.len],
      [Math.max(0.3,v.dLow/2-v.wall),v.len],[Math.max(0.3,v.d/2-v.wall),0]],0,64,true) },

  thread_out: { zona:'СЕРЕДИНА', imya:'Резьба наружная', p:{d:8,len:14,pitch:1.25},
    v:v=>v.len, g:v=>{
      const l=[cyl(v.d/2*0.82,v.d/2*0.82,v.len)], n=Math.max(2,Math.floor(v.len/v.pitch));
      for(let i=0;i<n;i++) l.push(lathe([[v.d/2*0.82,0],[v.d/2,v.pitch*0.35],[v.d/2*0.82,v.pitch*0.7]],
                                        -i*v.pitch-0.1,48));
      return slozhit(l); } },

  thread_in: { zona:'СЕРЕДИНА', imya:'Резьба внутренняя', p:{d:8,h:10,pitch:1.25},
    v:v=>v.h, g:v=>tube(v.d/2*1.35, v.d/2, v.h) },

  strap: { zona:'СЕРЕДИНА', imya:'Лента', p:{w:4,t:1.2,len:60},
    v:v=>v.len, g:v=>box(v.w, v.len, v.t) },

  plate_tie: { zona:'СЕРЕДИНА', imya:'Замок стяжки', p:{w:8,l:10,t:4,slotW:4.4},
    v:v=>v.t, g:v=>{
      const s=v.slotW/2;
      return slozhit([
        box(v.l, v.t, (v.w/2-s), 0, 0,  (v.w/2+s)/2),
        box(v.l, v.t, (v.w/2-s), 0, 0, -(v.w/2+s)/2),
        box((v.l/2-s), v.t, 2*s, 0,  (v.l/2+s)/2, 0),
        box((v.l/2-s), v.t, 2*s, 0, -(v.l/2+s)/2, 0)]); } },

  saddle: { zona:'СЕРЕДИНА', imya:'Седло под жгут', p:{bundleD:12,wall:2,gapDeg:70},
    v:v=>v.bundleD+2*v.wall, g:v=>{
      // разомкнутое кольцо: строим сектор-за-сектором, вычитаний нет
      const R=v.bundleD/2+v.wall, r=v.bundleD/2, sh=v.bundleD*0.9;
      const a0=(v.gapDeg/2)*Math.PI/180, a1=T2-a0, N=40, l=[];
      for(let i=0;i<N;i++){
        const b0=a0+(a1-a0)*i/N, b1=a0+(a1-a0)*(i+1)/N, bm=(b0+b1)/2;
        const dl=(R+r)/2*(b1-b0)*1.06;
        l.push(box(R-r, sh, Math.max(dl,0.2), -v.wall,
                   (R+r)/2*Math.cos(bm), (R+r)/2*Math.sin(bm), -bm));
      } return slozhit(l); } },

  conn_body: { zona:'СЕРЕДИНА', imya:'Корпус разъёма', p:{w:12,l:18,h:8,n:3,dBore:2.4},
    v:v=>v.h, g:v=>{
      const l=[box(v.l, v.h, v.w)], n=Math.max(1,v.n|0);
      for(let i=0;i<n;i++){
        const x=(i-(n-1)/2)*v.l/(n+0.4);
        const g=cyl(v.dBore/2*1.2, v.dBore/2*1.2, v.h*0.12, 0.02, 24);
        g.translate(x,0,0); l.push(g);
      } return slozhit(l); } },

  // ---------- ЛАПКА ----------
  stem_fin: { zona:'ЛАПКА', imya:'Ёлочка', p:{d:5,len:14,barbD:8.3,n:5},
    v:v=>v.len, g:v=>{
      const n=Math.max(1,v.n|0), l=[cyl(v.d/2, v.d/2*0.85, v.len)];
      const shag=v.len/n;
      for(let i=0;i<n;i++)
        l.push(lathe([[v.d/2*0.98,0],[v.barbD/2,shag*0.72],[v.d/2*0.98,shag*0.78]], -i*shag));
      return slozhit(l); } },

  fin_spiral: { zona:'ЛАПКА', imya:'Ёлочка винтовая', p:{d:5,len:14,barbD:9,vitkov:5},
    v:v=>v.len, g:v=>{
      const l=[cyl(v.d/2,v.d/2,v.len)], n=Math.max(1,v.vitkov|0), shag=v.len/n;
      for(let i=0;i<n;i++) l.push(povernut(
        lathe([[v.d/2,0],[v.barbD/2,shag*0.7],[v.d/2,shag*0.75]], -i*shag), i*0.6));
      return slozhit(l); } },

  cone_split: { zona:'ЛАПКА', imya:'Разрезной конус', p:{d:16,dLow:9,len:4,bore:1,legs:2,gap:2,nasechki:0},
    v:v=>v.len, g:v=>{
      const n=Math.max(2,v.legs|0), l=[], zaz=Math.max(0.05, v.gap/Math.max(v.d,1));
      for(let i=0;i<n;i++){
        const a0=T2*i/n+zaz/2, a1=T2*(i+1)/n-zaz/2;
        l.push(sektor(v.d/2, Math.max(0.3,v.dLow/2), v.len, a0, a1));
      }
      if(v.bore>0.2) l.push(cyl(v.bore/2, v.bore/2, v.len*0.999, -0.0005));
      return slozhit(l); } },

  cone_ribs: { zona:'ЛАПКА', imya:'Нос с плоскими рёбрами', p:{d:12,dLow:0.5,len:14,rebra:4,t:2.8,core:0.68,plecho:0.10,poyas:0.83},
    v:v=>v.len, g:v=>{
      const R0=v.d/2, R1=Math.max(0.15,v.dLow/2), Rp=R0*0.59;
      const n=Math.max(3, v.rebra|0), shag=T2/n, dirs=[];
      for(let k=0;k<n;k++) dirs.push(shag*k);
      const Rof=u=> u<=v.plecho ? R0
                  : (u<=v.poyas ? R0+(Rp-R0)*(u-v.plecho)/(v.poyas-v.plecho)
                                : Rp+(R1-Rp)*(u-v.poyas)/(1-v.poyas));
      return sechenie((a,u)=>{
        const R=Rof(u), half=Math.min(v.t, 1.35*R)/2;
        let best=R*v.core;
        for(const d of dirs){
          let dth=((a-d+Math.PI)%T2+T2)%T2-Math.PI;
          const c=Math.cos(dth); if(c<=1e-6) continue;
          const s=Math.abs(Math.sin(dth));
          const val = s<1e-9 ? R/c : Math.min(R/c, half/s);
          if(val>best) best=val;
        }
        return best;
      }, v.len); } },

  tip_cone: { zona:'ЛАПКА', imya:'Носик-конус', p:{d:5,len:2.2},
    v:v=>v.len, g:v=>cyl(v.d/2, 0.25, v.len) },

  stem_cage: { zona:'ЛАПКА', imya:'Клетка с окнами', p:{d:10,len:14,legs:4,gap:1.4,okno:6,wing:1.2},
    v:v=>v.len, g:v=>{
      const n=Math.max(2,v.legs|0), l=[], R=v.d/2, sh=(v.d-v.gap)*0.16;
      for(let i=0;i<n;i++){
        const a=T2*i/n;
        l.push(box(sh, v.len, v.d*0.34, 0, (R-sh/2)*Math.cos(a), (R-sh/2)*Math.sin(a), -a));
        l.push(box(v.wing, v.len*0.12, v.d*0.3, -v.len*0.62,
                   (R+v.wing*0.4)*Math.cos(a), (R+v.wing*0.4)*Math.sin(a), -a));
      }
      l.push(cyl(R*0.98,R*0.98,Math.max(0.6,v.len*0.08),0));
      l.push(cyl(R*0.75,R*0.5,Math.max(0.6,v.len*0.1),-(v.len-0.6)));
      return slozhit(l); } },

  blade_legs: { zona:'ЛАПКА', imya:'Лапки-лезвия', p:{w:8,t:1.6,len:12,legs:2,wing:1.6,core:3},
    v:v=>v.len, g:v=>{
      const n=Math.max(2,v.legs|0), l=[cyl(v.core/2, v.core/2, v.len*0.35)];
      for(let i=0;i<n;i++){
        const a=T2*i/n;
        l.push(box(v.t, v.len, v.w, 0, (v.w*0)*Math.cos(a), 0, -a));
        l.push(box(v.wing, v.len*0.2, v.w*0.9, -v.len*0.7,
                   (v.t/2+v.wing/2)*Math.cos(a), (v.t/2+v.wing/2)*Math.sin(a), -a));
      } return slozhit(l); } },

  legs_u: { zona:'ЛАПКА', imya:'Лапки U-скобой', p:{w:5,t:1.6,len:13,span:7},
    v:v=>v.len, g:v=>{
      const s=v.span/2;
      return slozhit([
        box(v.t, v.len-v.t, v.w, 0,  s, 0),
        box(v.t, v.len-v.t, v.w, 0, -s, 0),
        box(v.span+v.t, v.t, v.w, -(v.len-v.t))]); } },

  wings_up: { zona:'ЛАПКА', imya:'Крылья вверх', p:{w:4,t:1.4,h:9,spread:12,legs:2},
    v:v=>v.h, g:v=>{
      const n=Math.max(2,v.legs|0), l=[cyl(v.w/2, v.w/2, v.h)];
      for(let i=0;i<n;i++){
        const a=T2*i/n;
        const g1=box(v.t, v.h*1.05, v.w, 0, (v.spread/4)*Math.cos(a), (v.spread/4)*Math.sin(a), -a);
        g1.rotateZ(0.28*Math.cos(a)); l.push(g1);
      } return slozhit(l); } },

  hvostovik: { zona:'ЛАПКА', imya:'Хвостовик с отогнутыми лапками', p:{d:3,w:3,t:1.4,len:8,spread:8,foot:2.4,legs:2},
    v:v=>v.len, g:v=>{
      const n=Math.max(2,v.legs|0), l=[cyl(v.d/2, v.d/2, v.len*0.3)];
      for(let i=0;i<n;i++){
        const a=T2*i/n;
        const x0=(v.d/2)*Math.cos(a), z0=(v.d/2)*Math.sin(a);
        const noga=box(v.t, v.len, v.w, 0, 0, 0, 0);
        noga.rotateZ(Math.atan2(v.spread/2-v.d/2, v.len));
        noga.rotateY(-a);
        noga.translate(x0, 0, z0);
        l.push(noga);
        l.push(box(v.foot, v.t, v.w, -v.len+v.t,
                   (v.spread/2)*Math.cos(a), (v.spread/2)*Math.sin(a), -a));
      } return slozhit(l); } },

  hook_leg: { zona:'ЛАПКА', imya:'Лапка с крючком', p:{w:5,t:1.6,len:12,hook:2.4},
    v:v=>v.len, g:v=>slozhit([
      box(v.t, v.len, v.w),
      box(v.hook, v.t, v.w, -(v.len-v.t), v.hook/2)]) },

  box_cage: { zona:'ЛАПКА', imya:'Коробчатая клетка', p:{w:10,l:14,h:10,wall:1.4},
    v:v=>v.h, g:v=>slozhit([
      box(v.l, v.h, v.wall, 0, 0,  (v.w-v.wall)/2),
      box(v.l, v.h, v.wall, 0, 0, -(v.w-v.wall)/2),
      box(v.wall, v.h, v.w-2*v.wall, 0,  (v.l-v.wall)/2),
      box(v.wall, v.h, v.w-2*v.wall, 0, -(v.l-v.wall)/2)]) },

  wire_bow: { zona:'ЛАПКА', imya:'Проволочная скоба', p:{d:1.8,w:12,h:10},
    v:v=>v.h, g:v=>{
      const l=[], N=28, R=v.w/2;
      for(let i=0;i<N;i++){
        const a=Math.PI*i/(N-1), x=R*Math.cos(a), y=-v.h+R*Math.sin(a)*0.6;
        const g=cyl(v.d/2, v.d/2, v.d*1.4, y, 12); g.translate(x,0,0); l.push(g);
      }
      l.push(box(v.d, v.h*0.7, v.d, 0,  R), box(v.d, v.h*0.7, v.d, 0, -R));
      return slozhit(l); } },

  mandrel: { zona:'ЛАПКА', imya:'Оправка', p:{d:3,len:16,up:2},
    v:v=>v.len, g:v=>slozhit([cyl(v.d/2,v.d/2,v.len), cyl(v.d*0.8,v.d*0.8,v.up,0)]) },

  ring_lug: { zona:'ЛАПКА', imya:'Кольцевой наконечник', p:{d:12,dBore:5,t:1.2,w:6,len:10},
    v:v=>v.t, g:v=>slozhit([tube(v.d/2, v.dBore/2, v.t), box(v.len, v.t, v.w, 0, -(v.d/2+v.len/2)*0.7)]) },

  fork_lug: { zona:'ЛАПКА', imya:'Вилочный наконечник', p:{w:8,len:12,t:1.2,slot:3},
    v:v=>v.t, g:v=>slozhit([
      box(v.len, v.t, (v.w-v.slot)/2, 0, 0,  (v.w+v.slot)/4),
      box(v.len, v.t, (v.w-v.slot)/2, 0, 0, -(v.w+v.slot)/4),
      box(v.len*0.4, v.t, v.w, 0, -v.len*0.3)]) },
};

export function vysota(kind, p) {
  const e = ELEMENTY[kind]; if (!e) return 0;
  return Math.max(0.05, e.v(Object.assign({}, e.p, p)) || 0.05);
}

export function geometriya(kind, p) {
  const e = ELEMENTY[kind]; if (!e) return null;
  const v = Object.assign({}, e.p, p);
  try { return e.g(v); } catch (err) { console.warn(kind, err); return null; }
}

export const SPISOK = Object.keys(ELEMENTY);
