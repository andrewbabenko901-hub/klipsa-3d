// Круглое сечение или плоское — по одному снимку.
//
// Силуэт про сечение не знает ничего: круглый стержень и плоская лопатка дают
// одинаковый вид спереди. Зато об этом знает СВЕТ. У круглого тела яркость
// поперёк идёт куполом: середина светлая, оба края тонут. У плоской грани
// яркость поперёк почти ровная и обрывается на кромке.
//
// Считается локально, без сети и без ключей. Это третий голос к сечению рядом
// с нейронками и вторым снимком, а не замена им: где света нет — молчит.

const N_TOCHEK = 7;   // столько точек поперёк детали пишем в обмер

/**
 * Поперечные профили яркости по каждой полосе.
 * Берутся только пиксели материала: фон и сквозные дырки в счёт не идут.
 * Значения нормируются на самый яркий пиксель детали, чтобы тёмный пластик
 * и светлый мерились одинаково.
 */
export function yarkostPoPolosam(px, metka, nom, W, H, ramka, vert, perevernut, POLOS) {
  const a0 = vert ? ramka.y0 : ramka.x0, a1 = vert ? ramka.y1 : ramka.x1;
  const b0 = vert ? ramka.x0 : ramka.y0, b1 = vert ? ramka.x1 : ramka.y1;
  const L = a1 - a0 + 1, B = b1 - b0 + 1;
  const ya = i => (px[i*4]*0.299 + px[i*4+1]*0.587 + px[i*4+2]*0.114) / 255;

  let mxDetali = 0.001;
  for (let p = a0; p <= a1; p++) for (let q = b0; q <= b1; q++) {
    const idx = vert ? (p*W + q) : (q*W + p);
    if (metka[idx] === nom) { const v = ya(idx); if (v > mxDetali) mxDetali = v; }
  }

  const out = [];
  for (let i = 0; i < POLOS; i++) {
    const p0 = a0 + Math.floor(L*i/POLOS);
    const p1 = a0 + Math.max(Math.floor(L*i/POLOS)+1, Math.floor(L*(i+1)/POLOS));
    // границы материала в этой полосе — профиль растягиваем именно на них
    let lo = 1e9, hi = -1;
    for (let p = p0; p < p1; p++) for (let q = 0; q < B; q++) {
      const idx = vert ? (p*W + b0 + q) : ((b0 + q)*W + p);
      if (metka[idx] === nom) { if (q < lo) lo = q; if (q > hi) hi = q; }
    }
    if (hi < lo + 3) { out.push(null); continue; }     // слишком узко, мерить нечего
    const stroka = [];
    for (let t = 0; t < N_TOCHEK; t++) {
      const q = Math.round(lo + (hi - lo) * t / (N_TOCHEK - 1));
      let s = 0, k = 0;
      for (let p = p0; p < p1; p++) {
        const idx = vert ? (p*W + b0 + q) : ((b0 + q)*W + p);
        if (metka[idx] === nom) { s += ya(idx); k++; }
      }
      stroka.push(k ? +(s/k/mxDetali).toFixed(3) : 0);
    }
    stroka.shirinaPx = hi - lo + 1;
    out.push(stroka);
  }
  if (perevernut) out.reverse();
  return out;
}

/**
 * Округлость куска по его поперечным профилям яркости.
 * 1 — уверенно круглое, 0 — уверенно плоское, 0.5 — сигнала нет.
 */
