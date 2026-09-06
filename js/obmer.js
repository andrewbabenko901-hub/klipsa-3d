// Обмер силуэта в браузере. Метод обработки выбирается пользователем,
// маску и профиль видно глазами — не чёрный ящик.
import * as A from './algoritmy.js';

export const POLOS = 40;

export const METODY_OSI = {
  asimmetriya: 'По асимметрии профиля',
  pca:         'По главным осям (PCA)',
  ramka:       'По длинной стороне рамки',
  vertikal:    'Всегда вертикально',
};

export const METODY_KOMPONENTY = {
  umnyj:            'Умный — отбросить рамки и подписи',
  krupneyshaya:     'Самая крупная',
  menee_zapolnennaya:'Наименее заполняющая рамку',
};

export const PO_UMOLCHANIYU = {
  maska: 'zalivka',
  os: 'asimmetriya',
  komponenta: 'umnyj',
  chistka: 'net',      // net | otkrytie | zakrytie | oba
  radius: 1,
  dyry: true,
  bezPometok: false,
  porogBelogo: 232,
  porogNasyshch: 34,
  porogGradienta: 42,
};

export function obmerit(img, opt = {}) {
  const n = Object.assign({}, PO_UMOLCHANIYU, opt);
  const S = 340;
  const c = document.createElement('canvas');
  const k = Math.min(S / img.width, S / img.height, 1);
  c.width = Math.max(8, Math.round(img.width * k));
  c.height = Math.max(8, Math.round(img.height * k));
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, c.width, c.height);
  const px = cx.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height, N = W * H;

  let m = A.postroitMasku(px, W, H, n.maska, n);

  if (n.bezPometok) {                       // выкинуть красные стрелки разметки
    for (let i = 0; i < N; i++) {
      const r = px[i*4], g = px[i*4+1], b = px[i*4+2];
      if (r > 130 && r > g*1.8 && r > b*1.8) m[i] = 0;
    }
  }
  if (n.chistka === 'otkrytie' || n.chistka === 'oba') m = A.morfologiya(m, W, H, n.radius, 'otkrytie');
  if (n.chistka === 'zakrytie' || n.chistka === 'oba') m = A.morfologiya(m, W, H, n.radius, 'zakrytie');
  if (n.dyry) m = A.zapolnitDyry(m, W, H);

  const { metka, spisok } = A.komponenty(m, W, H, 100);
  if (!spisok.length) throw new Error('не нашёл деталь на снимке — попробуй другой метод обработки');
  const vyb = A.vybratKomponentu(spisok, W, H, n.komponenta);
  const ramka = { x0: vyb.x0, x1: vyb.x1, y0: vyb.y0, y1: vyb.y1 };

  // ось
  let vert;
  if (n.os === 'vertikal') vert = true;
  else if (n.os === 'ramka') vert = (vyb.y1-vyb.y0) >= (vyb.x1-vyb.x0);
  else if (n.os === 'pca') {
    const a = A.osPCA(m, W, H, vyb.nom, metka);
    vert = Math.abs(Math.sin(a)) >= Math.abs(Math.cos(a));
  } else {
    const v = A.profil(metka, vyb.nom, W, H, ramka, true, POLOS);
    const g = A.profil(metka, vyb.nom, W, H, ramka, false, POLOS);
    vert = A.asimmetriya(v) >= A.asimmetriya(g);
  }

  let r = A.profil(metka, vyb.nom, W, H, ramka, vert, POLOS);
  const summa = (a,b,c2) => a.slice(b,c2).reduce((x,y)=>x+y,0);
  const perevernut = summa(r,0,POLOS/2) < summa(r,POLOS/2,POLOS);
  if (perevernut) r = r.slice().reverse();     // широкий конец наверх
  const mx = Math.max(...r) || 1;

  // цвет детали — им рисуются модель, чертёж и лист
  let sr=0, sg=0, sb=0, n2=0;
  for (let i = 0; i < N; i++) if (metka[i] === vyb.nom) { sr+=px[i*4]; sg+=px[i*4+1]; sb+=px[i*4+2]; n2++; }
  let cvet = n2 ? [Math.round(sr/n2), Math.round(sg/n2), Math.round(sb/n2)] : [74,132,92];
  const yark = Math.max(...cvet);
  if (yark < 70) cvet = cvet.map(v => Math.min(255, Math.round(v*70/Math.max(yark,1))));

  const shir = vert ? (vyb.x1-vyb.x0+1) : (vyb.y1-vyb.y0+1);
  const vys  = vert ? (vyb.y1-vyb.y0+1) : (vyb.x1-vyb.x0+1);

  // контур для показа и для оценки изломов
  const kont = A.kontur(metka, vyb.nom, W, H);
  const uproshchyon = A.rdp(kont, Math.max(1.2, Math.min(W,H)*0.008));

  return {
    cvet,
    os: vert ? 'вертикально' : 'горизонтально',
    shirinaPx: shir, vysotaPx: vys,
    vysotaKShirine: +(vys / Math.max(1, shir)).toFixed(4),
    zapolnennost: +vyb.zapolnennost.toFixed(4),
    polosy: r.map(x => +(x/mx).toFixed(4)),
    komponent: spisok.length,
    uglovTura: uproshchyon.length,
    metod: n.maska,
    // всё нужное, чтобы нарисовать предпросмотр
    _predpokaz: { W, H, metka, nom: vyb.nom, ramka, vert, perevernut, kontur: uproshchyon },
  };
}

