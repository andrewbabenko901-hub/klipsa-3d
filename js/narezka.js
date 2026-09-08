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
 *
 * Почему разрез рекурсивный. Одного прохода не хватает: если справа на листе
 * стоит колонка взрыв-схемы во всю высоту, то ни одной пустой строки на всю
 * ширину листа нет — и лист режется только на столбцы, а сетка 2×2 слева
 * склеивается в две длинные полосы. Поэтому режем как режут страницу: сначала
 * по строкам внутри куска, потом по столбцам внутри каждой строки, и так
 * вглубь, пока куски делятся. Просветы каждый раз считаем внутри куска, а не
 * по всему листу.
 *
 * Почему отдельно ищем разделитель. В нашем шаблоне лист поделён пополам
 * вертикальной чертой: слева четыре вида, справа — взрыв-схема, столбик тел.
 * Тела — не виды, обмерять их нельзя. Черту видно однозначно: узкий столбец
 * чернил во всю высоту. Найдя её, левую половину режем на виды, а правую
 * оставляем целой картинкой — как справку, что из чего собрано.
 */

const ZAZOR_DOLYA   = 0.012;  // просвет уже этой доли стороны — не разделитель
const SHUM_DOLYA    = 0.004;  // столбец с таким числом точек считаем пустым
const OTSTUP        = 0.05;   // поля вокруг вырезанной панели
const MELKAYA_DOLYA = 0.12;   // панель мельче этой доли от средней — подпись
const GLUBINA       = 4;      // предел вложенности разрезов

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

/** Профиль чернил внутри куска: по строкам (os='y') или по столбцам (os='x'). */
function profil(m, W, r, os) {
  const n = os === 'y' ? (r.y1 - r.y0 + 1) : (r.x1 - r.x0 + 1);
  const sum = new Int32Array(n);
  for (let y = r.y0; y <= r.y1; y++) {
    const s = y*W;
    for (let x = r.x0; x <= r.x1; x++) if (m[s+x]) sum[os === 'y' ? y - r.y0 : x - r.x0]++;
  }
  return sum;
}