export function kruglostTela(izmer, a, b) {
  const vse = (izmer.yark || []).slice(a, b).filter(r => r && r.length === N_TOCHEK);
  if (vse.length < 2) return null;

  const n = N_TOCHEK, sr = new Array(n).fill(0);
  for (const r of vse) for (let i = 0; i < n; i++) sr[i] += r[i] / vse.length;
  const shirina = vse.reduce((s, r) => s + (r.shirinaPx || 0), 0) / vse.length;

  const mx = Math.max(...sr), mn = Math.min(...sr);
  const razmah = mx - mn;

  // Ровная яркость поперёк означает плоскую грань — но только если свет на
  // снимке вообще есть. Поэтому сравниваем перепад в куске с перепадом по всей
  // детали: на плоско залитой картинке молчим, на живом снимке отвечаем.
  const svetDetali = +(izmer.svetRazmah ?? 0);
  if (shirina < 10)
    return { okruglost: 0.5, uverennost: 0.1, razmah: +razmah.toFixed(3),
             pochemu: 'кусок слишком узкий на снимке' };
  if (svetDetali < 0.06)
    return { okruglost: 0.5, uverennost: 0.1, razmah: +razmah.toFixed(3), svetDetali,
             pochemu: 'на снимке нет светотени — по свету сечение не определить' };

  // Профиль растягиваем на его собственный размах: тогда наклон от неровного
  // света уходит в прямую, а купол остаётся куполом. Плоская грань под косым
  // светом даёт ровную наклонную линию, круглая — дугу.
  const norm = sr.map(v => (v - mn) / Math.max(razmah, 1e-6));
  const kray = (norm[0] + norm[n-1]) / 2;
  const centr = (norm[Math.floor(n/2)-1] + norm[Math.floor(n/2)] + norm[Math.floor(n/2)+1]) / 3;
  const kupol = centr - kray;

  // кривизна: подгонка параболой по методу наименьших квадратов
  let sx=0, sx2=0, sx3=0, sx4=0, sy=0, sxy=0, sx2y=0;
  for (let i = 0; i < n; i++) {
    const x = i/(n-1) - 0.5, y = norm[i];
    sx+=x; sx2+=x*x; sx3+=x*x*x; sx4+=x*x*x*x; sy+=y; sxy+=x*y; sx2y+=x*x*y;
  }
  const kv = reshit3([[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]], [sy, sxy, sx2y]);
  const krivizna = kv ? -kv[2] : 0;            // ветвями вниз — купол

  // блик: узкая яркая полоса внутри куска
  const porogBlika = mn + razmah*0.82;
  const yarkih = norm.filter((_, i) => sr[i] >= porogBlika).length;
  const blik = yarkih > 0 && yarkih <= Math.ceil(n*0.45) ? 1 : 0;

  // купол и кривизна — про круглое; их отсутствие при живом свете — про плоское
  const priznak = 0.55*kupol + 0.45*Math.max(-1, Math.min(1, krivizna/2.2)) + 0.04*blik;
  const o = Math.max(0, Math.min(1, priznak / 0.55));
  const uver = Math.max(0.15, Math.min(0.9,
    0.2 + Math.min(1, svetDetali/0.3)*0.45 + Math.min(1, shirina/60)*0.2));
  const dolyaSveta = razmah / Math.max(svetDetali, 1e-6);

  return {
    okruglost: +o.toFixed(3), uverennost: +uver.toFixed(2),
    kupol: +kupol.toFixed(3), krivizna: +krivizna.toFixed(3), blik,
    razmah: +razmah.toFixed(3), svetDetali, dolyaSveta: +dolyaSveta.toFixed(2),
    shirinaPx: Math.round(shirina),
    profil: norm.map(v => +v.toFixed(2)),
    pochemu: o > 0.62 ? 'яркость поперёк идёт куполом — тело круглое'
           : o < 0.38 ? 'яркость поперёк ровная, край резкий — тело плоское или гранёное'
                      : 'по свету не решается',
  };
}

// Маленькая система 3×3 методом Гаусса — для подгонки параболы.
function reshit3(m, v) {
  const A = m.map((r, i) => [...r, v[i]]);
  for (let i = 0; i < 3; i++) {
    let g = i;
    for (let k = i+1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[g][i])) g = k;
    if (Math.abs(A[g][i]) < 1e-12) return null;
    [A[i], A[g]] = [A[g], A[i]];
    for (let k = i+1; k < 3; k++) {
      const f = A[k][i]/A[i][i];
      for (let j = i; j < 4; j++) A[k][j] -= f*A[i][j];
    }
  }
  const x = [0,0,0];
  for (let i = 2; i >= 0; i--) {
    let s = A[i][3];
    for (let j = i+1; j < 3; j++) s -= A[i][j]*x[j];
    x[i] = s/A[i][i];
  }
  return x;
}

export { N_TOCHEK };
