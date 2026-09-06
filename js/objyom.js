// Объём из фотографии: картинка -> 3D-меш -> недостающие виды.
//
// Зачем. Из одного вида боковой не следует: круглый стержень и плоская лопатка
// дают одинаковый силуэт спереди. Сети вида image-to-3D (TRELLIS, TripoSR,
// Hunyuan3D) достраивают объём — и это тоже догадка, но выданная ГЕОМЕТРИЕЙ,
// а не рисунком. Значит недостающие виды мы снимем с неё сами, ортогонально,
// и никакой художник не подтянет пропорции «как красивее».
//
// ВАЖНО. Полученный меш НЕ становится результатом. Он живёт ровно до того
// момента, как с него сняты силуэты, и дальше выбрасывается: деталь всё равно
// собирается из наших сорока параметрических элементов по силуэтам. Поэтому
// правило проекта — никаких чужих 3D-моделей в выдаче — остаётся в силе.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { siluetGeometrii, sravnit } from './siluet.js';

export const POSTAVSHCHIKI_OBJYOMA = {
  fal: {
    imya: 'fal.ai — TRELLIS, TripoSR, Hunyuan3D',
    gdeKlyuch: 'https://fal.ai/dashboard/keys',
    adresPoUmolchaniyu: 'https://fal.run',
    modeli: ['fal-ai/trellis-2', 'fal-ai/trellis', 'fal-ai/triposr', 'fal-ai/hunyuan3d-v21'],
    podskazka: 'Ключ fal нельзя держать в браузере открытым — они сами это пишут. ' +
      'Адрес ставь свой прокси, конфиг такой же, как для NVIDIA.',
    zagolovki: k => ({ 'Content-Type':'application/json', Authorization: 'Key ' + k }),
    telo: url => (url.length > 1 ? { image_urls: url } : { image_url: url[0] }),
    glb: j => j?.model_glb?.url || j?.model_mesh?.url || j?.glb?.url ||
              j?.model_glb || j?.mesh?.url || null,
  },
  svoj: {
    imya: 'Свой сервис объёма',
    gdeKlyuch: '',
    adresPoUmolchaniyu: '',
    modeli: [],
    podskazka: 'Любой адрес, который на POST с картинкой отвечает ссылкой на GLB. ' +
      'Ответ ищем в полях model_glb, model_mesh, glb или mesh.',
    zagolovki: k => ({ 'Content-Type':'application/json', Authorization: 'Bearer ' + k }),
    telo: url => (url.length > 1 ? { image_urls: url } : { image_url: url[0] }),
    glb: j => j?.model_glb?.url || j?.model_mesh?.url || j?.glb?.url ||
              j?.model_glb || j?.mesh?.url || null,
  },
};

const baza = a => String(a || '').trim().replace(/\/+$/, '');

/** Запрос объёма. Возвращает ссылку на GLB. */
export async function poluchitObjyom({ post, klyuch, model, adres, kartinki }) {
  const p = POSTAVSHCHIKI_OBJYOMA[post];
  if (!p) throw new Error('неизвестный сервис объёма: ' + post);
  if (!klyuch) throw new Error(p.imya + ': нет ключа');
  const b = baza(adres || p.adresPoUmolchaniyu);
  if (!b) throw new Error(p.imya + ': не задан адрес');
  const url = b + '/' + String(model || p.modeli[0]).replace(/^\/+/, '');
  const t0 = performance.now();
  let r;
  try {
    r = await fetch(url, { method:'POST', headers: p.zagolovki(klyuch),
                           body: JSON.stringify(p.telo(kartinki)) });
  } catch (e) {
    throw new Error('до сервиса объёма не достучаться (' + e.message + '). ' +
      'Прямые адреса из браузера обычно закрыты — нужен свой прокси.');
  }
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error('сервис объёма ответил ' + r.status + ': ' +
    (j?.detail || j?.error?.message || t.slice(0, 200)));
  const glb = p.glb(j);
  if (!glb) throw new Error('в ответе нет ссылки на GLB: ' + t.slice(0, 200));
  return { glb, sekund: +((performance.now()-t0)/1000).toFixed(1), otvet: j };
}

/** Загрузить GLB и слить всё в одну геометрию, только позиции. */
export async function zagruzitGeometriyu(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const gltf = await new Promise((res, rej) =>
    new GLTFLoader().parse(buf, '', res, rej));
  const kuski = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const t = new THREE.BufferGeometry();
    t.setAttribute('position', g.getAttribute('position').clone());
    t.applyMatrix4(o.matrixWorld);
    kuski.push(t);
  });
  if (!kuski.length) throw new Error('в GLB нет ни одной сетки');
  const g = kuski.length === 1 ? kuski[0] : mergeGeometries(kuski, false);
  g.computeVertexNormals();
  return g;
}

/**
 * Поставить меш «как деталь»: главная ось вертикально, широкий конец вверх.
 * Сеть отдаёт объект в своей системе координат, поэтому ось ищем по главным
 * компонентам вершин, а сторону — по тому, где сечение шире.
 */
