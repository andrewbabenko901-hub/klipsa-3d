// Сверка модели со снимком по силуэту.
// Профиль отвечает на вопрос «какой ширины деталь на этой высоте», но не на
// вопрос «похожа ли собранная модель на фотографию». Здесь модель рисуется
// ортогонально сбоку, силуэт совмещается с маской снимка и считается доля
// совпадения. Видно не «похоже/непохоже», а где именно расходится.
import * as THREE from 'three';

let ren = null, scena = null, kam = null, mesh = null, plosk = null;

function podgotovit() {
  if (ren) return;
  ren = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: false });
  ren.setPixelRatio(1);
  scena = new THREE.Scene();
  scena.background = new THREE.Color(0x000000);
  kam = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  plosk = document.createElement('canvas');
}

/**
 * Силуэт геометрии. `ugol` 0 — вид спереди (смотрим вдоль Z), 90 — вид сбоку
 * (вдоль X). Ширина кадра берётся по нужной оси, а не по большей из двух:
 * иначе сплющенная модель в профиль показывалась бы с полями.
 */
export function siluetGeometrii(geom, SW = 260, ugol = 0) {
  if (!geom) return null;
  podgotovit();
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
  const rad = ugol * Math.PI / 180;
  const w = Math.max(1e-6, Math.abs(sx*Math.cos(rad)) + Math.abs(sz*Math.sin(rad)));
  const h = Math.max(sy, 1e-6);
  const W = SW, H = Math.max(8, Math.min(1400, Math.round(SW * h / w)));

  if (mesh) { scena.remove(mesh); mesh.material.dispose(); mesh = null; }
  mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  const cx = (bb.max.x + bb.min.x)/2, cy = (bb.max.y + bb.min.y)/2, cz = (bb.max.z + bb.min.z)/2;
  mesh.position.set(-cx, -cy, -cz);
  scena.add(mesh);

  kam.left = -w/2; kam.right = w/2; kam.top = h/2; kam.bottom = -h/2;
  const dal = Math.max(sx, sy, sz) * 4;
  kam.position.set(Math.sin(rad)*dal, 0, Math.cos(rad)*dal);
  kam.up.set(0, 1, 0);
  kam.lookAt(0, 0, 0);
  kam.updateProjectionMatrix();

  ren.setSize(W, H, false);
  ren.render(scena, kam);

  plosk.width = W; plosk.height = H;
  const c2 = plosk.getContext('2d', { willReadFrequently: true });
  c2.drawImage(ren.domElement, 0, 0);
  const px = c2.getImageData(0, 0, W, H).data;
  const d = new Uint8Array(W*H);
  for (let i = 0; i < W*H; i++) d[i] = px[i*4] > 90 ? 1 : 0;
  return obrezat(d, W, H);
}

/** Обрезка маски по занятому прямоугольнику. */
export function obrezat(d, W, H) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[y*W+x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { d: new Uint8Array(1), W: 1, H: 1 };
  const w = x1-x0+1, h = y1-y0+1, o = new Uint8Array(w*h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y*w+x] = d[(y+y0)*W + x+x0];
  return { d: o, W: w, H: h };
}

/** Ближайший сосед в сетку gw x gh. */
function vSetku(m, gw, gh) {
  const o = new Uint8Array(gw*gh);
  for (let y = 0; y < gh; y++) {
    const sy = Math.min(m.H-1, Math.floor(y * m.H / gh));
    for (let x = 0; x < gw; x++) o[y*gw+x] = m.d[sy*m.W + Math.min(m.W-1, Math.floor(x * m.W / gw))];
  }
  return o;
}

/**
 * Совмещение двух силуэтов. Оба приводятся к общему масштабу ПО ШИРИНЕ и
 * прижимаются к верху — тогда расхождение по высоте не прячется под
 * нормировкой, а честно вылезает красным снизу.
 */
