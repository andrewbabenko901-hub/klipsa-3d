// Классические алгоритмы обработки снимка. Всё честно посчитано здесь, без API.
// Каждый метод — обычная общедоступная классика: Оцу, морфология, обход контура
// по Муру, упрощение Рамера—Дугласа—Пекера, главные оси, автокорреляция.

// ---------- пороги ----------

export function gistogramma(px, N) {
  const h = new Float64Array(256);
  for (let i = 0; i < N; i++) {
    const y = (px[i*4]*0.299 + px[i*4+1]*0.587 + px[i*4+2]*0.114) | 0;
    h[y]++;
  }
  return h;
}

// Метод Оцу: ищем порог, максимизирующий межклассовую дисперсию.
export function porogOtsu(h) {
  let vsego = 0, summa = 0;
  for (let i = 0; i < 256; i++) { vsego += h[i]; summa += i * h[i]; }
  let sumB = 0, wB = 0, luchshee = -1, porog = 128;
  for (let t = 0; t < 256; t++) {
    wB += h[t]; if (!wB) continue;
    const wF = vsego - wB; if (!wF) break;
    sumB += t * h[t];
    const mB = sumB / wB, mF = (summa - sumB) / wF;
    const mezh = wB * wF * (mB - mF) * (mB - mF);
    if (mezh > luchshee) { luchshee = mezh; porog = t; }
  }
  return porog;
}

// Маска по Оцу: деталь темнее фона.
export function maskaOtsu(px, W, H) {
  const N = W * H, m = new Uint8Array(N);
  const t = porogOtsu(gistogramma(px, N));
  // на всякий случай смотрим, чего больше по краям — фон должен быть снаружи
  let kraiSvetlyj = 0, kraiVsego = 0;
  for (let x = 0; x < W; x++) for (const y of [0, H-1]) {
    const i = y*W + x; kraiVsego++;
    if ((px[i*4]*0.299 + px[i*4+1]*0.587 + px[i*4+2]*0.114) > t) kraiSvetlyj++;
  }
  const fonSvetlyj = kraiSvetlyj / Math.max(1, kraiVsego) > 0.5;
  for (let i = 0; i < N; i++) {
    const y = px[i*4]*0.299 + px[i*4+1]*0.587 + px[i*4+2]*0.114;
    m[i] = (fonSvetlyj ? y < t : y > t) ? 1 : 0;
  }
  return m;
}

// Маска заливкой от рамки кадра: фон — то белое, что связано с краем.
// Так белая деталь на белом фоне не теряется.
export function maskaZalivka(px, W, H, porogBelogo = 232, razbros = 18) {
  const N = W * H, belo = new Uint8Array(N), fon = new Uint8Array(N), st = [];
  for (let i = 0; i < N; i++) {
    const r = px[i*4], g = px[i*4+1], b = px[i*4+2];
    const mn = Math.min(r,g,b), mx = Math.max(r,g,b);
    belo[i] = (mn >= porogBelogo && mx - mn <= razbros) ? 1 : 0;
  }
  const kin = i => { if (belo[i] && !fon[i]) { fon[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { kin(x); kin((H-1)*W + x); }
  for (let y = 0; y < H; y++) { kin(y*W); kin(y*W + W - 1); }
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i - x) / W;
    if (x > 0) kin(i-1); if (x < W-1) kin(i+1);
    if (y > 0) kin(i-W); if (y < H-1) kin(i+W);
  }
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) m[i] = fon[i] ? 0 : 1;
  m.belo = belo;                       // пригодится, чтобы найти дырку внутри детали
  return m;
}

// Маска по насыщенности: цветная деталь на сером или белом фоне.
export function maskaNasyshchennost(px, W, H, porog = 34) {
  const N = W * H, m = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i*4], g = px[i*4+1], b = px[i*4+2];
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    m[i] = (mx - mn) >= porog ? 1 : 0;
  }
  return m;
}

