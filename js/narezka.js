/**
 * Нарезка готового листа с видами на отдельные картинки.
 *
 * Зачем. Картиночные модели Google по ключу не работают без биллинга, а на
 * их собственной странице рисуют бесплатно. Значит лист по шаблону удобно
 * получить руками, сохранить файл и отдать сюда — а приложение само найдёт на
 * нём панели, разрежет и раздаст роли. Дальше каждый вид идёт в тот же обмер,
 * что и фотография, никаких поблажек.
 *
 * Метод. Лист по шаблону — это панели на белом поле, разделённые пустыми
 * полосами. Поэтому ищем не рамки (их может не быть), а именно просветы:
 * столбцы и строки, где нет ни одного «чернильного» пикселя. Широкий просвет —
 * граница между панелями. Это переживает и отсутствие рамок, и лёгкий шум, и
 * подписи под видами.
 */

const ZAZOR_DOLYA   = 0.012;  // просвет уже этой доли стороны — не разделитель
const SHUM_DOLYA    = 0.004;  // столбец с таким числом точек считаем пустым
const OTSTUP        = 0.05;   // поля вокруг вырезанной панели
const MELKAYA_DOLYA = 0.12;   // панель мельче этой доли от средней — подпись

/** Медиана по массиву чисел. */
function med(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

/** Фон берём по рамке листа: там почти всегда чистое поле. */
function cvetFona(px, W, H) {
  const r = [], g = [], b = [];
  const shag = Math.max(1, Math.round(Math.min(W, H) / 120));
  for (let x = 0; x < W; x += shag) {
    for (const y of [0, H-1]) { const i = (y*W+x)*4; r.push(px[i]); g.push(px[i+1]); b.push(px[i+2]); }
  }
  for (let y = 0; y < H; y += shag) {
    for (const x of [0, W-1]) { const i = (y*W+x)*4; r.push(px[i]); g.push(px[i+1]); b.push(px[i+2]); }
  }
  return [med(r), med(g), med(b)];
}

/** Карта «здесь что-то нарисовано»: отличие от цвета фона. */
function chernila(px, W, H, fon, porog) {
  const m = new Uint8Array(W*H);
  for (let i = 0, j = 0; i < m.length; i++, j += 4) {
    const d = Math.abs(px[j]-fon[0]) + Math.abs(px[j+1]-fon[1]) + Math.abs(px[j+2]-fon[2]);
    m[i] = d > porog ? 1 : 0;
  }
  return m;
}

/**
 * Разрезы по одной оси. `sum[i]` — сколько точек в i-й строке (или столбце),
 * `dlina` — длина этой строки. Возвращает границы кусков [[a,b], ...].
 */
function kuski(sum, dlina) {
  const shum = Math.max(1, Math.round(dlina * SHUM_DOLYA));
  const minZazor = Math.max(2, Math.round(sum.length * ZAZOR_DOLYA));
  const out = [];
  let i = 0;
  while (i < sum.length) {
    while (i < sum.length && sum[i] <= shum) i++;          // пропустить пустое
    if (i >= sum.length) break;
    const a = i;
    let posledniy = i, pusto = 0;
    while (i < sum.length) {
      if (sum[i] <= shum) { pusto++; if (pusto >= minZazor) break; }
      else { pusto = 0; posledniy = i; }
      i++;
    }
    out.push([a, posledniy]);
  }
  return out;
}

/** Симметрия относительно вертикальной оси: 1 — идеальная. */
function simmetriya(m, W, H) {
  let obshch = 0, soyuz = 0;
  for (let y = 0; y < H; y++) {
    const s = y*W;
    for (let x = 0; x < W; x++) {
      const a = m[s+x], b = m[s + (W-1-x)];
      if (a && b) obshch++;
      if (a || b) soyuz++;
    }
  }
  return soyuz ? obshch/soyuz : 0;
}

/**
 * Главная. `img` — загруженный Image с листом.
 * Возвращает { paneli:[{dataUrl, x,y,w,h, sym, zapoln, rol}], setka, sboj }.
 */
export function narezatList(img, opt = {}) {
  const porog = opt.porog ?? 60;
  const MAX = opt.max ?? 1600;
  const k = Math.min(1, MAX / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const W = Math.max(2, Math.round((img.naturalWidth || img.width) * k));
  const H = Math.max(2, Math.round((img.naturalHeight || img.height) * k));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ct = cv.getContext('2d', { willReadFrequently: true });
  ct.drawImage(img, 0, 0, W, H);
  const px = ct.getImageData(0, 0, W, H).data;

  const fon = cvetFona(px, W, H);
  if (fon[0] < 120 && fon[1] < 120 && fon[2] < 120)
    return { paneli: [], sboj: 'Фон листа тёмный. Нужен лист на белом поле — как в шаблоне.' };

  const m = chernila(px, W, H, fon, porog);
  let vsego = 0; for (let i = 0; i < m.length; i++) vsego += m[i];
  if (vsego < W*H*0.001) return { paneli: [], sboj: 'На листе почти ничего нет — он пустой или слишком светлый.' };

  const poStolbcam = new Int32Array(W), poStrokam = new Int32Array(H);
  for (let y = 0; y < H; y++) { const s = y*W;
    for (let x = 0; x < W; x++) if (m[s+x]) { poStolbcam[x]++; poStrokam[y]++; } }

  const stolbcy = kuski(poStolbcam, H);
  const stroki  = kuski(poStrokam,  W);
  if (!stolbcy.length || !stroki.length)
    return { paneli: [], sboj: 'Не нашлось ни одной панели.' };

  // ---- ячейки сетки ----
  const syrye = [];
  for (const [y0, y1] of stroki) for (const [x0, x1] of stolbcy) {
    let minx = x1, maxx = x0, miny = y1, maxy = y0, tochek = 0;
    for (let y = y0; y <= y1; y++) { const s = y*W;
      for (let x = x0; x <= x1; x++) if (m[s+x]) {
        tochek++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      } }
    if (tochek < 40) continue;
    syrye.push({ x0: minx, y0: miny, x1: maxx, y1: maxy, tochek });
  }
  if (!syrye.length) return { paneli: [], sboj: 'Панели найдены, но все пустые.' };

  // ---- выкинуть подписи: они кратно мельче настоящих видов ----
  const ploshchadi = syrye.map(c => (c.x1-c.x0+1) * (c.y1-c.y0+1));
  const srednyaya = med(ploshchadi);
  const chistye = syrye.filter((c, i) => ploshchadi[i] >= srednyaya * MELKAYA_DOLYA);
  const spisok = chistye.length ? chistye : syrye;

  // ---- вырезать с полями ----
  const paneli = spisok.map(c => {
    const w0 = c.x1-c.x0+1, h0 = c.y1-c.y0+1;
    const p = Math.round(Math.max(w0, h0) * OTSTUP);
    const x = Math.max(0, c.x0-p), y = Math.max(0, c.y0-p);
    const w = Math.min(W-x, w0 + 2*p), h = Math.min(H-y, h0 + 2*p);

    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const t2 = c2.getContext('2d');
    t2.fillStyle = `rgb(${fon[0]},${fon[1]},${fon[2]})`;
    t2.fillRect(0, 0, w, h);
    t2.drawImage(cv, x, y, w, h, 0, 0, w, h);

    // маска панели для симметрии — из общей карты, без повторного чтения
    const mm = new Uint8Array(w0*h0);
    for (let yy = 0; yy < h0; yy++) for (let xx = 0; xx < w0; xx++)
      mm[yy*w0+xx] = m[(c.y0+yy)*W + c.x0+xx];

    return { dataUrl: c2.toDataURL('image/png'), x, y, w, h,
             sym: +simmetriya(mm, w0, h0).toFixed(3),
             zapoln: +(c.tochek / (w0*h0)).toFixed(3),
             otnoshenie: +(h0/w0).toFixed(3) };
  });

  // ---- роли ----
  // Изометрия — единственная панель, которая заметно несимметрична: у
  // ортогональных видов детали ось симметрии почти всегда есть. Её помечаем
  // «пропустить», остальные раздаём в порядке чтения.
  let izo = -1;
  if (paneli.length >= 3) {
    let hudshaya = 0;
    paneli.forEach((p, i) => { if (p.sym < paneli[hudshaya].sym) hudshaya = i; });
    if (paneli[hudshaya].sym < 0.80) izo = hudshaya;
  }
  const ocheredb = ['speredi', 'sboku', 'sverhu'];
  let n = 0;
  paneli.forEach((p, i) => { p.rol = (i === izo) ? 'propustit' : (ocheredb[n++] || 'propustit'); });

  return { paneli, setka: { stolbcov: stolbcy.length, strok: stroki.length }, W, H, fon };
}
