// Примитивы из разбора + обмер силуэта -> рецепт из элементов ClipGen.
// Нейронка даёт структуру, обмер даёт числа, здесь они соединяются.
import { granicyTel } from './obmer.js';
import { ELEMENTY, vysota } from './elementy.js';

// примитив -> элемент конструктора. Ключ "тип|сечение", запасной "тип|*".
export const KARTA = {
  'disk|*':'head_disc', 'shlyapka_disk|*':'head_disc', 'shlyapka_kupol|*':'head_dome',
  'shlyapka_vint|*':'head_screw', 'plita|*':'head_rect', 'ploshchadka|*':'plate_hole',
  'shajba|*':'washer_flat', 'gajka|*':'nut_hex',
  'shejka|*':'stem_plain', 'shejka|razreznoe':'stem_split',
  'vorotnik|*':'cone_ring', 'poyasok|*':'cone_ring', 'yubka|*':'skirt',
  'katushka|*':'spool', 'vtulka|*':'bushing', 'rezba|*':'thread_out',
  'elochka|*':'stem_fin',
  'konus|*':'tip_cone', 'konus|krest_s_rebrami':'cone_ribs',
  'konus|srezannoe_ploskostyami':'cone_ribs', 'konus|mnogogrannik':'cone_ribs',
  'konus|razreznoe':'cone_split',
  'ostrie|*':'tip_cone', 'ostrie|krest_s_rebrami':'cone_ribs',
  'lapki|*':'blade_legs', 'lapki|razreznoe':'cone_split',
  'kryl_ya|*':'wings_up', 'kletka|*':'stem_cage', 'skoba|*':'legs_u',
  'hvostovik|*':'hvostovik', 'proushina|*':'ring_lug', 'prochee|*':'stem_plain',
};

// полы, чтобы подбор не сделал деталь непечатной
const POL = { t:1.0, t2:1.0, wall:0.8, wing:0.8, core:1.2, d:2.0, dLow:1.5, dCore:1.5,
  w:2.0, l:2.0, len:1.2, h:0.8, barbD:2.5, okno:1.0, span:1.0, spread:1.5,
  foot:1.0, dBore:1.0, bore:0.8, gap:0.3, s:3.0, dRec:1.0, dep:0.3, slot:1.0, slotW:1.0 };

const ok = (v, k) => Math.round(Math.max(v, POL[k] ?? 0.2) * 100) / 100;

export function elementDlya(tip, sech) {
  return KARTA[tip + '|' + sech] || KARTA[tip + '|*'] || 'stem_plain';
}