// Градиентная маска (Собель + замыкание): выручает на пёстром фоне,
// когда ни порог, ни заливка не берут.
export function maskaGradient(px, W, H, porog = 42, sZalivkoyDyr = true) {
  const N = W * H, g = new Float32Array(N), m = new Uint8Array(N);
  const ya = i => px[i*4]*0.299 + px[i*4+1]*0.587 + px[i*4+2]*0.114;
  for (let y = 1; y < H-1; y++) for (let x = 1; x < W-1; x++) {
    const i = y*W + x;
    const gx = -ya(i-W-1) - 2*ya(i-1) - ya(i+W-1) + ya(i-W+1) + 2*ya(i+1) + ya(i+W+1);
    const gy = -ya(i-W-1) - 2*ya(i-W) - ya(i-W+1) + ya(i+W-1) + 2*ya(i+W) + ya(i+W+1);
    g[i] = Math.hypot(gx, gy);
  }
  for (let i = 0; i < N; i++) m[i] = g[i] > porog ? 1 : 0;
  const zamk = morfologiya(m, W, H, 3, 'zakrytie');
  return sZalivkoyDyr ? zapolnitDyry(zamk, W, H) : zamk;
}

export function obedinit(a, b) { const o = new Uint8Array(a.length); for (let i=0;i<a.length;i++) o[i] = (a[i]||b[i])?1:0; return o; }
export function peresech(a, b) { const o = new Uint8Array(a.length); for (let i=0;i<a.length;i++) o[i] = (a[i]&&b[i])?1:0; return o; }

// ---------- морфология ----------

function shag(m, W, H, r, rasshirenie) {
  const o = new Uint8Array(m.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let est = rasshirenie ? 0 : 1;
    for (let dy = -r; dy <= r && (rasshirenie ? !est : est); dy++)
      for (let dx = -r; dx <= r; dx++) {
        const ny = y+dy, nx = x+dx;
        const v = (ny<0||ny>=H||nx<0||nx>=W) ? 0 : m[ny*W+nx];
        if (rasshirenie) { if (v) { est = 1; break; } }
        else if (!v) { est = 0; break; }
      }
    o[y*W+x] = est;
  }
  return o;
}

export function morfologiya(m, W, H, r, op) {
  if (!r) return m;
  switch (op) {
    case 'rasshirenie': return shag(m, W, H, r, true);
    case 'suzhenie':    return shag(m, W, H, r, false);
    case 'otkrytie':    return shag(shag(m, W, H, r, false), W, H, r, true);
    case 'zakrytie':    return shag(shag(m, W, H, r, true), W, H, r, false);
    default: return m;
  }
}

// Заполнение внутренних дыр: заливаем фон от рамки, что не залилось — деталь.
export function zapolnitDyry(m, W, H) {
  const N = W*H, vne = new Uint8Array(N), st = [];
  const kin = i => { if (!m[i] && !vne[i]) { vne[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { kin(x); kin((H-1)*W+x); }
  for (let y = 0; y < H; y++) { kin(y*W); kin(y*W+W-1); }
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i - x) / W;
    if (x > 0) kin(i-1); if (x < W-1) kin(i+1);
    if (y > 0) kin(i-W); if (y < H-1) kin(i+W);
  }
  const o = new Uint8Array(N);
  for (let i = 0; i < N; i++) o[i] = vne[i] ? 0 : 1;
  return o;
}

// ---------- компоненты ----------

export function komponenty(m, W, H, minPloshchad = 100) {
  const N = W*H, metka = new Int32Array(N), spisok = [];
  let n = 0;
  for (let s = 0; s < N; s++) {
    if (!m[s] || metka[s]) continue;
    n++; let k = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    const q = [s]; metka[s] = n;
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i - x) / W; k++;
      if (x<x0)x0=x; if (x>x1)x1=x; if (y<y0)y0=y; if (y>y1)y1=y;
      if (x>0   && m[i-1] && !metka[i-1]) { metka[i-1]=n; q.push(i-1); }
      if (x<W-1 && m[i+1] && !metka[i+1]) { metka[i+1]=n; q.push(i+1); }
      if (y>0   && m[i-W] && !metka[i-W]) { metka[i-W]=n; q.push(i-W); }
      if (y<H-1 && m[i+W] && !metka[i+W]) { metka[i+W]=n; q.push(i+W); }
    }
    if (k >= minPloshchad) spisok.push({ nom:n, ploshchad:k, x0,x1,y0,y1,
      zapolnennost: k / ((x1-x0+1)*(y1-y0+1)),
      kraya: (y0<=1)+(x0<=1)+(y1>=H-2)+(x1>=W-2) });
  }
  return { metka, spisok };
}

