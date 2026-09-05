// Инженерный чертёж: четыре вида из настоящей геометрии модели.
// Рисуется художником по глубине, без библиотек.

function treugolniki(geom) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const p = g.attributes.position.array, out = [];
  for (let i = 0; i < p.length; i += 9)
    out.push([[p[i],p[i+1],p[i+2]], [p[i+3],p[i+4],p[i+5]], [p[i+6],p[i+7],p[i+8]]]);
  return out;
}

const PROEKCII = {
  speredi: q => [q[0], -q[1], q[2]],
  sboku:   q => [q[2], -q[1], -q[0]],
  sverhu:  q => [q[0], q[2], q[1]],
  izo:     q => {
    const a = Math.PI * 35/180, e = Math.PI * 20/180;
    const x = q[0]*Math.cos(a) - q[2]*Math.sin(a);
    const z = q[0]*Math.sin(a) + q[2]*Math.cos(a);
    return [x, -q[1]*Math.cos(e) + z*Math.sin(e)*0.42, z];
  },
};

function norm(v) { const m = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/m, v[1]/m, v[2]/m]; }
const SVET = norm([0.7, -1.9, 1.3]);

function risovat(cx, tris, rezhim, sc, ox, oy, cvet) {
  const pr = PROEKCII[rezhim];
  const P = tris.map(t => t.map(pr));
  const por = P.map((p, i) => [i, (p[0][2]+p[1][2]+p[2][2])/3]).sort((a,b) => a[1]-b[1]);
  for (const [i] of por) {
    const t = tris[i], p = P[i];
    const u = [t[1][0]-t[0][0], t[1][1]-t[0][1], t[1][2]-t[0][2]];
    const v = [t[2][0]-t[0][0], t[2][1]-t[0][1], t[2][2]-t[0][2]];
    const n = norm([u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]);
    const sh = 0.30 + 0.70 * Math.abs(n[0]*SVET[0] + n[1]*SVET[1] + n[2]*SVET[2]);
    cx.fillStyle = 'rgb(' + cvet.map(c => Math.min(255, Math.round(c*sh + 26*(1-sh)))).join(',') + ')';
    cx.beginPath();
    cx.moveTo(p[0][0]*sc+ox, p[0][1]*sc+oy);
    cx.lineTo(p[1][0]*sc+ox, p[1][1]*sc+oy);
    cx.lineTo(p[2][0]*sc+ox, p[2][1]*sc+oy);
    cx.closePath(); cx.fill();
  }
}

function ramki(tris, rezhim) {
  const pr = PROEKCII[rezhim];
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for (const t of tris) for (const q of t) {
    const p = pr(q);
    if (p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0];
    if (p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1];
  }
  return [x0,x1,y0,y1];
}

const PODPISI = { speredi:'ВИД СПЕРЕДИ', sboku:'ВИД СБОКУ', sverhu:'ВИД СВЕРХУ', izo:'ИЗОМЕТРИЯ' };