export function sravnit(fot, mod, G = 200) {
  if (!fot || !mod || fot.W < 2 || mod.W < 2) return null;
  const af = fot.H / fot.W, am = mod.H / mod.W;
  const HH = Math.max(8, Math.min(1200, Math.round(G * Math.max(af, am))));
  const hf = Math.max(1, Math.round(G * af)), hm = Math.max(1, Math.round(G * am));
  const f = vSetku(fot, G, hf), m = vSetku(mod, G, hm);

  const rgba = new Uint8ClampedArray(G*HH*4);
  let obshch = 0, tolkoF = 0, tolkoM = 0;
  for (let y = 0; y < HH; y++) for (let x = 0; x < G; x++) {
    const a = y < hf ? f[y*G+x] : 0;
    const b = y < hm ? m[y*G+x] : 0;
    const i = (y*G+x)*4;
    if (a && b) { obshch++; rgba[i]=63; rgba[i+1]=191; rgba[i+2]=127; rgba[i+3]=255; }
    else if (a)  { tolkoF++; rgba[i]=90;  rgba[i+1]=170; rgba[i+2]=255; rgba[i+3]=225; }
    else if (b)  { tolkoM++; rgba[i]=232; rgba[i+1]=88;  rgba[i+2]=88;  rgba[i+3]=225; }
    else { rgba[i]=13; rgba[i+1]=23; rgba[i+2]=20; rgba[i+3]=255; }
  }
  const soyuz = obshch + tolkoF + tolkoM || 1;
  return {
    iou: obshch/soyuz,
    netVModeli: tolkoF/soyuz,        // синее: есть на фото, модель не построила
    lishneeVModeli: tolkoM/soyuz,    // красное: модель придумала лишнее
    W: G, H: HH, rgba,
    vysotaFoto: af, vysotaModeli: am,
  };
}

/**
 * Сверка сразу по нескольким видам. `vidy` — [{maska, ugol, rol}].
 * Совпадение считается по каждому виду отдельно и усредняется: круглая модель
 * может идеально лечь на вид спереди и развалиться на виде сбоку — вот это и
 * ловится.
 */
export function sravnitVidy(vidy, geom, G = 200, SW = 260) {
  const est = (vidy || []).filter(v => v && v.maska && v.maska.W > 1);
  if (!est.length || !geom) return null;
  const shtuki = [];
  for (const v of est) {
    const s = sravnit(v.maska, siluetGeometrii(geom, SW, v.ugol || 0), G);
    if (s) shtuki.push(Object.assign({ rol: v.rol, ugol: v.ugol || 0 }, s));
  }
  if (!shtuki.length) return null;
  const sr = k => shtuki.reduce((a, b) => a + b[k], 0) / shtuki.length;
  return { vidy: shtuki, iou: sr('iou'),
           netVModeli: sr('netVModeli'), lishneeVModeli: sr('lishneeVModeli'),
           glavnyj: shtuki[0] };
}

// ---------- автоподгонка ----------

// что можно двигать: только размеры, не количества
const TYANEM = ['d','dLow','dCore','dBore','len','t','t2','h','w','l','span','wing',
                'core','spread','foot','s','okno','gap','barbD','dep','slot','slotW','bore'];

/**
 * Покоординатный спуск по числовым параметрам элементов: каждый параметр
 * пробуется в нескольких множителях, остаётся тот, где силуэт ближе к фото.
 * Нейронка даёт структуру, обмер — первые числа, а это доводит числа по картинке.
 */
export function podognatPoFoto(els, fot, stroit, opt = {}) {
  // fot — либо одна маска, либо массив видов [{maska, ugol}]
  const spisok = Array.isArray(fot) ? fot : [{ maska: fot, ugol: 0 }];
  const shagi = opt.shagi || [0.86, 0.93, 1.07, 1.16];
  const prohodov = opt.prohodov || 3;
  const kopiya = els.map(e => ({ kind: e.kind, params: Object.assign({}, e.params) }));
  const ishod = kopiya.map(e => Object.assign({}, e.params));

  const ocenka = (nabor) => {
    const g = stroit(nabor);
    const s = sravnitVidy(spisok, g, 140, 170);
    if (g && g.dispose) g.dispose();
    return s ? s.iou : 0;
  };

  let luchshee = ocenka(kopiya), shagov = 0;
  const nachalo = luchshee;
  for (let p = 0; p < prohodov; p++) {
    let bylo = luchshee;
    for (let i = 0; i < kopiya.length; i++) {
      for (const klyuch of Object.keys(kopiya[i].params)) {
        if (!TYANEM.includes(klyuch)) continue;
        const bazoviy = kopiya[i].params[klyuch];
        if (typeof bazoviy !== 'number' || !isFinite(bazoviy) || bazoviy <= 0) continue;
        let luchshij = bazoviy;
        for (const k of shagi) {
          const v = Math.round(bazoviy * k * 100) / 100;
          const nizh = ishod[i][klyuch] * 0.45, verh = ishod[i][klyuch] * 2.2;
          if (v < Math.max(0.3, nizh) || v > verh) continue;
          kopiya[i].params[klyuch] = v;
          const o = ocenka(kopiya); shagov++;
          if (o > luchshee + 1e-4) { luchshee = o; luchshij = v; }
        }
        kopiya[i].params[klyuch] = luchshij;
      }
    }
    if (luchshee - bylo < 0.0015) break;
  }
  return { els: kopiya, bylo: nachalo, stalo: luchshee, shagov };
}