export function vybratKomponentu(spisok, W, H, sposob = 'umnyj') {
  if (!spisok.length) return null;
  if (sposob === 'krupneyshaya') return spisok.reduce((a,b) => a.ploshchad>=b.ploshchad?a:b);
  // умный: выбрасываем рамки и подписи, среди крупных берём наименее заполняющую рамку
  let god = spisok.filter(c =>
    c.zapolnennost >= 0.15 &&
    !((c.x1-c.x0+1) > 0.94*W && (c.y1-c.y0+1) > 0.94*H && c.zapolnennost < 0.5) &&
    !(c.kraya >= 3 && c.zapolnennost < 0.55));
  if (!god.length) god = spisok;
  const krupno = Math.max(...god.map(c => c.ploshchad));
  god = god.filter(c => c.ploshchad >= 0.30*krupno);
  return sposob === 'menee_zapolnennaya'
    ? god.reduce((a,b) => a.zapolnennost<=b.zapolnennost?a:b)
    : god.reduce((a,b) => a.zapolnennost<=b.zapolnennost?a:b);
}

// ---------- ось ----------

// Главные оси (PCA) по пикселям детали. Возвращает угол длинной оси.
export function osPCA(m, W, H, nom, metka) {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (metka[y*W+x] === nom) { n++; sx += x; sy += y; }
  if (!n) return 0;
  const mx = sx/n, my = sy/n;
  let xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (metka[y*W+x] === nom) { const a = x-mx, b = y-my; xx += a*a; yy += b*b; xy += a*b; }
  return 0.5 * Math.atan2(2*xy, xx - yy);
}

// Насколько профиль несимметричен сверху вниз. У правильной оси разница большая.
export function asimmetriya(r) {
  const mx = Math.max(...r) || 1; let s = 0;
  for (let i = 0; i < r.length/2; i++) s += Math.abs(r[i] - r[r.length-1-i]);
  return s / (mx * r.length/2);
}

// ---------- профиль ----------

export function profil(metka, nom, W, H, ramka, vert, N = 40) {
  const { x0, x1, y0, y1 } = ramka;
  const a0 = vert ? y0 : x0, a1 = vert ? y1 : x1;
  const b0 = vert ? x0 : y0, b1 = vert ? x1 : y1;
  const L = a1 - a0 + 1, out = [];
  for (let i = 0; i < N; i++) {
    const p0 = a0 + Math.floor(L*i/N);
    const p1 = a0 + Math.max(Math.floor(L*i/N)+1, Math.floor(L*(i+1)/N));
    let lo = 1e9, hi = -1;
    for (let p = p0; p < p1; p++) for (let q = b0; q <= b1; q++) {
      const idx = vert ? (p*W + q) : (q*W + p);
      if (metka[idx] === nom) { if (q < lo) lo = q; if (q > hi) hi = q; }
    }
    out.push(hi >= 0 ? hi - lo + 1 : 0);
  }
  return out;
}

/**
 * Полный профиль полосы: не только огибающая, но и просветы внутри.
 * Огибающая врёт там, где деталь разрезная: две лапки с зазором дают ту же
 * ширину, что сплошной конус, и модель получается «грибом». Здесь для каждой
 * полосы берётся объединение занятых столбцов по всем её строкам, из него
 * достаются отрезки материала (runs), доля заполнения и зазор.
 */
export function profilPolnyj(metka, nom, W, H, ramka, vert, N = 40) {
  const { x0, x1, y0, y1 } = ramka;
  const a0 = vert ? y0 : x0, a1 = vert ? y1 : x1;
  const b0 = vert ? x0 : y0, b1 = vert ? x1 : y1;
  const L = a1 - a0 + 1, B = b1 - b0 + 1;
  const ogib = [], telo = [], zapoln = [], runs = [], centr = [];
  const stolb = new Uint8Array(B);
  for (let i = 0; i < N; i++) {
    stolb.fill(0);
    const p0 = a0 + Math.floor(L*i/N);
    const p1 = a0 + Math.max(Math.floor(L*i/N)+1, Math.floor(L*(i+1)/N));
    for (let p = p0; p < p1; p++) for (let q = 0; q < B; q++) {
      const idx = vert ? (p*W + b0 + q) : ((b0 + q)*W + p);
      if (metka[idx] === nom) stolb[q] = 1;
    }
    const rr = []; let s = -1, est = 0;
    for (let q = 0; q < B; q++) {
      if (stolb[q]) { est++; if (s < 0) s = q; }
      else if (s >= 0) { rr.push([s/B, q/B]); s = -1; }
    }
    if (s >= 0) rr.push([s/B, 1]);
    const og = rr.length ? (rr[rr.length-1][1] - rr[0][0]) : 0;
    ogib.push(og);
    telo.push(est/B);
    zapoln.push(og > 0 ? (est/B)/og : 1);
    runs.push(rr);
    centr.push(rr.length ? (rr[rr.length-1][1] + rr[0][0])/2 : 0.5);
  }
  return { ogib, telo, zapoln, runs, centr, shirinaPx: B, vysotaPx: L };
}