export function chertyozh(cv, geom, opis) {
  const tris = treugolniki(geom);
  if (!tris.length) return;
  const cx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  cx.fillStyle = '#f4f7f3'; cx.fillRect(0,0,W,H);
  // клетка
  cx.strokeStyle = '#dfe6dd'; cx.lineWidth = 1;
  for (let x = 0; x < W; x += 16) { cx.beginPath(); cx.moveTo(x+.5,0); cx.lineTo(x+.5,H); cx.stroke(); }
  for (let y = 0; y < H; y += 16) { cx.beginPath(); cx.moveTo(0,y+.5); cx.lineTo(W,y+.5); cx.stroke(); }

  const podval = Math.max(30, Math.round(H*0.05));
  const CW = W/2, CH = (H - podval)/2, pad = Math.max(24, Math.round(Math.min(CW,CH)*0.13));
  const cvet = opis?.cvet || [70, 128, 90];
  const poz = { speredi:[0,0], sboku:[1,0], sverhu:[0,1], izo:[1,1] };

  for (const rezh of Object.keys(poz)) {
    const [cxi, cyi] = poz[rezh];
    const [x0,x1,y0,y1] = ramki(tris, rezh);
    const sc = Math.min((CW-2*pad)/Math.max(x1-x0,1e-6), (CH-2*pad)/Math.max(y1-y0,1e-6));
    const ox = cxi*CW + (CW-(x1-x0)*sc)/2 - x0*sc;
    const oy = cyi*CH + (CH-(y1-y0)*sc)/2 - y0*sc;
    cx.save();
    cx.beginPath(); cx.rect(cxi*CW, cyi*CH, CW, CH); cx.clip();
    risovat(cx, tris, rezh, sc, ox, oy, cvet);
    cx.restore();
    cx.strokeStyle = '#c3ccc1'; cx.strokeRect(cxi*CW+.5, cyi*CH+.5, CW-1, CH-1);
    const kegl = Math.max(11, Math.round(H*0.016));
    cx.fillStyle = '#2b3a33'; cx.font = 'bold ' + kegl + 'px system-ui, sans-serif';
    cx.fillText(PODPISI[rezh], cxi*CW + kegl, cyi*CH + kegl*1.6);

    if (rezh === 'speredi' && opis) {
      // размерные линии по габаритам
      const px0 = x0*sc+ox, px1 = x1*sc+ox, py0 = y0*sc+oy, py1 = y1*sc+oy;
      const k2 = Math.max(10, Math.round(H*0.014));
      cx.strokeStyle = '#7a8a80'; cx.fillStyle = '#3a4a42';
      cx.font = k2 + 'px system-ui, sans-serif'; cx.setLineDash([4,3]);
      cx.beginPath(); cx.moveTo(px1+8, py0); cx.lineTo(px1+8, py1); cx.stroke();
      cx.beginPath(); cx.moveTo(px0, py1+8); cx.lineTo(px1, py1+8); cx.stroke();
      cx.setLineDash([]);
      cx.save(); cx.translate(px1+k2*2, (py0+py1)/2); cx.rotate(-Math.PI/2);
      cx.fillText('H = ' + opis.vysota + ' мм', -k2*2.4, 0); cx.restore();
      cx.fillText('W = ' + opis.shirina + ' мм', (px0+px1)/2 - k2*2.8, py1 + k2*2);
    }
  }
  // подвал как на чертеже
  const y = H - podval;
  cx.fillStyle = '#eef2ec'; cx.fillRect(0, y, W, podval);
  cx.strokeStyle = '#c3ccc1'; cx.strokeRect(.5, y+.5, W-1, podval-1);
  const kol = [0, W*0.30, W*0.56, W*0.76, W];
  for (let i = 1; i < kol.length-1; i++) {
    cx.beginPath(); cx.moveTo(kol[i]+.5, y); cx.lineTo(kol[i]+.5, H); cx.stroke();
  }
  const tekst = [
    ['ДЕТАЛЬ', opis?.nomer || '—'],
    ['МАТЕРИАЛ', opis?.material || '—'],
    ['ЭЛЕМЕНТОВ', String(opis?.elementov ?? '—')],
    ['МАСШТАБ', '1:1'],
  ];
  const kp = Math.max(8, Math.round(podval*0.24));
  tekst.forEach(([a, b], i) => {
    cx.fillStyle = '#7a8a80'; cx.font = kp + 'px system-ui, sans-serif';
    cx.fillText(a, kol[i] + kp, y + podval*0.38);
    cx.fillStyle = '#22302a'; cx.font = 'bold ' + Math.round(kp*1.35) + 'px system-ui, sans-serif';
    cx.fillText(String(b).slice(0, 26), kol[i] + kp, y + podval*0.78);
  });
}

// Лист «разбор»: слева четыре вида, справа тела столбиком строго в профиль.
export function listRazbora(cv, geomPolnaya, geomTel, cvet) {
  const cx = cv.getContext('2d'), W = cv.width, H = cv.height;
  cx.fillStyle = '#d1d3cf'; cx.fillRect(0,0,W,H);
  const MID = Math.round(W/2);
  const tris = treugolniki(geomPolnaya);
  const CW = MID/2, CH = H/2, pad = Math.max(26, Math.round(Math.min(CW,CH)*0.15));
  const poz = { speredi:[0,0], sboku:[1,0], sverhu:[0,1], izo:[1,1] };
  for (const rezh of Object.keys(poz)) {
    const [a,b] = poz[rezh];
    const [x0,x1,y0,y1] = ramki(tris, rezh);
    const sc = Math.min((CW-2*pad)/Math.max(x1-x0,1e-6), (CH-2*pad)/Math.max(y1-y0,1e-6));
    cx.save(); cx.beginPath(); cx.rect(a*CW, b*CH, CW, CH); cx.clip();
    risovat(cx, tris, rezh, sc, a*CW+(CW-(x1-x0)*sc)/2-x0*sc, b*CH+(CH-(y1-y0)*sc)/2-y0*sc, cvet);
    cx.restore();
  }
  cx.strokeStyle = '#9aa09a'; cx.lineWidth = Math.max(2, Math.round(H*0.003));
  cx.beginPath(); cx.moveTo(MID, 0); cx.lineTo(MID, H); cx.stroke();

  const tela = geomTel.map(treugolniki).filter(t => t.length);
  if (!tela.length) return;
  const gab = tela.map(t => ramki(t, 'speredi'));
  const hs = gab.map(g => g[3]-g[2]), ws = gab.map(g => g[1]-g[0]);
  const pole = Math.round(H*0.07), GAP = Math.round(H*0.028);
  const TOP = pole, BOT = H - pole;
  const sc = Math.min(
    (MID - Math.round(MID*0.22)) / Math.max(...ws),
    (BOT - TOP - GAP*(tela.length-1)) / Math.max(hs.reduce((a,b)=>a+b,0), 1e-6));
  let y = TOP + Math.max(0, (BOT-TOP-GAP*(tela.length-1)-hs.reduce((a,b)=>a+b,0)*sc)/2);
  const CX = MID + (W-MID)/2;
  cx.save(); cx.beginPath(); cx.rect(MID+1, 0, W-MID-1, H); cx.clip();
  tela.forEach((t, i) => {
    const [x0,x1,y0] = [gab[i][0], gab[i][1], gab[i][2]];
    risovat(cx, t, 'speredi', sc, CX-(x0+x1)/2*sc, y-y0*sc, cvet);
    y += hs[i]*sc + GAP;
  });
  cx.restore();
}