/** Плотная рамка вокруг чернил внутри куска. Пусто — вернём null. */
function obzhat(m, W, r) {
  let minx = r.x1, maxx = r.x0, miny = r.y1, maxy = r.y0, tochek = 0;
  for (let y = r.y0; y <= r.y1; y++) {
    const s = y*W;
    for (let x = r.x0; x <= r.x1; x++) if (m[s+x]) {
      tochek++;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  return tochek ? { x0: minx, y0: miny, x1: maxx, y1: maxy, tochek } : null;
}

/**
 * Разрез страницы: строки внутри куска, потом столбцы внутри строки, и так
 * вглубь. Порядок обхода — читательский: сверху вниз, слева направо.
 */
function razrezat(m, W, r, glubina, out) {
  const t = obzhat(m, W, r);
  if (!t || t.tochek < 40) return;
  const uzkiy = { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 };

  if (glubina < GLUBINA) {
    const stroki = kuski(profil(m, W, uzkiy, 'y'), uzkiy.x1 - uzkiy.x0 + 1);
    if (stroki.length > 1) {
      for (const [a, b] of stroki)
        razrezat(m, W, { ...uzkiy, y0: uzkiy.y0 + a, y1: uzkiy.y0 + b }, glubina + 1, out);
      return;
    }
    const stolbcy = kuski(profil(m, W, uzkiy, 'x'), uzkiy.y1 - uzkiy.y0 + 1);
    if (stolbcy.length > 1) {
      for (const [a, b] of stolbcy)
        razrezat(m, W, { ...uzkiy, x0: uzkiy.x0 + a, x1: uzkiy.x0 + b }, glubina + 1, out);
      return;
    }
  }
  out.push({ ...uzkiy, tochek: t.tochek });
}

/**
 * Вертикальная черта-разделитель: узкий столбец чернил почти во всю высоту,
 * стоящий в средней части листа. Возвращает [a, b] или null.
 */
function najtiChertu(m, W, H) {
  const stolb = new Int32Array(W);
  for (let y = 0; y < H; y++) { const s = y*W; for (let x = 0; x < W; x++) if (m[s+x]) stolb[x]++; }
  const tolstyj = Math.max(3, Math.round(W * 0.015));
  const vysoko  = H * 0.70;
  let x = 0;
  while (x < W) {
    if (stolb[x] < vysoko) { x++; continue; }
    const a = x;
    while (x < W && stolb[x] >= vysoko) x++;
    const b = x - 1;
    const seredina = (a + b) / 2 / W;
    if (b - a + 1 <= tolstyj && seredina > 0.25 && seredina < 0.75) return [a, b];
  }
  return null;
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
 * Сетка два на два в начале листа: две верхние строки панелей, по две в
 * каждой. Возвращает [[слева-сверху, справа-сверху], [слева-снизу,
 * справа-снизу]] или null. Строки разбираем по перекрытию высот, а не по
 * координате: панели разной высоты стоят не на одной линии.
 */
function stroki2x2(paneli) {
  if (paneli.length < 4) return null;
  const stroki = [];
  for (const p of paneli) {
    const s = stroki.find(r =>
      Math.min(r.y1, p.y + p.h) - Math.max(r.y0, p.y) > Math.min(r.y1 - r.y0, p.h) * 0.4);
    if (s) { s.y0 = Math.min(s.y0, p.y); s.y1 = Math.max(s.y1, p.y + p.h); s.p.push(p); }
    else stroki.push({ y0: p.y, y1: p.y + p.h, p: [p] });
  }
  if (stroki.length < 2) return null;
  const [a, b] = stroki;
  if (a.p.length !== 2 || b.p.length !== 2) return null;
  const po = r => [...r.p].sort((u, v) => u.x - v.x);
  return [po(a), po(b)];
}

/**
 * Главная. `img` — загруженный Image с листом.
 * Возвращает { paneli:[{dataUrl, x,y,w,h, sym, zapoln, rol}], vzryv, setka, sboj }.
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

  /**
   * Вырезать кусок листа отдельной картинкой, с полем вокруг, и **выбелить
   * вокруг детали фон**.
   *
   * Зачем белить. Нейронка рисует деталь на светло-сером поле, а обмер по
   * умолчанию отделяет деталь заливкой от рамки по белому фону. На сером она
   * не срабатывает и берёт в деталь весь прямоугольник панели — силуэт
   * получается кирпичом, и разбор даёт одно тело вместо шести (проверено на
   * листе A23423). Подбирать метод маски руками под каждый лист нельзя: деталь
   * бывает оранжевая, бежевая и серая, и «по насыщенности» серую не увидит.
   *
   * Как белим. У нас уже есть карта чернил — «здесь отличается от фона листа».
   * Заливаем белым только то, что связано с краем панели: наружное поле уходит
   * в белый, а светлые блики внутри детали остаются как были. Дырки в детали
   * при этом честно остаются дырками.
   */
  const vyrezat = (c) => {
    const w0 = c.x1-c.x0+1, h0 = c.y1-c.y0+1;
    const p = Math.round(Math.max(w0, h0) * OTSTUP);
    const x = Math.max(0, c.x0-p), y = Math.max(0, c.y0-p);
    const w = Math.min(W-x, w0 + 2*p), h = Math.min(H-y, h0 + 2*p);
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const t2 = c2.getContext('2d', { willReadFrequently: true });
    t2.fillStyle = '#fff';
    t2.fillRect(0, 0, w, h);
    t2.drawImage(cv, x, y, w, h, 0, 0, w, h);

    const kadr = t2.getImageData(0, 0, w, h);
    const d = kadr.data;
    const bylo = new Uint8Array(w*h);
    const ochered = new Int32Array(w*h);
    let gol = 0, hvost = 0;
    const kinut = (i) => { if (!bylo[i] && !m[(y + ((i/w)|0))*W + x + (i%w)]) { bylo[i] = 1; ochered[hvost++] = i; } };
    for (let xx = 0; xx < w; xx++) { kinut(xx); kinut((h-1)*w + xx); }
    for (let yy = 0; yy < h; yy++) { kinut(yy*w); kinut(yy*w + w-1); }
    while (gol < hvost) {
      const i = ochered[gol++], xx = i % w, yy = (i/w)|0, j = i*4;
      d[j] = 255; d[j+1] = 255; d[j+2] = 255;
      if (xx > 0)   kinut(i-1);
      if (xx < w-1) kinut(i+1);
      if (yy > 0)   kinut(i-w);
      if (yy < h-1) kinut(i+w);
    }
    t2.putImageData(kadr, 0, 0);
    return { dataUrl: c2.toDataURL('image/png'), x, y, w, h, w0, h0 };
  };

  // ---- черта пополам: слева виды, справа взрыв-схема ----
  const cherta = najtiChertu(m, W, H);
  let oblast = { x0: 0, y0: 0, x1: W-1, y1: H-1 };
  let vzryv = null;
  if (cherta) {
    oblast = { x0: 0, y0: 0, x1: cherta[0]-1, y1: H-1 };
    const pravo = obzhat(m, W, { x0: cherta[1]+1, y0: 0, x1: W-1, y1: H-1 });
    if (pravo && pravo.tochek > 200) vzryv = vyrezat(pravo).dataUrl;
  }

  // ---- рекурсивный разрез на панели ----
  const syrye = [];
  razrezat(m, W, oblast, 0, syrye);
  if (!syrye.length) return { paneli: [], sboj: 'Панели найдены, но все пустые.' };

  // ---- выкинуть подписи: они кратно мельче настоящих видов ----
  const ploshchadi = syrye.map(c => (c.x1-c.x0+1) * (c.y1-c.y0+1));
  const srednyaya = med(ploshchadi);
  const chistye = syrye.filter((c, i) => ploshchadi[i] >= srednyaya * MELKAYA_DOLYA);
  const spisok = chistye.length ? chistye : syrye;

  // ---- вырезать с полями ----
  const paneli = spisok.map(c => {
    const v = vyrezat(c);
    // маска панели для симметрии — из общей карты, без повторного чтения
    const mm = new Uint8Array(v.w0*v.h0);
    for (let yy = 0; yy < v.h0; yy++) for (let xx = 0; xx < v.w0; xx++)
      mm[yy*v.w0+xx] = m[(c.y0+yy)*W + c.x0+xx];
    return { dataUrl: v.dataUrl, x: v.x, y: v.y, w: v.w, h: v.h,
             sym: +simmetriya(mm, v.w0, v.h0).toFixed(3),
             zapoln: +(c.tochek / (v.w0*v.h0)).toFixed(3),
             otnoshenie: +(v.h0/v.w0).toFixed(3) };
  });

  // ---- роли ----
  // Сначала пробуем по месту. В нашем шаблоне виды стоят сеткой два на два:
  // слева сверху спереди, справа сверху сбоку, слева снизу сверху, справа
  // снизу изометрия. Если такая сетка нашлась — раздаём роли по клеткам, а не
  // гадаем. Это надёжнее симметрии: у бежевой детали на сером поле чернил
  // почти нет, симметрия скачет, и по ней изометрию не отличить (лист A22551
  // показал ровно это — все четыре вида получили симметрию ниже 0.5).
  const stroki2 = stroki2x2(paneli);
  if (stroki2) {
    const [[a, b], [c, d]] = stroki2;
    a.rol = 'speredi'; b.rol = 'sboku'; c.rol = 'sverhu'; d.rol = 'propustit';
    paneli.forEach(p => { if (!p.rol) p.rol = 'propustit'; });
  } else {
    // Запасной путь: изометрия — единственная панель, которая заметно
    // несимметрична, у ортогональных видов ось симметрии почти всегда есть.
    let izo = -1;
    if (paneli.length >= 3) {
      let hudshaya = 0;
      paneli.forEach((p, i) => { if (p.sym < paneli[hudshaya].sym) hudshaya = i; });
      if (paneli[hudshaya].sym < 0.80) izo = hudshaya;
    }
    const ocheredb = ['speredi', 'sboku', 'sverhu'];
    let n = 0;
    paneli.forEach((p, i) => { p.rol = (i === izo) ? 'propustit' : (ocheredb[n++] || 'propustit'); });
  }

  return { paneli, vzryv, setka: { panelej: paneli.length, cherta: !!cherta }, W, H, fon };
}