// Медиана — устойчивее среднего там, где одна полоса словила блик.
export function mediana(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x,y)=>x-y);
  return s.length % 2 ? s[(s.length-1)/2] : (s[s.length/2-1] + s[s.length/2])/2;
}

/**
 * Внутренние грани: перепады яркости ВНУТРИ детали, а не её наружный контур.
 * По ним видно рёбра, ступеньки, прорези и просвечивающие части — деталь
 * перестаёт быть сплошным закрашенным пятном.
 */
export function vnutrenniyeGrani(px, W, H, metka, nom, porog = 26) {
  const g = new Uint8Array(W*H);
  const ya = i => px[i*4]*0.299 + px[i*4+1]*0.587 + px[i*4+2]*0.114;
  for (let y = 2; y < H-2; y++) for (let x = 2; x < W-2; x++) {
    const i = y*W + x;
    if (metka[i] !== nom) continue;
    // пиксели у самого края детали пропускаем: там наружный контур
    if (metka[i-1] !== nom || metka[i+1] !== nom || metka[i-W] !== nom || metka[i+W] !== nom) continue;
    const gx = -ya(i-W-1) - 2*ya(i-1) - ya(i+W-1) + ya(i-W+1) + 2*ya(i+1) + ya(i+W+1);
    const gy = -ya(i-W-1) - 2*ya(i-W) - ya(i-W+1) + ya(i+W-1) + 2*ya(i+W) + ya(i+W+1);
    if (Math.hypot(gx, gy) > porog) g[i] = 1;
  }
  return g;
}

// ---------- контур ----------

// Обход границы по Муру. Даёт замкнутый контур детали.
export function kontur(metka, nom, W, H) {
  let sx = -1, sy = -1;
  for (let y = 0; y < H && sy < 0; y++) for (let x = 0; x < W; x++)
    if (metka[y*W+x] === nom) { sx = x; sy = y; break; }
  if (sy < 0) return [];
  const sosedi = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const est = (x,y) => x>=0 && y>=0 && x<W && y<H && metka[y*W+x] === nom;
  const put = [[sx,sy]];
  let cx = sx, cy = sy, napr = 6, shagov = 0;
  do {
    let nashli = false;
    for (let k = 0; k < 8; k++) {
      const d = (napr + 6 + k) % 8, [dx,dy] = sosedi[d];
      if (est(cx+dx, cy+dy)) { cx += dx; cy += dy; napr = d; put.push([cx,cy]); nashli = true; break; }
    }
    if (!nashli) break;
  } while (++shagov < 4*W*H && !(cx === sx && cy === sy));
  return put;
}

// Рамер—Дуглас—Пекер: упрощение ломаной. Углы остаются, мелочь уходит.
export function rdp(tochki, eps) {
  if (tochki.length < 3) return tochki.slice();
  const dist = (p, a, b) => {
    const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx,dy) || 1;
    return Math.abs(dy*p[0] - dx*p[1] + b[0]*a[1] - b[1]*a[0]) / L;
  };
  const rek = (t, i, j) => {
    let mx = 0, mi = i;
    for (let k = i+1; k < j; k++) { const d = dist(t[k], t[i], t[j]); if (d > mx) { mx = d; mi = k; } }
    if (mx > eps) return [...rek(t, i, mi), ...rek(t, mi, j).slice(1)];
    return [t[i], t[j]];
  };
  return rek(tochki, 0, tochki.length-1);
}

// ---------- нарезка на тела без нейронки ----------

function sgladit(r, okno) {
  const o = r.slice();
  for (let i = 0; i < r.length; i++) {
    let s = 0, n = 0;
    for (let k = -okno; k <= okno; k++) { const j = i+k; if (j>=0 && j<r.length) { s += r[j]; n++; } }
    o[i] = s/n;
  }
  return o;
}

