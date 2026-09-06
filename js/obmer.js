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

  // Сквозные дырки: то, что маска материала не считает материалом внутри
  // детали. Мелочь от шума и бликов отбрасываем — иначе «разрезным» окажется
  // всё подряд; остаются настоящие просветы.
  const dyry = new Uint8Array(N);
  {
    const syraya = new Uint8Array(N);
    let ploshchad = 0;
    for (let i = 0; i < N; i++) if (metka[i] === vyb.nom) { ploshchad++; if (!mSyroj[i]) syraya[i] = 1; }
    const minD = Math.max(24, Math.round(ploshchad * 0.004));
    const kd = A.komponenty(syraya, W, H, minD);
    for (const c of kd.spisok) for (let i = 0; i < N; i++) if (kd.metka[i] === c.nom) dyry[i] = 1;
  }
  // материал для профиля: деталь минус настоящие дырки
  const material = new Uint8Array(N);
  for (let i = 0; i < N; i++) material[i] = (metka[i] === vyb.nom && !dyry[i]) ? 1 : 0;

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
  const pp = A.profilPolnyj(metka, vyb.nom, W, H, ramka, vert, POLOS, material);
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
  const otv = najtiOtverstie(dyry, W, H, ramka, vert, perevernut);

  const grani = A.vnutrenniyeGrani(px, W, H, metka, vyb.nom, n.porogGranej ?? 26);

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
    _predpokaz: { W, H, metka, nom: vyb.nom, ramka, vert, perevernut, kontur: uproshchyon, dyry, grani },
  };
}

