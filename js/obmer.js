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

// Рабочий размер снимка. На 340 пикселях тонкая шейка занимала два-три
// столбца и тонула в округлениях; на 620 она измеряется, а не угадывается.
const RAZMER = 620;

export function obmerit(img, opt = {}) {
  const n = Object.assign({}, PO_UMOLCHANIYU, opt);
  const c = document.createElement('canvas');
  const k = Math.min(RAZMER / img.width, RAZMER / img.height, 1);
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

  // маска только материала — по ней видно сквозное отверстие
  let mSyroj = A.maskaMateriala(px, W, H, n.maska, n);
  if (n.bezPometok) for (let i = 0; i < N; i++) {
    const r = px[i*4], g = px[i*4+1], b = px[i*4+2];
    if (r > 130 && r > g*1.8 && r > b*1.8) mSyroj[i] = 0;
  }
  if (n.chistka === 'otkrytie' || n.chistka === 'oba') mSyroj = A.morfologiya(mSyroj, W, H, n.radius, 'otkrytie');
  const mZal = A.zapolnitDyry(m, W, H);
  if (n.dyry) m = mZal;

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

  // полный профиль: огибающая, доля материала, просветы
  const pp = A.profilPolnyj(metka, vyb.nom, W, H, ramka, vert, POLOS);
  const summa = (a,b,c2) => a.slice(b,c2).reduce((x,y)=>x+y,0);
  const perevernut = summa(pp.ogib,0,POLOS/2) < summa(pp.ogib,POLOS/2,POLOS);
  const por = a => perevernut ? a.slice().reverse() : a;
  const ogib = por(pp.ogib), telo = por(pp.telo), zapoln = por(pp.zapoln),
        runs = por(pp.runs), centr = por(pp.centr);
  const mx = Math.max(...ogib) || 1;

  // цвет детали — им рисуются модель, чертёж и лист
  let sr=0, sg=0, sb=0, n2=0;
  for (let i = 0; i < N; i++) if (metka[i] === vyb.nom) { sr+=px[i*4]; sg+=px[i*4+1]; sb+=px[i*4+2]; n2++; }
  let cvet = n2 ? [Math.round(sr/n2), Math.round(sg/n2), Math.round(sb/n2)] : [74,132,92];
  const yark = Math.max(...cvet);
  if (yark < 70) cvet = cvet.map(v => Math.min(255, Math.round(v*70/Math.max(yark,1))));

  const shir = vert ? (vyb.x1-vyb.x0+1) : (vyb.y1-vyb.y0+1);
  const vys  = vert ? (vyb.y1-vyb.y0+1) : (vyb.x1-vyb.x0+1);

  // сквозное отверстие: то, что заливка дыр добавила внутри детали
  const otv = najtiOtverstie(mSyroj, metka, vyb.nom, W, H, ramka, vert, perevernut);

  // контур для показа и для оценки изломов
  const kont = A.kontur(metka, vyb.nom, W, H);
  const uproshchyon = A.rdp(kont, Math.max(1.2, Math.min(W,H)*0.006));

  return {
    cvet,
    os: vert ? 'вертикально' : 'горизонтально',
    shirinaPx: shir, vysotaPx: vys,
    vysotaKShirine: +(vys / Math.max(1, shir)).toFixed(4),
    zapolnennost: +vyb.zapolnennost.toFixed(4),
    polosy: ogib.map(x => +(x/mx).toFixed(4)),      // огибающая (как раньше)
    polosyTelo: telo.map(x => +(x/mx).toFixed(4)),  // сколько на самом деле материала
    zapoln: zapoln.map(x => +x.toFixed(4)),         // доля материала внутри огибающей
    runs, centr,
    otverstie: otv,
    komponent: spisok.length,
    uglovTura: uproshchyon.length,
    metod: n.maska,
    // всё нужное, чтобы нарисовать предпросмотр
    _predpokaz: { W, H, metka, nom: vyb.nom, ramka, vert, perevernut, kontur: uproshchyon },
  };
}