// Период повторения по автокорреляции — так узнаётся ёлочка и число зубцов.
function period(r) {
  const sr = r.reduce((a,b)=>a+b,0)/r.length;
  const d = r.map(v => v - sr);
  let luchshiy = 0, luchshee = 0;
  for (let lag = 2; lag <= Math.floor(r.length/2); lag++) {
    let s = 0, n = 0;
    for (let i = 0; i + lag < d.length; i++) { s += d[i]*d[i+lag]; n++; }
    const k = n ? s/n : 0;
    if (k > luchshee) { luchshee = k; luchshiy = lag; }
  }
  const energia = d.reduce((a,b)=>a+b*b,0)/d.length || 1;
  return { lag: luchshiy, sila: luchshee/energia };
}

// Линейная подгонка куска [i,j): возвращает наклон, свободный член и остаток.
function pryamaya(r, i, j) {
  const n = j - i;
  if (n <= 1) return { k:0, b:r[i] ?? 0, sse:0 };
  let sx=0, sy=0, sxx=0, sxy=0;
  for (let t = i; t < j; t++) { const x = t - i; sx+=x; sy+=r[t]; sxx+=x*x; sxy+=x*r[t]; }
  const zn = n*sxx - sx*sx;
  const k = zn ? (n*sxy - sx*sy) / zn : 0;
  const b = (sy - k*sx) / n;
  let sse = 0;
  for (let t = i; t < j; t++) { const e = r[t] - (k*(t-i) + b); sse += e*e; }
  return { k, b, sse };
}


/**
 * Нарезка профиля на тела. Разбиение ищется динамическим программированием:
 * профиль приближается ломаной из K отрезков. Считаются сразу два канала —
 * огибающая и доля материала внутри неё; по второму каналу видно место, где
 * сплошная шейка переходит в лапки с просветом, а по огибающей его не видно.
 * Никакой нейронки: и самостоятельный разбор, и независимый голос при сверке.
 */
function podgotovka(polosy, dop) {
  const N = polosy.length, mx = Math.max(...polosy) || 1;
  const r = sgladit(polosy.map(v => v/mx), 1);
  const f = sgladit((dop && dop.zapoln && dop.zapoln.length === N)
                    ? dop.zapoln.slice() : new Array(N).fill(1), 1);
  const MIN = Math.max(2, Math.round(N * 0.05)), MAXK = 8;

  const cena = [];
  for (let i = 0; i < N; i++) { cena[i] = [];
    for (let j = i+1; j <= N; j++) cena[i][j] = pryamaya(r,i,j).sse + 1.4*pryamaya(f,i,j).sse; }

  const best = [], otkuda = [];
  for (let k = 0; k <= MAXK; k++) { best[k] = new Float64Array(N+1).fill(Infinity); otkuda[k] = new Int32Array(N+1).fill(-1); }
  best[0][0] = 0;
  for (let k = 1; k <= MAXK; k++)
    for (let j = MIN*k; j <= N; j++)
      for (let i = MIN*(k-1); i <= j - MIN; i++) {
        const c = best[k-1][i] + cena[i][j];
        if (c < best[k][j]) { best[k][j] = c; otkuda[k][j] = i; }
      }
  return { N, r, f, cena, best, otkuda, MAXK };
}

function rezyDlya(P, k) {
  if (!isFinite(P.best[k][P.N])) return null;
  const rezy = new Array(k+1); rezy[k] = P.N;
  for (let t = k; t >= 1; t--) rezy[t-1] = P.otkuda[t][rezy[t]];
  if (rezy.some(v => v < 0)) return null;
  // склейка почти сонаправленных соседей: одно тело не должно дробиться
  for (let i = 0; i + 2 < rezy.length; ) {
    const A1 = pryamaya(P.r, rezy[i], rezy[i+1]), B1 = pryamaya(P.r, rezy[i+1], rezy[i+2]);
    const uA = A1.b + A1.k*(rezy[i+1]-rezy[i])/2, uB = B1.b + B1.k*(rezy[i+2]-rezy[i+1])/2;
    const zA = P.f.slice(rezy[i], rezy[i+1]), zB = P.f.slice(rezy[i+1], rezy[i+2]);
    const rf = Math.abs(mediana(zA) - mediana(zB));
    if (Math.abs(uA - uB) < 0.035 && Math.abs(A1.k - B1.k) < 0.008 && rf < 0.12) rezy.splice(i+1, 1);
    else i++;
  }
  return rezy;
}

