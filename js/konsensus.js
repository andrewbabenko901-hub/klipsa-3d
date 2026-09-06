// Сведение нескольких разборов в один. Голосуют нейронки и наш алгоритм.
// Смысл: там, где источники согласны, доверяем; где разошлись — подсвечиваем
// и роняем уверенность, чтобы человек посмотрел глазами.

function otrezki(tela) {
  const s = tela.reduce((a,t) => a + Math.max(0.01, +t.dolyaVysoty || 0), 0) || 1;
  let nak = 0;
  return tela.map(t => {
    const d = Math.max(0.01, +t.dolyaVysoty || 0) / s;
    const o = [nak, nak + d]; nak += d; return o;
  });
}

const perekrytie = (a, b) => Math.max(0, Math.min(a[1],b[1]) - Math.max(a[0],b[0]));

function golos(znacheniya) {
  const schyot = new Map();
  for (const { v, ves } of znacheniya) {
    if (v === undefined || v === null || v === '') continue;
    schyot.set(v, (schyot.get(v) || 0) + ves);
  }
  if (!schyot.size) return { v: undefined, dolya: 0, varianty: [] };
  const vse = [...schyot.entries()].sort((a,b) => b[1]-a[1]);
  const summa = vse.reduce((a,b) => a + b[1], 0) || 1;
  return { v: vse[0][0], dolya: vse[0][1]/summa,
           varianty: vse.map(([v,w]) => ({ v, dolya: +(w/summa).toFixed(2) })) };
}

/**
 * varianty: [{ istochnik, tela, ves }]
 * Возвращает сведённый разбор плюс список расхождений.
 */
export function svesti(varianty, opornyj) {
  const zhivye = varianty.filter(v => v && v.tela && v.tela.length);
  if (!zhivye.length) return { tela: [], raznoglasiya: [], istochnikov: 0 };
  if (zhivye.length === 1)
    return { tela: zhivye[0].tela.map(t => ({ ...t, soglasie: 1 })), raznoglasiya: [], istochnikov: 1 };

  // опорный вариант: заданный, иначе с медианным числом тел и лучшей уверенностью
  let opora = zhivye.find(v => v.istochnik === opornyj);
  if (!opora) {
    const dliny = zhivye.map(v => v.tela.length).sort((a,b) => a-b);
    const med = dliny[Math.floor(dliny.length/2)];
    const podhodyat = zhivye.filter(v => v.tela.length === med);
    opora = (podhodyat.length ? podhodyat : zhivye)
      .reduce((a,b) => srednyaya(a) >= srednyaya(b) ? a : b);
  }

  const oporaOtr = otrezki(opora.tela);
  const chuzhie = zhivye.filter(v => v !== opora).map(v => ({ v, otr: otrezki(v.tela) }));
  const tela = [], raznoglasiya = [];

  opora.tela.forEach((t, i) => {
    const sobrano = [{ ist: opora.istochnik, t, ves: opora.ves ?? 1 }];
    for (const { v, otr } of chuzhie) {
      let luchshiy = -1, luchshee = 0;
      otr.forEach((o, j) => { const p = perekrytie(oporaOtr[i], o); if (p > luchshee) { luchshee = p; luchshiy = j; } });
      if (luchshiy >= 0 && luchshee > 0.15 * (oporaOtr[i][1]-oporaOtr[i][0]))
        sobrano.push({ ist: v.istochnik, t: v.tela[luchshiy], ves: v.ves ?? 1 });
    }
    const gTip  = golos(sobrano.map(s => ({ v: s.t.tip, ves: s.ves })));
    const gSech = golos(sobrano.map(s => ({ v: s.t.sechenie, ves: s.ves })));
    const gReb  = golos(sobrano.map(s => ({ v: s.t.rebra|0, ves: s.ves })));
    const gZub  = golos(sobrano.map(s => ({ v: s.t.zubcov|0, ves: s.ves })));
    const gNapr = golos(sobrano.map(s => ({ v: s.t.napravlenieZubcov, ves: s.ves })));
    const sredn = k => {
      let s = 0, w = 0;
      for (const x of sobrano) { const v = +x.t[k]; if (isFinite(v)) { s += v*x.ves; w += x.ves; } }
      return w ? +(s/w).toFixed(3) : 0;
    };
    const soglasie = (gTip.dolya + gSech.dolya + gReb.dolya) / 3;

    tela.push({
      nomer: i+1,
      tip: gTip.v ?? t.tip,
      sechenie: gSech.v ?? t.sechenie,
      rebra: gReb.v ?? 0,
      zubcov: gZub.v ?? 0,
      napravlenieZubcov: gNapr.v ?? 'net',
      dolyaVysoty: sredn('dolyaVysoty'),
      dolyaShiriny: sredn('dolyaShiriny'),
      suzhaetsya: t.suzhaetsya || 'net',
      opisanie: t.opisanie || '',
      uverennost: +Math.min(0.99, soglasie * (sredn('uverennost') || 0.7) * 1.15).toFixed(2),
      soglasie: +soglasie.toFixed(2),
      istochnik: sobrano.map(s => s.ist).join(' + '),
      golosa: { tip:gTip.varianty, sechenie:gSech.varianty, rebra:gReb.varianty, zubcov:gZub.varianty },
    });

    for (const [pole, g] of [['тип',gTip], ['сечение',gSech], ['рёбра',gReb], ['зубцы',gZub]])
      if (g.dolya < 0.99 && g.varianty.length > 1)
        raznoglasiya.push({ telo: i+1, pole,
          varianty: g.varianty.map(x => x.v + ' (' + Math.round(x.dolya*100) + '%)').join(', ') });
  });

  const drugoeChislo = zhivye.filter(v => v.tela.length !== opora.tela.length);
  for (const v of drugoeChislo)
    raznoglasiya.push({ telo: 0, pole:'число тел',
      varianty: v.istochnik + ' насчитал ' + v.tela.length + ', а взято ' + opora.tela.length });

  return { tela, raznoglasiya, istochnikov: zhivye.length, opora: opora.istochnik };
}

function srednyaya(v) {
  const t = v.tela || [];
  return t.length ? t.reduce((a,b) => a + (+b.uverennost || 0.7), 0) / t.length : 0;
}

// Короткая сводка для показа: чем разошлись источники
export function svodka(varianty) {
  return varianty.filter(v => v && v.tela).map(v => ({
    istochnik: v.istochnik,
    model: v.model || '',
    tel: v.tela.length,
    sostav: v.tela.map(t => t.tip).join(' + '),
    secheniya: [...new Set(v.tela.map(t => t.sechenie))].join(', '),
    uverennost: +(v.uverennost ?? srednyaya(v)).toFixed(2),
    sekund: v.sekund ?? null,
    iou: v.iou ?? null,
    sboj: v.sboj || null,
  }));
}