export function vypryamit(geom) {
  const p = geom.getAttribute('position'), n = p.count;
  let cx=0, cy=0, cz=0;
  for (let i = 0; i < n; i++) { cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
  cx/=n; cy/=n; cz/=n;
  // ковариация
  let xx=0,xy=0,xz=0,yy=0,yz=0,zz=0;
  for (let i = 0; i < n; i++) {
    const x=p.getX(i)-cx, y=p.getY(i)-cy, z=p.getZ(i)-cz;
    xx+=x*x; xy+=x*y; xz+=x*z; yy+=y*y; yz+=y*z; zz+=z*z;
  }
  // главный вектор степенным методом
  let v = new THREE.Vector3(1, 1, 1).normalize();
  for (let k = 0; k < 60; k++) {
    const nx = xx*v.x + xy*v.y + xz*v.z;
    const ny = xy*v.x + yy*v.y + yz*v.z;
    const nz = xz*v.x + yz*v.y + zz*v.z;
    const d = Math.hypot(nx, ny, nz) || 1;
    v.set(nx/d, ny/d, nz/d);
  }
  const g = geom.clone();
  g.translate(-cx, -cy, -cz);
  const q = new THREE.Quaternion().setFromUnitVectors(v, new THREE.Vector3(0, 1, 0));
  g.applyQuaternion(q);
  g.computeBoundingBox();
  // широкий конец вверх: сравниваем разброс поперёк в верхней и нижней трети
  const bb = g.boundingBox, h = bb.max.y - bb.min.y;
  const pp = g.getAttribute('position');
  let verh = 0, niz = 0;
  for (let i = 0; i < pp.count; i++) {
    const y = pp.getY(i), r = Math.hypot(pp.getX(i), pp.getZ(i));
    if (y > bb.max.y - h/3) verh = Math.max(verh, r);
    if (y < bb.min.y + h/3) niz = Math.max(niz, r);
  }
  if (niz > verh) { g.rotateX(Math.PI); g.computeBoundingBox(); }

  // Крен вокруг найденной оси PCA не задаёт: плоская шляпка может встать
  // по диагонали, и вид сверху перестанет быть похож на сечение. Поэтому
  // вторым шагом разворачиваем сечение так, чтобы его длинная сторона легла
  // на X. Для круглого тела разворот произволен и ни на что не влияет.
  // Ковариация здесь не годится: круглые шейка и конус дают на порядок больше
  // вершин, чем плоская шляпка, и направление тонет в них. Берём поворот, при
  // котором прямоугольник вокруг сечения самый тесный — у гранёной детали он
  // совпадает с её гранями, у круглой всё равно какой.
  const p2 = g.getAttribute('position');
  let luchUgol = 0, luchPl = Infinity;
  for (let d = 0; d < 90; d++) {
    const a = d * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p2.count; i++) {
      const x = p2.getX(i), z = p2.getZ(i);
      const u = x*co + z*si, w2 = -x*si + z*co;
      if (u < x0) x0 = u; if (u > x1) x1 = u;
      if (w2 < z0) z0 = w2; if (w2 > z1) z1 = w2;
    }
    const pl = (x1-x0) * (z1-z0);
    if (pl < luchPl) { luchPl = pl; luchUgol = a; }
  }
  if (luchUgol) { g.rotateY(-luchUgol); g.computeBoundingBox(); }
  // длинную сторону сечения кладём на X
  const bb2 = g.boundingBox;
  if ((bb2.max.z - bb2.min.z) > (bb2.max.x - bb2.min.x)) { g.rotateY(Math.PI/2); g.computeBoundingBox(); }
  return g;
}

/**
 * Подобрать поворот вокруг вертикали так, чтобы вид спереди лёг на снимок,
 * и вернуть силуэты нужных видов. Заодно это и есть проверка: если ни один
 * поворот не даёт совпадения, объём построен не по нашей детали.
 */
export function vidyIzObjyoma(geom, maskaFoto, SW = 260) {
  const varianty = [0, 45, 90, 135];
  let luchshee = -1, luchUgol = 0, luchSil = null;
  for (const u of varianty) {
    const sil = siluetGeometrii(geom, SW, u);
    const s = sravnit(maskaFoto, sil, 180);
    if (s && s.iou > luchshee) { luchshee = s.iou; luchUgol = u; luchSil = sil; }
  }
  return {
    iou: luchshee, ugol: luchUgol,
    speredi: luchSil,
    sboku: siluetGeometrii(geom, SW, luchUgol + 90),
    sverhu: siluetGeometrii(geom, SW, luchUgol, true),
  };
}

/** Насколько контур сечения круглый: 1 — круг, меньше — угловатое. */
export function okruglostKontura(maska) {
  if (!maska || maska.W < 4) return null;
  const { d, W, H } = maska;
  let ploshchad = 0, perimetr = 0;
  const est = (x, y) => (x>=0 && x<W && y>=0 && y<H) ? d[y*W+x] : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!d[y*W+x]) continue;
    ploshchad++;
    if (!est(x-1,y) || !est(x+1,y) || !est(x,y-1) || !est(x,y+1)) perimetr++;
  }
  if (perimetr < 8) return null;
  // периметр по пикселям систематически длиннее гладкого, отсюда поправка
  const p = perimetr * 0.95;
  return +Math.min(1, (4*Math.PI*ploshchad) / (p*p)).toFixed(3);
}
