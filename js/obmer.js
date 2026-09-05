// Обмер силуэта прямо в браузере. Даёт точные пропорции без всякого API.
// Три ловушки учтены: фон ищется заливкой от рамки, тонкие рамки и подписи
// отбрасываются, ось выбирается по асимметрии профиля.
export const POLOS = 40;

export function obmerit(img, opt = {}) {
  const S = 320;
  const c = document.createElement('canvas');
  const k = Math.min(S / img.width, S / img.height, 1);
  c.width = Math.max(8, Math.round(img.width * k));
  c.height = Math.max(8, Math.round(img.height * k));
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, c.width, c.height);
  const d = cx.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height, N = W * H;

  const belo = new Uint8Array(N);
  const detal = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = d[i*4], g = d[i*4+1], b = d[i*4+2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    belo[i] = (mn >= 232 && mx - mn <= 18) ? 1 : 0;
    let est = belo[i] ? 0 : 1;
    if (est && opt.bezPometok && r > 130 && r > g * 1.8 && r > b * 1.8) est = 0;
    detal[i] = est;
  }
  // фон = белое, связное с рамкой кадра
  const fon = new Uint8Array(N), st = [];
  const kin = i => { if (belo[i] && !fon[i]) { fon[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { kin(x); kin((H-1)*W + x); }
  for (let y = 0; y < H; y++) { kin(y*W); kin(y*W + W-1); }
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i - x) / W;
    if (x > 0) kin(i-1); if (x < W-1) kin(i+1);
    if (y > 0) kin(i-W); if (y < H-1) kin(i+W);
  }
  for (let i = 0; i < N; i++) if (fon[i]) detal[i] = 0;

  // связные компоненты
  const metka = new Int32Array(N); let nom = 0; const komp = [];
  for (let s = 0; s < N; s++) {
    if (!detal[s] || metka[s]) continue;
    nom++; let k = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    const q = [s]; metka[s] = nom;
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i - x) / W; k++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0   && detal[i-1] && !metka[i-1]) { metka[i-1] = nom; q.push(i-1); }
      if (x < W-1 && detal[i+1] && !metka[i+1]) { metka[i+1] = nom; q.push(i+1); }
      if (y > 0   && detal[i-W] && !metka[i-W]) { metka[i-W] = nom; q.push(i-W); }
      if (y < H-1 && detal[i+W] && !metka[i+W]) { metka[i+W] = nom; q.push(i+W); }
    }
    if (k >= 120) komp.push({ nom, k, x0, x1, y0, y1,
      zap: k / ((x1-x0+1) * (y1-y0+1)),
      kraya: (y0 <= 1) + (x0 <= 1) + (y1 >= H-2) + (x1 >= W-2) });
  }
  if (!komp.length) throw new Error('не нашёл деталь на снимке');

  let god = komp.filter(c2 =>
    c2.zap >= 0.15 &&
    !((c2.x1-c2.x0+1) > 0.94*W && (c2.y1-c2.y0+1) > 0.94*H && c2.zap < 0.5) &&
    !(c2.kraya >= 3 && c2.zap < 0.55));
  if (!god.length) god = [komp.reduce((a, b) => a.k >= b.k ? a : b)];
  const krupno = Math.max(...god.map(c2 => c2.k));
  god = god.filter(c2 => c2.k >= 0.30 * krupno);
  const vyb = god.reduce((a, b) => a.zap <= b.zap ? a : b);

  const est = (x, y) => metka[y*W + x] === vyb.nom;
  const polosy = (vert) => {
    const a0 = vert ? vyb.y0 : vyb.x0, a1 = vert ? vyb.y1 : vyb.x1;
    const L = a1 - a0 + 1, out = [];
    for (let i = 0; i < POLOS; i++) {
      const p0 = a0 + Math.floor(L*i/POLOS), p1 = a0 + Math.max(Math.floor(L*i/POLOS)+1, Math.floor(L*(i+1)/POLOS));
      let lo = 1e9, hi = -1;
      for (let p = p0; p < p1; p++)
        for (let q = (vert ? vyb.x0 : vyb.y0); q <= (vert ? vyb.x1 : vyb.y1); q++) {
          const on = vert ? est(q, p) : est(p, q);
          if (on) { if (q < lo) lo = q; if (q > hi) hi = q; }
        }
      out.push(hi >= 0 ? hi - lo + 1 : 0);
    }
    return out;
  };
  const asim = r => { const mx = Math.max(...r) || 1; let s2 = 0;
    for (let i = 0; i < POLOS/2; i++) s2 += Math.abs(r[i] - r[POLOS-1-i]);
    return s2 / (mx * POLOS/2); };

  const v = polosy(true), g = polosy(false);
  const vert = asim(v) >= asim(g);
  let r = vert ? v : g;
  const sum = (a, b, c2) => a.slice(b, c2).reduce((x, y) => x + y, 0);
  if (sum(r, 0, POLOS/2) < sum(r, POLOS/2, POLOS)) r = r.slice().reverse();
  const mx = Math.max(...r) || 1;
  const shir = vert ? (vyb.x1-vyb.x0+1) : (vyb.y1-vyb.y0+1);
  const vys  = vert ? (vyb.y1-vyb.y0+1) : (vyb.x1-vyb.x0+1);

  return {
    os: vert ? 'вертикально' : 'горизонтально',
    shirinaPx: shir, vysotaPx: vys,
    vysotaKShirine: +(vys / Math.max(1, shir)).toFixed(4),
    zapolnennost: +vyb.zap.toFixed(4),
    polosy: r.map(x => +(x / mx).toFixed(4)),
  };
}

// Раскладываем 40 полос по телам согласно долям высоты.
export function granicyTel(polosy, doli) {
  const s = doli.reduce((a, b) => a + b, 0) || 1;
  const kraya = [0]; let nak = 0;
  for (const d of doli) { nak += d / s; kraya.push(Math.min(polosy.length, Math.round(nak * polosy.length))); }
  return doli.map((_, i) => [kraya[i], Math.max(kraya[i] + 1, kraya[i+1])]);
}

// Рисуем профиль полосами — понятная картинка вместо таблицы чисел.
export function narisovatProfil(cv, polosy) {
  const cx = cv.getContext('2d'), W = cv.width, H = cv.height;
  cx.clearRect(0, 0, W, H);
  cx.fillStyle = '#122019'; cx.fillRect(0, 0, W, H);
  const h = H / polosy.length;
  cx.fillStyle = '#3fbf7f';
  polosy.forEach((v, i) => {
    const w = Math.max(1, v * W * 0.9);
    cx.fillRect((W - w) / 2, i * h, w, Math.max(1, h - 0.6));
  });
}