export function sobrat(tela, izmer, razmerMm) {
  const polosy = izmer.polosy;
  const shirMm = Math.max(1, +razmerMm || 16);
  const vysMm  = shirMm * izmer.vysotaKShirine;
  const doli = tela.map(t => Math.max(0.02, +t.dolyaVysoty || 0.1));
  const gran = granicyTel(polosy, doli);
  const els = [], zam = [];

  tela.forEach((t, i) => {
    const [a, b] = gran[i];
    const kus = polosy.slice(a, b);
    const verh = kus[0] ?? 0.5, niz = kus[kus.length-1] ?? 0.5;
    let mx = Math.max(...kus, 0.05);
    if (t.dolyaShiriny) mx = Math.min(mx, Math.max(+t.dolyaShiriny, 0.05) * 1.15);
    const D = mx * shirMm, Dv = verh * shirMm, Dn = niz * shirMm;
    const L = Math.max(0.02, (b - a) / polosy.length) * vysMm;
    const k = elementDlya(t.tip, t.sechenie);
    const reb = Math.max(0, t.rebra | 0), zub = Math.max(0, t.zubcov | 0);
    let p;

    switch (k) {
      case 'head_disc': case 'head_dome':
        p = { d: ok(D,'d'), t: ok(L,'t') }; break;
      case 'washer_flat':
        p = { d: ok(D,'d'), dBore: ok(D*0.35,'dBore'), t: ok(L,'t') }; break;
      case 'head_rect':
        p = { w: ok(D*0.5,'w'), l: ok(D,'l'), t: ok(L,'t') }; break;
      case 'head_screw':
        p = { d: ok(D,'d'), t: ok(L,'t'), drive:'torx' }; break;
      case 'plate_hole':
        p = { w: ok(D*0.7,'w'), l: ok(D,'l'), t: ok(L,'t'), okno: ok(D*0.3,'okno') }; break;
      case 'nut_hex':
        p = { s: ok(D,'s'), dBore: ok(D*0.55,'dBore'), h: ok(L,'h') }; break;
      case 'stem_plain':
        p = { d: ok(D,'d'), len: ok(L,'len') }; break;
      case 'stem_split':
        p = { d: ok(D,'d'), len: ok(L,'len'), legs: Math.max(2, reb||2),
              span: ok(D*0.6,'span'), wing: ok(D*0.25,'wing') }; break;
      case 'cone_ring': {
        let dv = Math.min(Dv, Dn), dn = Math.max(Dv, Dn);
        if (Dv > Dn) { const x = dv; dv = dn; dn = x; }
        p = { d: ok(dv,'d'), dLow: ok(dn,'dLow'), h: ok(L,'h'), t: ok(Math.max(1, L*0.45),'t') };
        break; }
      case 'skirt':
        p = { d: ok(D,'d'), t: ok(Math.max(0.9, L*0.4),'t'), h: ok(L,'h') }; break;
      case 'spool':
        p = { d: ok(D,'d'), dLow: ok(D*0.9,'dLow'), dCore: ok(D*0.45,'dCore'),
              t: ok(L*0.3,'t'), h: ok(L,'h') }; break;
      case 'bushing':
        p = { d: ok(D,'d'), dLow: ok(Dn,'dLow'), len: ok(L,'len'), wall: ok(D*0.15,'wall') }; break;
      case 'thread_out':
        p = { d: ok(D,'d'), len: ok(L,'len'), pitch: 1.25 }; break;
      case 'stem_fin': {
        const yadro = D * 0.55;
        p = { d: ok(yadro,'d'), len: ok(L,'len'), barbD: ok(D,'barbD'), n: Math.max(3, zub||6) };
        if (yadro < 4.6) zam.push('ёлочка: ядро ' + yadro.toFixed(1) + ' мм, лепестки могут слиться');
        break; }
      case 'cone_ribs':
        p = { d: ok(Dv,'d'), dLow: Math.max(0.4, +(Dn*0.15).toFixed(2)), len: ok(L,'len'),
              rebra: Math.max(3, reb||4), t: ok(D*0.24,'t'),
              core: t.sechenie === 'srezannoe_ploskostyami' ? 0.88
                  : t.sechenie === 'mnogogrannik' ? 0.95 : 0.68,
              plecho: 0.10, poyas: 0.83 };
        break;
      case 'cone_split':
        p = { d: ok(Dv,'d'), dLow: ok(Math.max(1.5, Dn*0.3),'dLow'), len: ok(L,'len'),
              bore: ok(D*0.35,'bore'), legs: Math.max(2, reb||2),
              gap: ok(D*0.12,'gap'), nasechki: 0 }; break;
      case 'tip_cone':
        p = { d: ok(D,'d'), len: ok(L,'len') }; break;
      case 'blade_legs':
        p = { w: ok(D,'w'), t: ok(D*0.2,'t'), len: ok(L,'len'), legs: Math.max(2, reb||2),
              wing: ok(D*0.2,'wing'), core: ok(D*0.35,'core') }; break;
      case 'wings_up':
        p = { w: ok(D*0.4,'w'), t: ok(D*0.15,'t'), h: ok(L,'h'),
              spread: ok(D,'spread'), legs: Math.max(2, reb||2) }; break;
      case 'stem_cage':
        p = { d: ok(D,'d'), len: ok(L,'len'), legs: Math.max(2, reb||4),
              gap: ok(D*0.12,'gap'), okno: ok(L*0.4,'okno'), wing: ok(D*0.15,'wing') }; break;
      case 'legs_u':
        p = { w: ok(D*0.35,'w'), t: ok(D*0.15,'t'), len: ok(L,'len'), span: ok(D,'span') }; break;
      case 'hvostovik':
        p = { d: ok(D*0.4,'d'), w: ok(D*0.4,'w'), t: ok(D*0.18,'t'), len: ok(L,'len'),
              spread: ok(D,'spread'), foot: ok(D*0.25,'foot'), legs: Math.max(2, reb||2) }; break;
      case 'ring_lug':
        p = { d: ok(D,'d'), dBore: ok(D*0.5,'dBore'), t: ok(L,'t'),
              w: ok(D*0.6,'w'), len: ok(L*2,'len') }; break;
      default:
        p = { d: ok(D,'d'), len: ok(L,'len') };
    }
    els.push({ kind: k, params: p, primitiv: t });
    if ((t.uverennost ?? 1) < 0.6)
      zam.push('тело ' + (i+1) + ' (' + t.tip + '/' + t.sechenie + '): низкая уверенность');
  });
  return { els, zam };
}

// Подгонка длины низа под опубликованную длину штока.
// Ширину трогать не надо: sobrat уже поставил самое широкое место равным
// заданному габариту, второй пересчёт только всё ломал.
export function podognat(els, katalog) {
  const zam = [];
  if (katalog.dlinaShtoka > 0) {
    const nizh = els.filter(e => ELEMENTY[e.kind]?.zona !== 'ГОЛОВА');
    const est = nizh.reduce((s, e) => s + vysota(e.kind, e.params), 0);
    if (est > 0.5) {
      const k = katalog.dlinaShtoka / est;
      if (k > 0.5 && k < 2.2) {
        nizh.forEach(e => { for (const key of ['len','h','t'])
          if (typeof e.params[key] === 'number')
            e.params[key] = Math.round(e.params[key]*k*100)/100; });
        zam.push('длина низа подтянута под ' + katalog.dlinaShtoka + ' мм (×' + k.toFixed(2) + ')');
      } else zam.push('длина штока ' + katalog.dlinaShtoka + ' мм расходится с фото больше чем вдвое — не применял');
    }
  }
  if (katalog.otverstie > 0) {
    const e = els.find(x => 'dBore' in x.params || 'bore' in x.params);
    if (e) { if ('dBore' in e.params) e.params.dBore = katalog.otverstie;
             else e.params.bore = katalog.otverstie;
             zam.push('отверстие поставлено Ø' + katalog.otverstie + ' мм по каталогу'); }
  }
  return zam;
}

export function summarno(els) {
  let h = 0, w = 0;
  for (const e of els) {
    h += vysota(e.kind, e.params);
    const p = e.params;
    w = Math.max(w, p.d||0, p.l||0, p.w||0, p.barbD||0, p.dLow||0, p.spread||0, p.span||0, p.s||0);
  }
  return { vysota: +h.toFixed(1), shirina: +w.toFixed(1) };
}