// Дырка внутри детали: пиксели, которые появились после заполнения.
// Нужна, чтобы поставить bore, а не гадать «примерно треть диаметра».
function najtiOtverstie(mSyroj, metka, nom, W, H, ramka, vert, perevernut) {
  const dyra = new Uint8Array(W*H);
  let est = 0;
  for (let i = 0; i < W*H; i++) if (metka[i] === nom && !mSyroj[i]) { dyra[i] = 1; est++; }
  if (est < 12) return null;
  const { spisok } = A.komponenty(dyra, W, H, 12);
  if (!spisok.length) return null;
  const b = spisok.reduce((a, c) => c.ploshchad > a.ploshchad ? c : a);
  const shirD = vert ? (b.x1-b.x0+1) : (b.y1-b.y0+1);
  const vysD  = vert ? (b.y1-b.y0+1) : (b.x1-b.x0+1);
  const shirR = vert ? (ramka.x1-ramka.x0+1) : (ramka.y1-ramka.y0+1);
  const vysR  = vert ? (ramka.y1-ramka.y0+1) : (ramka.x1-ramka.x0+1);
  let poz = vert ? ((b.y0+b.y1)/2 - ramka.y0)/vysR : ((b.x0+b.x1)/2 - ramka.x0)/vysR;
  if (perevernut) poz = 1 - poz;
  return {
    dolyaD: +(shirD/shirR).toFixed(3),
    dolyaVysoty: +(vysD/vysR).toFixed(3),
    poVysote: +poz.toFixed(3),
    skvoznoe: vysD/vysR > 0.55,
  };
}

// Нарезка на тела без нейронки — отдельный, независимый разбор.
export function razborAlgoritmom(izmer, chuvstvitelnost = 0.5) {
  return A.narezatTela(izmer.polosy, chuvstvitelnost,
    izmer.runs ? { zapoln: izmer.zapoln, runs: izmer.runs, telo: izmer.polosyTelo } : null);
}

/**
 * Замер одного куска по его собственным полосам.
 * Раньше сборка знала про кусок только «самое широкое место» и дальше всё
 * внутреннее считала коэффициентами: сердечник 0.55 диаметра, отверстие 0.35,
 * низ конуса 0.15. От этого две разные клипсы с одинаковым габаритом выходили
 * одинаковыми внутри. Здесь всё, что вообще видно на силуэте, берётся с него.
 *
 * Все размеры — доли от самого широкого места детали.
 */
export function meriTelo(izmer, a, b) {
  const P = izmer.polosy || [], N = P.length || 1;
  a = Math.max(0, Math.min(N-1, a|0));
  b = Math.max(a+1, Math.min(N, b|0));
  const kus = P.slice(a, b);
  const telo = (izmer.polosyTelo || P).slice(a, b);
  const zap  = (izmer.zapoln || []).slice(a, b);
  const runs = (izmer.runs || []).slice(a, b);
  const n = kus.length || 1;

  const verh = kus[0] ?? 0.5, niz = kus[n-1] ?? 0.5;
  const max = Math.max(0.02, Math.max(...kus));
  const min = Math.max(0.02, Math.min(...kus));   // не Math.min(...kus, 0.02): так было бы всегда 0.02
  const sredn = kus.reduce((x,y)=>x+y, 0) / n;
  const razmah = max - min;

  // локальные вершины и впадины: у ёлочки это диаметр лепестка и диаметр
  // ядра, у катушки — фланец и талия. Это настоящие размеры, а не доли.
  const verhi = [], vpadiny = [];   // гребни и впадины ряби — зубцы, фланцы, талия
  for (let i = 1; i < n-1; i++) {
    if (kus[i] >= kus[i-1] && kus[i] >= kus[i+1] && kus[i] > min + razmah*0.2) verhi.push(kus[i]);
    if (kus[i] <= kus[i-1] && kus[i] <= kus[i+1] && kus[i] < max - razmah*0.2) vpadiny.push(kus[i]);
  }
  const sr = a2 => a2.reduce((x,y)=>x+y,0) / a2.length;
  const grebni  = verhi.length   >= 2 ? sr(verhi)   : max;
  const vpadina = vpadiny.length >= 2 ? sr(vpadiny) : min;

  const zapoln = zap.length ? (A.mediana(zap.filter(v => v > 0)) || 1) : 1;
  const kuskov = runs.length ? (Math.round(A.mediana(runs.map(r => r.length))) || 1) : 1;
  const material = telo.reduce((x,y)=>x+y, 0) / n;          // ширина без просветов
  const prosvet = Math.max(0, sredn - material);            // сколько всего пустого поперёк

  let otverstie = null;
  const o = izmer.otverstie;
  if (o && o.poVysote >= a/N - 0.03 && o.poVysote <= b/N + 0.03) otverstie = o;

  return { a, b, polos: n, dolyaVysoty: n/N,
           verh, niz, max, min, sredn, grebni, vpadina,
           zapoln, kuskov, material, prosvet, otverstie,
           grebnej: verhi.length, vpadin: vpadiny.length,
           rebristo: verhi.length >= 2 && vpadiny.length >= 2 };
}