// Нарезка на тела без нейронки — отдельный, независимый разбор.
export function razborAlgoritmom(izmer, chuvstvitelnost = 0.5) {
  return A.narezatTela(izmer.polosy, chuvstvitelnost);
}

export function granicyTel(polosy, doli) {
  const s = doli.reduce((a,b)=>a+b,0) || 1;
  const kraya = [0]; let nak = 0;
  for (const d of doli) { nak += d/s; kraya.push(Math.min(polosy.length, Math.round(nak*polosy.length))); }
  return doli.map((_, i) => [kraya[i], Math.max(kraya[i]+1, kraya[i+1])]);
}

// Предпросмотр: слева маска с рамкой и контуром, справа профиль полосами.
export function narisovatRazbor(cv, izmer, granicy) {
  const p = izmer && izmer._predpokaz;
  const cx = cv.getContext('2d'), CW = cv.width, CH = cv.height;
  cx.fillStyle = '#0d1714'; cx.fillRect(0, 0, CW, CH);
  if (!p) return;
  const { W, H, metka, nom, ramka, vert, perevernut, kontur } = p;
  const pol = Math.round(Math.min(CW,CH)*0.05);
  const podpis = Math.round(CH*0.075);          // место под подпись снизу
  const zona = CW/2 - pol*1.5;
  const sc = Math.min(zona/W, (CH-2*pol-podpis)/H);
  const ox = pol, oy = pol + (CH-2*pol-podpis - H*sc)/2;

  const im = cx.createImageData(W, H);
  for (let i = 0; i < W*H; i++) {
    const est = metka[i] === nom;
    im.data[i*4]   = est ? 63 : 18;
    im.data[i*4+1] = est ? 191 : 32;
    im.data[i*4+2] = est ? 127 : 28;
    im.data[i*4+3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(im, 0, 0);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(tmp, ox, oy, W*sc, H*sc);

  cx.strokeStyle = '#e2bf5f'; cx.lineWidth = 1.5;
  cx.strokeRect(ox + ramka.x0*sc, oy + ramka.y0*sc,
                (ramka.x1-ramka.x0+1)*sc, (ramka.y1-ramka.y0+1)*sc);
  if (kontur && kontur.length > 2) {
    cx.strokeStyle = '#8fd8ff'; cx.lineWidth = 1;
    cx.beginPath();
    kontur.forEach(([x,y], i) => i ? cx.lineTo(ox+x*sc, oy+y*sc) : cx.moveTo(ox+x*sc, oy+y*sc));
    cx.closePath(); cx.stroke();
  }
  cx.fillStyle = '#7d948a'; cx.font = Math.max(10, Math.round(CH*0.034)) + 'px system-ui, sans-serif';
  cx.fillText('маска · ось ' + (vert ? 'вертикальная' : 'горизонтальная') + (perevernut ? ' (перевёрнута)' : ''),
              ox, CH - Math.round(podpis*0.35));

  // профиль
  const px0 = CW/2 + pol/2, pw = CW - px0 - pol, ph = CH - 2*pol - podpis;
  cx.fillStyle = '#0a1310'; cx.fillRect(px0, pol, pw, ph);
  const hh = ph / izmer.polosy.length;
  izmer.polosy.forEach((v, i) => {
    const w = Math.max(1, v*pw*0.92);
    const vTele = granicy && granicy.some(([a,b],k) => i>=a && i<b && k%2===0);
    cx.fillStyle = vTele ? '#3fbf7f' : '#2a8f5e';
    cx.fillRect(px0 + (pw-w)/2, pol + i*hh, w, Math.max(1, hh-0.7));
  });
  if (granicy) {
    cx.strokeStyle = '#e2bf5f'; cx.setLineDash([4,3]); cx.lineWidth = 1;
    granicy.forEach(([a]) => { if (!a) return;
      cx.beginPath(); cx.moveTo(px0, pol + a*hh); cx.lineTo(px0+pw, pol + a*hh); cx.stroke(); });
    cx.setLineDash([]);
  }
  cx.fillStyle = '#7d948a';
  cx.fillText('профиль, 40 полос · штрихи — линии реза на тела', px0, CH - Math.round(podpis*0.35));
}