// Дырка внутри детали: пиксели, которые появились после заполнения.
// Нужна, чтобы поставить bore, а не гадать «примерно треть диаметра».
function najtiOtverstie(dyry, W, H, ramka, vert, perevernut) {
  let est = 0;
  for (let i = 0; i < W*H; i++) if (dyry[i]) est++;
  if (est < 12) return null;
  const { spisok } = A.komponenty(dyry, W, H, 12);
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

export const ROLI = {
  speredi: 'Вид спереди — по нему все диаметры',
  sboku:   'Вид сбоку — даёт сечение',
  sverhu:  'Вид сверху — даёт форму сечения',
};

/**
 * Сопоставление двух видов по высоте.
 *
 * Полосы каждого вида нормированы на своё самое широкое место, поэтому
 * сравнивать их напрямую нельзя. Общее у двух снимков одно — высота детали.
 * Через неё и приводим: ширина детали спереди = H/kA, сбоку = H/kB, где
 * k — отношение высоты к ширине на своём снимке.
 *
 * На выходе — отношение «ширина сбоку / ширина спереди» на каждой полосе.
 * Единица — тело вращения. Всё, что заметно отличается, телом вращения не
 * является, и модель надо сплющить.
 */
export function sopostavitVidy(speredi, sboku) {
  if (!speredi || !sboku || !speredi.polosy || !sboku.polosy) return null;
  const a = speredi.polosy, b = sboku.polosy;
  const N = Math.min(a.length, b.length);
  const kA = speredi.vysotaKShirine || 1, kB = sboku.vysotaKShirine || 1;
  const gabarit = kA / kB;                       // ширина сбоку / ширина спереди
  const otnoshenie = [];
  for (let i = 0; i < N; i++) {
    const va = a[i], vb = b[i] * gabarit;
    otnoshenie.push(va > 0.03 ? +Math.max(0.15, Math.min(6, vb/va)).toFixed(3) : 1);
  }
  // Деталь может быть телом вращения на три четверти высоты и не быть им у
  // шляпки. Поэтому смотрим не только на среднее, но и на долю полос, где
  // виды разошлись, и на самое сильное расхождение.
  const zhivye = otnoshenie.filter((_, i) => a[i] > 0.08);
  const sort = zhivye.slice().sort((x,y)=>x-y);
  const sred = sort.length ? sort[Math.floor(sort.length/2)] : 1;
  const nekrug = zhivye.filter(v => Math.abs(v - 1) >= 0.12);
  const dolyaNekruglyh = zhivye.length ? nekrug.length / zhivye.length : 0;
  const krajnee = zhivye.reduce((m, v) => Math.abs(v-1) > Math.abs(m-1) ? v : m, 1);
  return { otnoshenie, gabarit: +gabarit.toFixed(3), tipichnoe: +sred.toFixed(3),
           krajnee: +krajnee.toFixed(3), dolyaNekruglyh: +dolyaNekruglyh.toFixed(2),
           teloVrashcheniya: dolyaNekruglyh < 0.08 };
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
  const { W, H, metka, nom, ramka, vert, perevernut, dyry, grani } = p;
  const a0 = vert ? ramka.y0 : ramka.x0, a1 = vert ? ramka.y1 : ramka.x1;
  const b0 = vert ? ramka.x0 : ramka.y0, b1 = vert ? ramka.x1 : ramka.y1;
  const L = a1-a0+1, B = b1-b0+1;
  const d = new Uint8Array(B*L), dd = new Uint8Array(B*L), gg = new Uint8Array(B*L);
  for (let p2 = 0; p2 < L; p2++) {
    const y = perevernut ? (L-1-p2) : p2;
    for (let q = 0; q < B; q++) {
      const idx = vert ? ((a0+p2)*W + b0+q) : ((b0+q)*W + a0+p2);
      const j = y*B + q;
      d[j]  = metka[idx] === nom ? 1 : 0;
      dd[j] = dyry  && dyry[idx]  ? 1 : 0;
      gg[j] = grani && grani[idx] ? 1 : 0;
    }
  }
  return { d, W: B, H: L, dyry: dd, grani: gg };
}

/**
 * Полосы и просветы прямо по готовой маске 0/1 — без снимка.
 * Нужны, чтобы показать вид сбоку, посчитанный из модели, теми же полосами,
 * что и снимок: тогда два ряда сравнимы глазом.
 */
export function polosyMaski(m, N = POLOS) {
  if (!m || !m.W) return null;
  const { d, W, H } = m;
  const polosy = [], runs = [], zapoln = [];
  for (let i = 0; i < N; i++) {
    const p0 = Math.floor(H*i/N), p1 = Math.max(p0+1, Math.floor(H*(i+1)/N));
    const stolb = new Uint8Array(W);
    for (let p = p0; p < p1 && p < H; p++) for (let q = 0; q < W; q++) if (d[p*W+q]) stolb[q] = 1;
    const rr = []; let s2 = -1, est = 0;
    for (let q = 0; q < W; q++) {
      if (stolb[q]) { est++; if (s2 < 0) s2 = q; }
      else if (s2 >= 0) { rr.push([s2/W, q/W]); s2 = -1; }
    }
    if (s2 >= 0) rr.push([s2/W, 1]);
    const og = rr.length ? (rr[rr.length-1][1] - rr[0][0]) : 0;
    polosy.push(+og.toFixed(4)); runs.push(rr);
    zapoln.push(og > 0 ? +((est/W)/og).toFixed(4) : 1);
  }
  return { polosy, runs, zapoln };
}

// ---------- предпросмотр ----------

function panel(cx, x, y, w, h, zag) {
  cx.fillStyle = '#0a1310'; cx.fillRect(x, y, w, h);
  cx.strokeStyle = '#1b2c25'; cx.lineWidth = 1; cx.strokeRect(x+.5, y+.5, w-1, h-1);
  if (zag) { cx.fillStyle = '#6f8a7e'; cx.fillText(zag, x + 6, y + 14); }
}

/**
 * Окно разбора. Строки — виды (спереди, сбоку, сверху), столбцы — маска,
 * профиль и наложение модели на снимок. Всё в одном масштабе и с сохранёнными
 * пропорциями.
 *
 * Маска не закрашивается сплошняком: сквозные дырки показаны насквозь, а
 * внутренние грани — светлыми линиями. По сплошному пятну не видно, ребро там
 * или прорезь.
 */
export function narisovatVidy(cv, spisok, opt = {}) {
  const cx = cv.getContext('2d'), CW = cv.width, CH = cv.height;
  cx.fillStyle = '#0d1714'; cx.fillRect(0, 0, CW, CH);
  // вид может прийти и без снимка — с готовой маской (например силуэт модели)
  const vidy = (spisok || []).filter(v => v && (v.maska || (v.izmer && v.izmer._predpokaz)));
  if (!vidy.length) return;

  const shrift = Math.max(9, Math.round(Math.min(CW, CH/vidy.length) * 0.026));
  cx.font = shrift + 'px system-ui, sans-serif';
  const pol = Math.round(Math.min(CW, CH) * 0.018);
  const pod = Math.round(shrift * 3.4);
  const verh = Math.round(shrift * 1.8);
  const kolvo = 3;
  const pw = (CW - pol*(kolvo+1)) / kolvo;
  const rh = (CH - pod - pol) / vidy.length - pol;
  const px = i => pol + i*(pw + pol);

  vidy.forEach((v, r) => {
    const y0 = pol + r*(rh + pol);
    risovatOdinVid(cx, v, px, y0, pw, rh, shrift, verh, opt);
  });

  cx.fillStyle = '#7d948a';
  const gl = (vidy.find(x => x.izmer) || {}).izmer; if (!gl) return;
  const yPod = CH - Math.round(pod*0.35);
  cx.fillText('ось ' + gl.os + ' · ' + (A.METODY_MASKI[gl.metod] || gl.metod) +
              ' · зелёное — материал, тёмное внутри — сквозная дырка, светлые линии — внутренние грани',
              pol, yPod);
  const vtoraya = [];
  const razr = (gl.zapoln || []).filter(x => x < 0.82).length;
  if (razr > 2) vtoraya.push('просветы в ' + razr + ' полосах из ' + POLOS + ' — деталь разрезная');
  if (gl.otverstie) vtoraya.push('дырка Ø' + Math.round(gl.otverstie.dolyaD*100) + '% ширины' +
    (gl.otverstie.skvoznoe ? ', похоже сквозная' : ''));
  if (opt.sechenie) vtoraya.push(opt.sechenie);
  if (vtoraya.length) cx.fillText(vtoraya.join(' · '), pol, yPod - shrift*1.5);
}

function risovatOdinVid(cx, v, px, y0, pw, rh, shrift, verh, opt) {
  const izmer = v.izmer || null, granicy = v.granicy, nal = v.nal || null;
  const mv = v.maska || (izmer ? maskaVyravnennaya(izmer) : null); if (!mv) return;
  if (!mv.dyry) mv.dyry = new Uint8Array(mv.W*mv.H);
  if (!mv.grani) mv.grani = new Uint8Array(mv.W*mv.H);
  const B = mv.W, L = mv.H;
  const imya = ({ speredi:'спереди', sboku:'сбоку', sverhu:'сверху' }[v.rol] || 'вид') +
               (v.izModeli ? ' · построен моделью, снимка нет' : '');
  const legenda = nal ? Math.round(shrift * 4.4) : 0;
  const dostupno = rh - verh;
  const sc = Math.min((pw - shrift*2.2) / B, (dostupno - 4) / L,
                      nal ? (dostupno - legenda) * (nal.W/nal.H) / B : Infinity);
  const oy = y0 + verh + Math.max(0, (dostupno - Math.max(L*sc, nal ? nal.H*sc*B/nal.W : 0)) / 2);

  // ---- маска ----
  panel(cx, px(0), y0, pw, rh, (v.izModeli ? 'силуэт модели · ' : 'маска · ') + imya);
  const ox0 = px(0) + shrift*1.9 + ((pw - shrift*2.2) - B*sc)/2;
  const tmp = document.createElement('canvas'); tmp.width = B; tmp.height = L;
  const g2 = tmp.getContext('2d');
  const im = g2.createImageData(B, L);
  const est = (q, p2) => (q>=0 && q<B && p2>=0 && p2<L) ? mv.d[p2*B+q] : 0;
  for (let p2 = 0; p2 < L; p2++) for (let q = 0; q < B; q++) {
    const j = p2*B + q, i4 = j*4;
    let c;
    const dyra = (a,b2) => (a>=0 && a<B && b2>=0 && b2<L) ? mv.dyry[b2*B+a] : 0;
    if (!mv.d[j])            c = [16, 30, 26];                         // фон
    else if (mv.dyry[j])     c = (!dyra(q-1,p2) || !dyra(q+1,p2) || !dyra(q,p2-1) || !dyra(q,p2+1))
                                 ? [110, 190, 255]                     // контур сквозной дырки
                                 : [10, 22, 34];                       // сама дырка — насквозь
    else if (!est(q-1,p2) || !est(q+1,p2) || !est(q,p2-1) || !est(q,p2+1))
                             c = [126, 240, 178];                      // наружный контур
    else if (mv.grani[j])    c = [160, 232, 196];                      // внутренняя грань
    else                     c = [44, 132, 92];                        // материал
    im.data[i4] = c[0]; im.data[i4+1] = c[1]; im.data[i4+2] = c[2]; im.data[i4+3] = 255;
  }
  g2.putImageData(im, 0, 0);
  cx.imageSmoothingEnabled = false;
  cx.drawImage(tmp, ox0, oy, B*sc, L*sc);
  cx.strokeStyle = '#e2bf5f'; cx.lineWidth = 1;
  cx.strokeRect(ox0-.5, oy-.5, B*sc+1, L*sc+1);

  // линейка в мм
  // высота детали одна на все виды, её и размечаем
  const vsegoMm = +opt.vysotaMm || (+opt.shirinaMm || 0) * ((izmer && izmer.vysotaKShirine) || 1);
  if (vsegoMm > 0 && v.rol !== 'sverhu') {
    let shag = 1; while ((L*sc/Math.max(vsegoMm,1e-6))*shag < 13) shag *= (shag === 1 ? 2 : (shag === 2 ? 2.5 : 2));
    cx.strokeStyle = '#33544a'; cx.fillStyle = '#6f8a7e';
    cx.beginPath(); cx.moveTo(ox0-6, oy); cx.lineTo(ox0-6, oy + L*sc); cx.stroke();
    for (let z = 0; z <= vsegoMm + 1e-6; z += shag) {
      const y = oy + (z/Math.max(vsegoMm,1e-6)) * L*sc;
      cx.beginPath(); cx.moveTo(ox0-10, y); cx.lineTo(ox0-6, y); cx.stroke();
      cx.fillText(String(+z.toFixed(1)), px(0)+4, y+3);
    }
  }

  // ---- профиль ----
  panel(cx, px(1), y0, pw, rh, 'профиль · ' + POLOS + ' полос, просветы на местах');
  const ox1 = px(1) + shrift*1.0 + ((pw - shrift*2.2) - B*sc)/2;
  const hh = L*sc / POLOS;
  const runs = v.runs || (izmer && izmer.runs) || [];
  const polosy = v.polosy || (izmer && izmer.polosy) || [];
  for (let i = 0; i < POLOS; i++) {
    const vTele = granicy && granicy.some(([a,b],k) => i>=a && i<b && k%2===0);
    cx.fillStyle = vTele ? '#3fbf7f' : '#2a8f5e';
    const rr = runs[i];
    if (rr && rr.length) {
      for (const [a, b] of rr)
        cx.fillRect(ox1 + a*B*sc, oy + i*hh, Math.max(1, (b-a)*B*sc), Math.max(1, hh-0.6));
    } else {
      const w = Math.max(1, (polosy[i]||0)*B*sc);
      cx.fillRect(ox1 + (B*sc-w)/2, oy + i*hh, w, Math.max(1, hh-0.6));
    }
  }
  // сквозная дырка на профиле — рамкой, чтобы было видно, где она
  if (izmer && izmer.otverstie) {
    const o = izmer.otverstie;
    const yd = oy + o.poVysote * L*sc - o.dolyaVysoty * L*sc / 2;
    cx.strokeStyle = '#5aaaff'; cx.setLineDash([3,2]); cx.lineWidth = 1;
    cx.strokeRect(ox1 + B*sc*(0.5 - o.dolyaD/2), yd, B*sc*o.dolyaD, Math.max(2, o.dolyaVysoty*L*sc));
    cx.setLineDash([]);
  }
  if (granicy) {
    cx.strokeStyle = '#e2bf5f'; cx.setLineDash([4,3]); cx.lineWidth = 1; cx.fillStyle = '#e2bf5f';
    granicy.forEach(([a], k) => {
      const y = oy + a*hh;
      if (a) { cx.beginPath(); cx.moveTo(ox1-4, y); cx.lineTo(ox1+B*sc+4, y); cx.stroke(); }
      cx.fillText(String(k+1), ox1 + B*sc + 6, y + shrift*1.1);
    });
    cx.setLineDash([]);
  }

  // ---- наложение ----
  panel(cx, px(2), y0, pw, rh, 'модель поверх снимка · ' + imya);
  if (!nal) {
    cx.fillStyle = '#5b7268';
    cx.fillText(v.izModeli ? 'сравнивать не с чем — сними деталь сбоку'
              : v.rol === 'sverhu' ? 'вид сверху с моделью не сверяется —'
              : 'модель ещё не собрана', px(2)+8, y0 + rh/2);
    if (v.izModeli) cx.fillText('и перетащи вторым снимком', px(2)+8, y0 + rh/2 + shrift*1.3);
    else if (v.rol === 'sverhu') cx.fillText('он нужен для формы сечения', px(2)+8, y0 + rh/2 + shrift*1.3);
    return;
  }
  // наложение показываем целиком: лучше чуть другой масштаб, чем обрезанный низ
  const sc2 = Math.min(sc * B / nal.W, (dostupno - legenda) / nal.H);
  const t2 = document.createElement('canvas'); t2.width = nal.W; t2.height = nal.H;
  t2.getContext('2d').putImageData(new ImageData(nal.rgba, nal.W, nal.H), 0, 0);
  cx.drawImage(t2, px(2) + (pw - nal.W*sc2)/2, oy, nal.W*sc2, nal.H*sc2);
  let yl = y0 + rh - legenda + shrift*1.1;
  const met = [['#3fbf7f', 'совпало ' + Math.round(nal.iou*100) + '%'],
               ['#5aaaff', 'есть на фото, модель не построила ' + Math.round(nal.netVModeli*100) + '%'],
               ['#e85858', 'модель добавила лишнее ' + Math.round(nal.lishneeVModeli*100) + '%']];
  for (const [c, t] of met) {
    cx.fillStyle = c; cx.fillRect(px(2)+7, yl - shrift*0.75, shrift*0.8, shrift*0.8);
    cx.fillStyle = '#9db3a9'; cx.fillText(t, px(2) + 7 + shrift*1.3, yl);
    yl += shrift*1.3;
  }
}

// Совместимость: один вид — частный случай.
export function narisovatRazbor(cv, izmer, granicy, opt = {}) {
  if (opt.vidy && opt.vidy.length) return narisovatVidy(cv, opt.vidy, opt);
  return narisovatVidy(cv, [{ rol:'speredi', izmer, granicy, nal: opt.nalozhenie }], opt);
}