// Все варианты нарезки — чтобы выбрать число тел по совпадению силуэта.
export function variantyRazbora(izmer, maxK = 8) {
  return A.variantyNarezki(izmer.polosy,
    izmer.runs ? { zapoln: izmer.zapoln, runs: izmer.runs, telo: izmer.polosyTelo } : null, maxK);
}

export function granicyTel(polosy, doli) {
  const s = doli.reduce((a,b)=>a+b,0) || 1;
  const kraya = [0]; let nak = 0;
  for (const d of doli) { nak += d/s; kraya.push(Math.min(polosy.length, Math.round(nak*polosy.length))); }
  return doli.map((_, i) => [kraya[i], Math.max(kraya[i]+1, kraya[i+1])]);
}

/**
 * Маска детали, развёрнутая «как модель»: ось всегда вертикально, широкий
 * конец вверху, кадр обрезан по детали. В этой же системе координат живут
 * runs, поэтому маску, профиль и силуэт модели можно класть друг на друга.
 */
export function maskaVyravnennaya(izmer) {
  const p = izmer && izmer._predpokaz; if (!p) return null;
  const { W, H, metka, nom, ramka, vert, perevernut } = p;
  const a0 = vert ? ramka.y0 : ramka.x0, a1 = vert ? ramka.y1 : ramka.x1;
  const b0 = vert ? ramka.x0 : ramka.y0, b1 = vert ? ramka.x1 : ramka.y1;
  const L = a1-a0+1, B = b1-b0+1;
  const d = new Uint8Array(B*L);
  for (let p2 = 0; p2 < L; p2++) {
    const y = perevernut ? (L-1-p2) : p2;
    for (let q = 0; q < B; q++) {
      const idx = vert ? ((a0+p2)*W + b0+q) : ((b0+q)*W + a0+p2);
      d[y*B + q] = metka[idx] === nom ? 1 : 0;
    }
  }
  return { d, W: B, H: L };
}

// ---------- предпросмотр ----------

function panel(cx, x, y, w, h, zag) {
  cx.fillStyle = '#0a1310'; cx.fillRect(x, y, w, h);
  cx.strokeStyle = '#1b2c25'; cx.lineWidth = 1; cx.strokeRect(x+.5, y+.5, w-1, h-1);
  if (zag) { cx.fillStyle = '#6f8a7e'; cx.fillText(zag, x + 6, y + 14); }
}

/**
 * Слева — что принято за деталь, в центре — профиль с просветами,
 * справа (если передан силуэт модели) — наложение модели на снимок.
 * Все окна в одном масштабе и с сохранёнными пропорциями: раньше профиль
 * растягивался на всю высоту окна и деталь выглядела не собой.
 */