function telaIz(P, rezy, dop) {
  const { r, N } = P, tela = [];
  for (let k = 0; k < rezy.length-1; k++) {
    const a = rezy[k], b = rezy[k+1], kus = r.slice(a, b);
    const p = pryamaya(r, a, b);
    const dolyaV = (b-a)/N;
    const uroven = p.b + p.k*(b-a)/2;              // средняя ширина по прямой
    const naklon = p.k * (b-a);                     // насколько тело меняется по всей длине
    const ostatok = kus.map((v,t) => v - (p.k*t + p.b));
    const ryab = period(ostatok);
    const amplituda = Math.sqrt(ostatok.reduce((x,y)=>x+y*y,0)/ostatok.length);
    const posledniy = k === rezy.length-2;

    // просветы: если внутри полосы материал идёт двумя-тремя кусками, это не
    // сплошной конус, а лапки. Без этого две лапки читаются одной болванкой.
    let zap = 1, kuskov = 1, zazor = 0;
    if (dop && dop.zapoln && dop.runs) {
      zap = mediana(dop.zapoln.slice(a, b).filter(v => v > 0)) || 1;
      kuskov = Math.round(mediana(dop.runs.slice(a, b).map(x => x.length))) || 1;
      if (zap < 1) zazor = +(1 - zap).toFixed(3);
    }
    const razreznoe = kuskov >= 2 && zap < 0.82;

    // короткое и широкое — это диск или плита, даже если прямая слегка наклонена:
    // наклон там от того, что кусок захватывает край соседней ступени
    const ploskoe = dolyaV <= 0.17 && uroven > 0.58 && Math.abs(naklon) < 0.34;
    const uzkoe = uroven < 0.52 && Math.abs(naklon) < 0.16;
    const rastet = naklon > 0.14;
    const suzhaetsya = naklon < -0.14;
    const zubchatoe = kus.length >= 6 && ryab.lag >= 2 && ryab.sila > 0.19 && amplituda > 0.017;
    const elochka = zubchatoe && Math.abs(naklon) < 0.22 && uroven > 0.3;
    const rebristoe = zubchatoe && suzhaetsya;

    let tip = 'prochee', zub = 0, napr = 'net', sech = 'krugloe', reb = 0;
    if (razreznoe) sech = 'razreznoe';
    if (elochka) { tip = 'elochka'; zub = Math.max(3, Math.round(kus.length / ryab.lag)); napr = 'vverh'; }
    else if (ploskoe) tip = k === 0 ? 'shlyapka_disk' : 'disk';
    // лапки, расходящиеся книзу, — это хвостовик, а не разрезной конус:
    // конус сходится внутрь и с фотографией расходится на треть площади
    else if (razreznoe && rastet) tip = 'hvostovik';
    else if (razreznoe && (suzhaetsya || posledniy)) tip = 'lapki';
    else if (posledniy && (p.b + p.k*(b-a)) < 0.34 && naklon < -0.06) {
      tip = 'ostrie'; if (rebristoe && !razreznoe) { sech = 'krest_s_rebrami'; reb = 4; } }
    else if (rastet)  tip = 'vorotnik';
    // широкое сужающееся не в самом низу — это воротник под шляпкой, а не
    // сплошной конус: конус там раздувал деталь и делал её «грибом»
    else if (suzhaetsya && !posledniy && uroven > 0.45) tip = 'vorotnik';
    else if (suzhaetsya) { tip = 'konus'; if (rebristoe && !razreznoe) { sech = 'krest_s_rebrami'; reb = 4; } }
    else if (uzkoe)   tip = 'shejka';
    else tip = k === 0 ? 'shlyapka_disk' : 'shejka';

    tela.push({
      nomer: tela.length + 1,
      tip, sechenie: sech, rebra: reb, zubcov: zub, napravlenieZubcov: napr,
      dolyaVysoty: +dolyaV.toFixed(3),
      dolyaShiriny: +Math.max(0.05, Math.min(1, uroven)).toFixed(3),
      suzhaetsya: suzhaetsya ? 'knizu' : (rastet ? 'kverhu' : 'net'),
      kuskov, zapolnenie: +zap.toFixed(3), zazor,
      opisanie: OPIS[tip] || 'кусок',
      uverennost: +(0.45 + 0.18*Math.min(1, dolyaV*6) + (elochka?0.17:0) + (rebristoe?0.07:0)).toFixed(2),
      istochnik: 'алгоритм',
    });
  }
  return tela;
}

