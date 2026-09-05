// Мелкие помощники геометрии. Всё строится сложением тел, вычитаний нет.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SEG = 64;

export function slit(g) { return g; }

// Цилиндр или усечённый конус. y — координата ВЕРХА, тело растёт вниз.
export function cyl(rVerh, rNiz, h, y = 0, seg = SEG, open = false) {
  const g = new THREE.CylinderGeometry(rVerh, rNiz, h, seg, 1, open);
  g.translate(0, y - h / 2, 0);
  return g;
}

// Коробка, верх на y.
export function box(w, h, d, y = 0, x = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y - h / 2, z);
  return g;
}

// Труба: наружный и внутренний радиус.
export function tube(rOut, rIn, h, y = 0, seg = SEG) {
  return lathe([[rIn, 0], [rOut, 0], [rOut, h], [rIn, h]], y, seg, true);
}

// Тело вращения. profile — массив [r, глубина_вниз_от_y].
export function lathe(profile, y = 0, seg = SEG, zamknut = false) {
  const pts = profile.map(([r, d]) => new THREE.Vector2(Math.max(r, 1e-4), -d));
  if (zamknut) pts.push(pts[0].clone());
  const g = new THREE.LatheGeometry(pts, seg);
  g.translate(0, y, 0);
  return g;
}

// Многогранная призма (правильный n-угольник в сечении).
export function prizma(r, h, n, y = 0, povorot = 0) {
  const g = new THREE.CylinderGeometry(r, r, h, n);
  g.rotateY(povorot);
  g.translate(0, y - h / 2, 0);
  return g;
}

// Сектор конуса — лепесток разрезного пистона. Строится напрямую, без вычитаний.
export function sektor(rV, rN, h, a0, a1, y = 0, shag = 10) {
  const n = Math.max(2, Math.round((a1 - a0) / (Math.PI / 36)));
  const poz = [], ind = [];
  const push = (x, yy, z) => { poz.push(x, yy, z); return poz.length / 3 - 1; };
  const verh = [], niz = [], vC = push(0, y, 0), nC = push(0, y - h, 0);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    verh.push(push(rV * Math.cos(a), y, rV * Math.sin(a)));
    niz.push(push(rN * Math.cos(a), y - h, rN * Math.sin(a)));
  }
  for (let i = 0; i < n; i++) {
    ind.push(vC, verh[i + 1], verh[i]);
    ind.push(nC, niz[i], niz[i + 1]);
    ind.push(verh[i], verh[i + 1], niz[i + 1]);
    ind.push(verh[i], niz[i + 1], niz[i]);
  }
  // боковые щёки
  ind.push(vC, verh[0], niz[0]); ind.push(vC, niz[0], nC);
  ind.push(vC, niz[n], verh[n]); ind.push(vC, nC, niz[n]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

// Тело переменного сечения: r(угол, доля_длины). Так строятся рёбра и срезы.
export function sechenie(rFn, h, y = 0, seg = 192, ryadov = 48) {
  const poz = [], ind = [];
  const kol = [];
  for (let i = 0; i <= ryadov; i++) {
    const u = i / ryadov, ring = [];
    for (let j = 0; j < seg; j++) {
      const a = 2 * Math.PI * j / seg, r = Math.max(rFn(a, u), 1e-4);
      poz.push(r * Math.sin(a), y - h * u, r * Math.cos(a));
      ring.push(poz.length / 3 - 1);
    }
    kol.push(ring);
  }
  for (let i = 0; i < ryadov; i++)
    for (let j = 0; j < seg; j++) {
      const k = (j + 1) % seg;
      ind.push(kol[i][j], kol[i + 1][j], kol[i + 1][k]);
      ind.push(kol[i][j], kol[i + 1][k], kol[i][k]);
    }
  poz.push(0, y, 0); const cV = poz.length / 3 - 1;
  poz.push(0, y - h, 0); const cN = poz.length / 3 - 1;
  for (let j = 0; j < seg; j++) {
    const k = (j + 1) % seg;
    ind.push(cV, kol[0][k], kol[0][j]);
    ind.push(cN, kol[ryadov][j], kol[ryadov][k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

// Приводим все тела к одному набору атрибутов, иначе слияние падает:
// у цилиндра есть uv, у нашего сечения нет.
function rovno(g) {
  const p = g.index ? g.toNonIndexed() : g;
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', p.getAttribute('position').clone());
  o.computeVertexNormals();
  return o;
}

export function slozhit(list) {
  const g = (list || []).filter(x => x && x.getAttribute && x.getAttribute('position'));
  if (!g.length) return new THREE.BufferGeometry();
  if (g.length === 1) return rovno(g[0]);
  const m = mergeGeometries(g.map(rovno), false);
  return m || rovno(g[0]);
}

export function povernut(g, ry) { g.rotateY(ry); return g; }