export function narisovatRazbor(cv, izmer, granicy, opt = {}) {
  const cx = cv.getContext('2d'), CW = cv.width, CH = cv.height;
  cx.fillStyle = '#0d1714'; cx.fillRect(0, 0, CW, CH);
  const p = izmer && izmer._predpokaz; if (!p) return;
  const mv = maskaVyravnennaya(izmer); if (!mv) return;
  const nal = opt.nalozhenie || null;
  const B = mv.W, L = mv.H;

  const shrift = Math.max(9, Math.round(Math.min(CW, CH) * 0.026));
  cx.font = shrift + 'px system-ui, sans-serif';
  const pod = Math.round(shrift * 3.8);          // подписи снизу
  const verh = Math.round(shrift * 1.9);         // заголовки панелей
  const pol = Math.round(Math.min(CW, CH) * 0.028);
  const kolvo = nal ? 3 : 2;
  const pw = (CW - pol*(kolvo+1)) / kolvo;
  const ph = CH - pol*2 - pod;

  // общий масштаб: одна и та же деталь одного размера во всех окнах
  const legenda = nal ? Math.round(shrift * 4.6) : 0;
  const sc = Math.min((pw - shrift*2.4) / B, (ph - verh - 6) / L,
                      nal ? (ph - verh - legenda) * (nal.W/nal.H) / B : Infinity);
  const px = i => pol + i*(pw + pol);
  const dostupno = ph - verh - legenda;
  const oy = pol + verh + Math.max(0, (dostupno - Math.max(L*sc, nal ? nal.H*sc*B/nal.W : 0)) / 2);

  // ---- 1. маска ----
  panel(cx, px(0), pol, pw, ph, 'маска · ' + (izmer.komponent > 1 ? izmer.komponent + ' куска, взят один' : 'один кусок'));
  const ox0 = px(0) + shrift*2.0 + ((pw - shrift*2.4) - B*sc)/2;
  const tmp = document.createElement('canvas'); tmp.width = B; tmp.height = L;
  const im = tmp.getContext('2d').createImageData(B, L);
  for (let i = 0; i < B*L; i++) {
    const e = mv.d[i];
    im.data[i*4] = e ? 63 : 16; im.data[i*4+1] = e ? 191 : 30;
    im.data[i*4+2] = e ? 127 : 26; im.data[i*4+3] = 255;
  }
  tmp.getContext('2d').putImageData(im, 0, 0);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(tmp, ox0, oy, B*sc, L*sc);
  cx.strokeStyle = '#e2bf5f'; cx.lineWidth = 1;
  cx.strokeRect(ox0-.5, oy-.5, B*sc+1, L*sc+1);

  // линейка в мм — сразу видно, во что превратятся доли
  const mm = +opt.shirinaMm || 0;
  if (mm > 0) {
    const naMm = B*sc / mm;
    let shag = 1; while (naMm*shag < 13) shag *= (shag === 1 ? 2 : (shag === 2 ? 2.5 : 2));
    cx.strokeStyle = '#33544a'; cx.fillStyle = '#6f8a7e'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(ox0-6, oy); cx.lineTo(ox0-6, oy + L*sc); cx.stroke();
    const vsegoMm = mm * izmer.vysotaKShirine;
    for (let v = 0; v <= vsegoMm + 1e-6; v += shag) {
      const y = oy + (v/Math.max(vsegoMm,1e-6)) * L*sc;
      cx.beginPath(); cx.moveTo(ox0-10, y); cx.lineTo(ox0-6, y); cx.stroke();
      cx.save(); cx.translate(ox0-13, y+3); cx.fillText(String(+v.toFixed(1)), -shrift*1.6, 0); cx.restore();
    }
    cx.fillText('мм', px(0)+5, oy + L*sc + shrift*1.2);
  }

  // ---- 2. профиль с просветами ----
  panel(cx, px(1), pol, pw, ph, 'профиль · ' + POLOS + ' полос, просветы на своих местах');
  const ox1 = px(1) + shrift*1.2 + ((pw - shrift*2.4) - B*sc)/2;
  const hh = L*sc / POLOS;
  const runs = izmer.runs || [];
  for (let i = 0; i < POLOS; i++) {
    const vTele = granicy && granicy.some(([a,b],k) => i>=a && i<b && k%2===0);
    cx.fillStyle = vTele ? '#3fbf7f' : '#2a8f5e';
    const rr = runs[i];
    if (rr && rr.length) {
      for (const [a, b] of rr)
        cx.fillRect(ox1 + a*B*sc, oy + i*hh, Math.max(1, (b-a)*B*sc), Math.max(1, hh-0.6));
    } else {
      const w = Math.max(1, (izmer.polosy[i]||0)*B*sc);
      cx.fillRect(ox1 + (B*sc-w)/2, oy + i*hh, w, Math.max(1, hh-0.6));
    }
  }
  if (granicy) {
    cx.strokeStyle = '#e2bf5f'; cx.setLineDash([4,3]); cx.lineWidth = 1;
    cx.fillStyle = '#e2bf5f';
    granicy.forEach(([a], k) => {
      const y = oy + a*hh;
      if (a) { cx.beginPath(); cx.moveTo(ox1-4, y); cx.lineTo(ox1+B*sc+4, y); cx.stroke(); }
      cx.fillText(String(k+1), ox1 + B*sc + 7, y + shrift*1.1);
    });
    cx.setLineDash([]);
  }

  // ---- 3. наложение модели ----
  if (nal) {
    panel(cx, px(2), pol, pw, ph, 'модель поверх снимка');
    const sc2 = sc * B / nal.W;
    const t2 = document.createElement('canvas'); t2.width = nal.W; t2.height = nal.H;
    t2.getContext('2d').putImageData(new ImageData(nal.rgba, nal.W, nal.H), 0, 0);
    const ox2 = px(2) + (pw - nal.W*sc2)/2;
    cx.drawImage(t2, ox2, oy, nal.W*sc2, nal.H*sc2);
    let y0 = pol + ph - legenda + shrift*1.2;
    const met = [['#3fbf7f', 'совпало ' + Math.round(nal.iou*100) + '%'],
                 ['#5aaaff', 'есть на фото, модель не построила ' + Math.round(nal.netVModeli*100) + '%'],
                 ['#e85858', 'модель добавила лишнее ' + Math.round(nal.lishneeVModeli*100) + '%']];
    for (const [c, t] of met) {
      cx.fillStyle = c; cx.fillRect(px(2)+7, y0 - shrift*0.75, shrift*0.8, shrift*0.8);
      cx.fillStyle = '#9db3a9'; cx.fillText(t, px(2) + 7 + shrift*1.3, y0);
      y0 += shrift*1.35;
    }
  }

  // ---- подписи ----
  cx.fillStyle = '#7d948a';
  const yPod = CH - Math.round(pod*0.35);
  cx.fillText('ось ' + izmer.os + (p.perevernut ? ', перевёрнута широким концом вверх' : '') +
              ' · ' + (A.METODY_MASKI[izmer.metod] || izmer.metod), pol, yPod);
  const razr = (izmer.zapoln || []).filter(v => v < 0.82).length;
  const vtoraya = [];
  if (razr > 2) vtoraya.push('просветы в ' + razr + ' полосах из ' + POLOS + ' — деталь разрезная');
  if (izmer.otverstie) vtoraya.push('дырка Ø' + Math.round(izmer.otverstie.dolyaD*100) + '% ширины' +
    (izmer.otverstie.skvoznoe ? ', похоже сквозная' : ''));
  if (vtoraya.length) cx.fillText(vtoraya.join(' · '), pol, yPod - shrift*1.5);
}