export function narezatTela(polosy, chuvstvitelnost = 0.5, dop = null) {
  const P = podgotovka(polosy, dop);
  // сколько отрезков: ошибку считаем в долях от ошибки одной прямой, иначе
  // абсолютные числа мелкие и штраф всегда побеждает.
  const bazovaya = P.cena[0][P.N] || 1e-9;
  const shtraf = 0.010 + 0.055 * (1 - chuvstvitelnost);
  let luchK = 2, luchOcenka = Infinity;
  for (let k = 2; k <= P.MAXK; k++) {
    if (!isFinite(P.best[k][P.N])) continue;
    const o = P.best[k][P.N]/bazovaya + shtraf*k;
    if (o < luchOcenka) { luchOcenka = o; luchK = k; }
  }
  return telaIz(P, rezyDlya(P, luchK), dop);
}

/**
 * Все разумные варианты нарезки — от двух тел до восьми. Сколько тел на самом
 * деле, честнее решать не штрафом из головы, а тем, какой вариант даёт силуэт
 * ближе к снимку: это и делает вызывающая сторона.
 */
export function variantyNarezki(polosy, dop = null, maxK = 8) {
  const P = podgotovka(polosy, dop), out = [];
  const bylo = new Set();
  for (let k = 2; k <= Math.min(maxK, P.MAXK); k++) {
    const rezy = rezyDlya(P, k); if (!rezy) continue;
    const klyuch = rezy.join(',');
    if (bylo.has(klyuch)) continue;
    bylo.add(klyuch);
    out.push({ k, tel: rezy.length-1, tela: telaIz(P, rezy, dop) });
  }
  return out;
}

const OPIS = {
  shlyapka_disk:'верхний диск', disk:'диск', shejka:'гладкая шейка',
  vorotnik:'воротник', elochka:'ёлочка с зубцами', konus:'сужающийся конус',
  ostrie:'остриё', lapki:'лапки с зазором', prochee:'кусок',
};

// ---------- сборка всего вместе ----------

export const METODY_MASKI = {
  zalivka:      'Заливка от рамки — белый фон',
  otsu:         'Порог Оцу — автоматический',
  nasyshchennost:'По насыщенности — цветная деталь',
  gradient:     'По градиенту — пёстрый фон',
  kombi:        'Комбинированный — заливка ∪ насыщенность',
};

/**
 * Маска ТОЛЬКО материала: без замкнутого фона внутри детали.
 * Заливка от рамки по построению считает материалом всё, что не связано с
 * краем кадра, — значит дырку в шляпке она заклеивает и найти её потом нельзя.
 * Разница между этой маской и обычной и есть сквозное отверстие.
 */
export function maskaMateriala(px, W, H, metod, nastr = {}) {
  const N = W * H;
  const bezBelogo = (porog) => {
    const z = maskaZalivka(px, W, H, porog);
    const belo = z.belo, o = new Uint8Array(N);
    for (let i = 0; i < N; i++) o[i] = belo[i] ? 0 : 1;
    return o;
  };
  switch (metod) {
    case 'otsu':           return maskaOtsu(px, W, H);
    case 'nasyshchennost': return maskaNasyshchennost(px, W, H, nastr.porogNasyshch ?? 34);
    case 'gradient':       return maskaGradient(px, W, H, nastr.porogGradienta ?? 42, false);
    case 'kombi':          return obedinit(bezBelogo(nastr.porogBelogo ?? 232),
                                           maskaNasyshchennost(px, W, H, nastr.porogNasyshch ?? 40));
    default:               return bezBelogo(nastr.porogBelogo ?? 232);
  }
}

export function postroitMasku(px, W, H, metod, nastr = {}) {
  switch (metod) {
    case 'otsu':           return maskaOtsu(px, W, H);
    case 'nasyshchennost': return maskaNasyshchennost(px, W, H, nastr.porogNasyshch ?? 34);
    case 'gradient':       return maskaGradient(px, W, H, nastr.porogGradienta ?? 42);
    case 'kombi':          return obedinit(maskaZalivka(px, W, H), maskaNasyshchennost(px, W, H, nastr.porogNasyshch ?? 40));
    default:               return maskaZalivka(px, W, H, nastr.porogBelogo ?? 232);
  }
}
