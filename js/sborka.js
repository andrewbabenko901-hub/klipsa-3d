// Примитивы из разбора + обмер силуэта -> рецепт из элементов ClipGen.
// Нейронка даёт структуру, обмер даёт числа, здесь они соединяются.
import { granicyTel, meriTelo } from './obmer.js';
import { ELEMENTY, vysota } from './elementy.js';

// примитив -> элемент конструктора. Ключ "тип|сечение", запасной "тип|*".
export const KARTA = {
  'disk|*':'head_disc', 'shlyapka_disk|*':'head_disc', 'shlyapka_kupol|*':'head_dome',
  // сечение — не украшение: оно выбирает другой элемент, а не только подпись
  'disk|pryamougolnoe':'head_rect', 'shlyapka_disk|pryamougolnoe':'head_rect',
  'shlyapka_kupol|pryamougolnoe':'head_rect', 'disk|mnogogrannik':'nut_hex',
  'shlyapka_disk|mnogogrannik':'nut_hex', 'disk|trubchatoe':'washer_flat',
  'shlyapka_disk|trubchatoe':'washer_flat', 'plita|pryamougolnoe':'head_rect',
  'shejka|trubchatoe':'bushing', 'vorotnik|trubchatoe':'bushing',
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

/**
 * Масштаб: миллиметры берутся от того, что известно, а не «16 мм всем».
 * Раньше при пустом поле габарита каждая деталь строилась шириной 16 мм —
 * от этого разные клипсы выходили одного размера.
 */
export function masshtab(katalog, izmer, tela) {
  if (katalog.shirinaMm > 0)
    return { mm: +katalog.shirinaMm, otkuda: 'габарит ' + katalog.shirinaMm + ' мм — каталог' };

  if (katalog.otverstie > 0 && izmer && izmer.otverstie && izmer.otverstie.dolyaD > 0.05)
    return { mm: +(katalog.otverstie / izmer.otverstie.dolyaD).toFixed(2),
             otkuda: 'масштаб от отверстия Ø' + katalog.otverstie +
                     ' мм: на снимке оно ' + Math.round(izmer.otverstie.dolyaD*100) + '% ширины' };

  if (katalog.dlinaShtoka > 0 && izmer && izmer.vysotaKShirine > 0 && tela && tela.length) {
    const nizDolya = tela.reduce((s2, t) =>
      s2 + (ELEMENTY[elementDlya(t.tip, t.sechenie)]?.zona === 'ГОЛОВА'
            ? 0 : Math.max(0.02, +t.dolyaVysoty || 0.1)), 0);
    const vsego = tela.reduce((s2, t) => s2 + Math.max(0.02, +t.dolyaVysoty || 0.1), 0) || 1;
    const dolya = nizDolya / vsego;
    if (dolya > 0.08)
      return { mm: +(katalog.dlinaShtoka / (dolya * izmer.vysotaKShirine)).toFixed(2),
               otkuda: 'масштаб от длины штока ' + katalog.dlinaShtoka +
                       ' мм: на снимке низ занимает ' + Math.round(dolya*100) + '% высоты' };
  }
  return { mm: 16, otkuda: 'ни одного размера не задано — принят габарит 16 мм' };
}

/**
 * Примитивы + обмер -> рецепт в миллиметрах.
 *
 * Главное правило: каждое число, которое ВИДНО на силуэте, берётся из полос
 * этого куска — верх, низ, самое широкое, самое узкое, гребни и впадины ряби,
 * просветы, отверстие. Никаких «сердечник = 0.55 диаметра».
 * Всё, чего на одном виде не видно (глубина прямоугольной головы, толщина
 * стенки, толщина ребра), помечается как принятое и уходит в «Додумано».
 */
// Насколько сплющить круглый элемент по глубине, если второго вида нет,
// а сечение названо. Это допущение, и оно так и подписано.
const SZHATIE_PO_SECHENIYU = { oval: 0.62, pryamougolnoe: 0.62, srezannoe_ploskostyami: 0.82 };

const med = a => { if (!a.length) return 1; const q = a.slice().sort((x,y)=>x-y);
  return q.length % 2 ? q[(q.length-1)/2] : (q[q.length/2-1] + q[q.length/2])/2; };

export function sobrat(tela, izmer, razmerMm, vidy) {
  const shirMm = Math.max(1, +razmerMm || 16);
  const vysMm  = shirMm * (izmer.vysotaKShirine || 1);
  const doli = tela.map(t => Math.max(0.02, +t.dolyaVysoty || 0.1));
  const gran = granicyTel(izmer.polosy, doli);
  const els = [], zam = [], prinyato = [];
  const dopusk = tekst => { if (!prinyato.includes(tekst)) prinyato.push(tekst); };

  tela.forEach((t, i) => {
    const [a, b] = gran[i];
    const M = meriTelo(izmer, a, b);

    // Ширину берём с профиля, а не с «доли ширины» из ответа нейронки:
    // раньше её потолок резал замер верха и низа куска, и воротник под шляпкой
    // становился уже, чем он есть. Доля нейронки годится только как проверка.
    const mm = v => Math.round(v * shirMm * 100) / 100;
    if (t.dolyaShiriny && M.max > +t.dolyaShiriny * 1.45)
      zam.push('тело ' + (i+1) + ': на снимке шире, чем сказал источник (' +
               Math.round(M.max*100) + '% против ' + Math.round(t.dolyaShiriny*100) + '%) — взят замер');

    const D    = mm(M.max);        // самое широкое место куска
    const Dv   = mm(M.verh);       // ширина вверху куска
    const Dn   = mm(M.niz);        // ширина внизу куска
    const Dsr  = mm(M.sredn);      // средняя по куску
    const Dmin = mm(M.min);        // самое узкое место
    const Dgr  = mm(M.grebni);     // средний гребень ряби (лепесток ёлочки, фланец)
    const Dvp  = mm(M.vpadina);    // средняя впадина ряби (ядро ёлочки, талия)
    const L    = Math.max(0.02, M.dolyaVysoty) * vysMm;
    const dyra = M.otverstie ? mm(M.otverstie.dolyaD) : 0;
    const zazM = M.prosvet > 0.015 ? mm(M.prosvet) : 0;   // вся пустота поперёк
    const nog  = Math.max(2, (t.rebra | 0) || M.kuskov || 2);
    const zaz  = zazM ? Math.max(0.3, zazM / nog) : 0;    // на один просвет

    const zub = Math.max(0, t.zubcov | 0);
    const nomer = 'тело ' + (i+1);

    // ---- сечение: тело вращения или нет ----
    // Второй снимок даёт отношение «ширина сбоку / ширина спереди» на каждой
    // полосе. Единица — тело вращения; всё остальное надо сплющить по глубине.
    let szhatie = 1, sechenie = t.sechenie, otkudaSech = '';
    if (vidy && vidy.otnoshenie && vidy.otnoshenie.length) {
      const o = med(vidy.otnoshenie.slice(a, b).filter(v => v > 0));
      if (isFinite(o) && Math.abs(o - 1) >= 0.12) {
        szhatie = Math.max(0.2, Math.min(5, o));
        if (!sechenie || sechenie === 'krugloe') sechenie = 'oval';
        otkudaSech = 'по двум видам: сбоку в ' + o.toFixed(2) + ' раза ' +
                     (o < 1 ? 'уже' : 'шире') + ', чем спереди';
      } else otkudaSech = 'по двум видам: сечение круглое';
    } else {
      // Второго снимка нет — спрашиваем свет. У круглого тела яркость поперёк
      // идёт куполом, у плоской грани ровной наклонной линией. Это третий
      // голос: он говорит «круглое или плоское», но не насколько плоское.
      const kr = M.kruglost;
      // Светотень нельзя спрашивать про что попало.
      //
      // Диск, воротник, поясок, юбка, шайба — это кольца: сбоку видно тонкую
      // полоску, и яркость поперёк неё ровная просто потому, что смотреть не
      // на что. Свет тут отвечает «плоское» всегда, а элемент подменялся на
      // прямоугольный брусок — круглая клипса превращалась в фонарь.
      // Поэтому: кольцевым телам светотень не судья, а остальным верим только
      // если тело достаточно высокое, чтобы на нём вообще было видно сечение.
      const KOLCEVYE = ['disk','shlyapka_disk','vorotnik','poyasok','yubka','shajba','shejka'];
      const kolco = KOLCEVYE.includes(t.tip);
      const vysokoe = (M.dolyaVysoty || 0) >= 0.12;
      if (kr && kr.uverennost >= 0.5 && (!sechenie || sechenie === 'krugloe')) {
        if (kr.okruglost < 0.38 && !kolco && vysokoe && kr.uverennost >= 0.7) {
          sechenie = 'pryamougolnoe';
          otkudaSech = 'по светотени на снимке: ' + kr.pochemu +
                       ' (уверенность ' + Math.round(kr.uverennost*100) + '%)';
        } else if (kr.okruglost < 0.38 && (kolco || !vysokoe)) {
          otkudaSech = 'светотень говорит «плоское», но ' +
            (kolco ? 'это кольцевое тело — сбоку у него и не может быть купола'
                   : 'кусок слишком низкий, чтобы судить по свету') +
            '; принято круглое';
        } else if (kr.okruglost > 0.62) {
          otkudaSech = 'по светотени на снимке: ' + kr.pochemu +
                       ' (уверенность ' + Math.round(kr.uverennost*100) + '%)';
        }
      }
      if (SZHATIE_PO_SECHENIYU[sechenie]) {
        szhatie = SZHATIE_PO_SECHENIYU[sechenie];
        dopusk(nomer + ': сечение «' + sechenie + '», второго вида нет — глубина принята ' +
               Math.round(szhatie*100) + '% от ширины');
      }
    }

    let k = elementDlya(t.tip, sechenie);
    // если на снимке в этом куске видна дырка, а выбранный элемент отверстия
    // не умеет — берём тот, который умеет. Это замер, а не догадка.
    if (dyra >= 0.08 * shirMm) {
      const sOtv = { head_disc: 'washer_flat', head_dome: 'washer_flat',
                     head_rect: 'plate_hole', head_screw: 'washer_flat' }[k];
      if (sOtv) { k = sOtv; zam.push(nomer + ': на снимке видна дырка Ø' +
        dyra.toFixed(1) + ' мм — взят ' + sOtv + ' вместо ' + elementDlya(t.tip, sechenie)); }
    }
    let p;

    switch (k) {
      case 'head_disc': case 'head_dome':
        p = { d: ok(D,'d'), t: ok(L,'t') }; break;

      case 'washer_flat':
        if (!dyra) dopusk(nomer + ': отверстия на снимке не видно — принято 0.35 диаметра');
        p = { d: ok(D,'d'), dBore: ok(dyra || D*0.35,'dBore'), t: ok(L,'t') }; break;

      case 'head_rect':
        // глубину прямоугольной головы даёт второй вид; без него это допущение
        if (szhatie !== 1 && vidy) { p = { w: ok(D*szhatie,'w'), l: ok(D,'l'), t: ok(L,'t') }; szhatie = 1; }
        else { dopusk(nomer + ': глубина прямоугольной головы на одном виде не видна — принята 0.55 длины');
               p = { w: ok(D*0.55,'w'), l: ok(D,'l'), t: ok(L,'t') }; }
        break;

      case 'head_screw':
        p = { d: ok(D,'d'), t: ok(L,'t'), drive:'torx' }; break;

      case 'plate_hole':
        if (!dyra) dopusk(nomer + ': окна на снимке не видно — принято 0.3 длины');
        dopusk(nomer + ': ширина площадки на одном виде не видна — принята 0.7 длины');
        p = { w: ok(D*0.7,'w'), l: ok(D,'l'), t: ok(L,'t'), okno: ok(dyra || D*0.3,'okno') }; break;

      case 'nut_hex':
        if (!dyra) dopusk(nomer + ': отверстия гайки не видно — принято 0.55 под ключ');
        p = { s: ok(D,'s'), dBore: ok(dyra || D*0.55,'dBore'), h: ok(L,'h') }; break;

      case 'stem_plain':
        p = { d: ok(Dsr,'d'), len: ok(L,'len') }; break;

      case 'stem_split':
        if (!zazM) dopusk(nomer + ': просвета в шейке не видно — прорезь принята 0.6 диаметра');
        dopusk(nomer + ': толщина отгиба на силуэте не видна — принята 0.25 диаметра');
        p = { d: ok(D,'d'), len: ok(L,'len'), legs: nog,
              span: ok(zazM || D*0.6,'span'), wing: ok(D*0.25,'wing') }; break;

      case 'cone_ring':
        // d — ширина вверху куска, dLow — внизу, ровно как на снимке.
        // Тут была ошибка: min/max меняли их местами и воротник переворачивался.
        dopusk(nomer + ': толщина воротника на силуэте не видна — принята 0.45 высоты');
        p = { d: ok(Dv,'d'), dLow: ok(Dn,'dLow'), h: ok(L,'h'), t: ok(Math.max(1, L*0.45),'t') };
        break;

      case 'skirt':
        dopusk(nomer + ': толщина юбки на силуэте не видна — принята 0.4 высоты');
        p = { d: ok(D,'d'), t: ok(Math.max(0.9, L*0.4),'t'), h: ok(L,'h') }; break;

      case 'spool':
        if (!M.rebristo) dopusk(nomer + ': талия катушки не читается — принята 0.45 диаметра');
        dopusk(nomer + ': толщина фланца принята 0.3 высоты');
        p = { d: ok(Dgr,'d'), dLow: ok(Dn,'dLow'),
              dCore: ok(M.rebristo ? Dvp : D*0.45,'dCore'),
              t: ok(L*0.3,'t'), h: ok(L,'h') }; break;

      case 'bushing':
        dopusk(nomer + ': толщина стенки втулки на силуэте не видна — принята 0.15 диаметра');
        p = { d: ok(Dv,'d'), dLow: ok(Dn,'dLow'), len: ok(L,'len'), wall: ok(D*0.15,'wall') }; break;

      case 'thread_out':
        dopusk(nomer + ': шаг резьбы на силуэте не меряется — принят 1.25 мм');
        p = { d: ok(D,'d'), len: ok(L,'len'), pitch: 1.25 }; break;

      case 'stem_fin': {
        // ядро и лепестки берутся из ряби профиля, а не из доли диаметра
        const yadro = M.rebristo ? Dvp : D*0.55;
        const lepestok = M.rebristo ? Dgr : D;
        if (!M.rebristo) dopusk(nomer + ': зубцы на профиле не разделились — ядро принято 0.55 лепестка');
        // число лепестков считается по гребням профиля этого куска
        p = { d: ok(yadro,'d'), len: ok(L,'len'), barbD: ok(lepestok,'barbD'),
              n: Math.max(3, M.grebnej >= 3 ? M.grebnej : (zub || 6)) };
        if (yadro < 4.6) zam.push(nomer + ': ёлочка, ядро ' + yadro.toFixed(1) + ' мм — лепестки могут слиться');
        break; }

      case 'cone_ribs':
        dopusk(nomer + ': толщина рёбер и доля ядра на одном виде не видны — приняты 0.24 и 0.68');
        p = { d: ok(Dv,'d'), dLow: ok(Math.max(0.4, Dn),'dLow'), len: ok(L,'len'),
              rebra: Math.max(3, (t.rebra|0) || 4), t: ok(D*0.24,'t'),
              core: t.sechenie === 'srezannoe_ploskostyami' ? 0.88
                  : t.sechenie === 'mnogogrannik' ? 0.95 : 0.68,
              plecho: 0.10, poyas: 0.83 };
        break;

      case 'cone_split':
        if (!dyra) dopusk(nomer + ': отверстия в разрезном конусе не видно — принято 0.35 диаметра');
        p = { d: ok(Dv,'d'), dLow: ok(Math.max(0.8, Dn),'dLow'), len: ok(L,'len'),
              bore: ok(dyra || D*0.35,'bore'), legs: nog,
              gap: ok(zaz || D*0.12,'gap'), nasechki: 0 }; break;

      case 'tip_cone':
        p = { d: ok(Dv,'d'), len: ok(L,'len') }; break;

      case 'blade_legs':
        dopusk(nomer + ': толщина лезвия на одном виде не видна — принята 0.2 ширины');
        p = { w: ok(D,'w'), t: ok(D*0.2,'t'), len: ok(L,'len'), legs: nog,
              wing: ok(D*0.2,'wing'),
              core: ok(Math.max(1.2, zazM ? D - zazM : D*0.35),'core') }; break;

      case 'wings_up':
        dopusk(nomer + ': сечение крыла на одном виде не видно — принято 0.4 × 0.15 размаха');
        p = { w: ok(D*0.4,'w'), t: ok(D*0.15,'t'), h: ok(L,'h'),
              spread: ok(D,'spread'), legs: nog }; break;

      case 'stem_cage':
        dopusk(nomer + ': окно и отгиб клетки на силуэте не видны');
        p = { d: ok(D,'d'), len: ok(L,'len'), legs: Math.max(2, (t.rebra|0) || 4),
              gap: ok(zaz || D*0.12,'gap'), okno: ok(L*0.4,'okno'), wing: ok(D*0.15,'wing') }; break;

      case 'legs_u':
        dopusk(nomer + ': сечение скобы на одном виде не видно — принято 0.35 × 0.15 размаха');
        p = { w: ok(D*0.35,'w'), t: ok(D*0.15,'t'), len: ok(L,'len'), span: ok(D,'span') }; break;

      case 'hvostovik': {
        // шейка — самое узкое место куска, размах — самое широкое: и то и другое замер
        dopusk(nomer + ': сечение лапки и пятка на одном виде не видны');
        p = { d: ok(Dmin,'d'), w: ok(Dmin*0.6,'w'), t: ok(Dmin*0.45,'t'), len: ok(L,'len'),
              spread: ok(D,'spread'), foot: ok(Dmin*0.5,'foot'), legs: nog };
        break; }

      case 'ring_lug':
        if (!dyra) dopusk(nomer + ': отверстия проушины не видно — принято 0.5 диаметра');
        p = { d: ok(D,'d'), dBore: ok(dyra || D*0.5,'dBore'), t: ok(L,'t'),
              w: ok(D*0.6,'w'), len: ok(L*2,'len') }; break;

      default:
        p = { d: ok(D,'d'), len: ok(L,'len') };
    }

    els.push({ kind: k, params: p, primitiv: t, zamer: M,
               szhatie: +szhatie.toFixed(3), sechenie, otkudaSech });
    if (otkudaSech && i === 0) zam.push('сечение ' + otkudaSech);
    if ((t.uverennost ?? 1) < 0.6)
      zam.push(nomer + ' (' + t.tip + '/' + t.sechenie + '): низкая уверенность');
  });

  return { els, zam: zam.concat(prinyato), prinyato };
}

// Подгонка длины низа под опубликованную длину штока.
// Ширину трогать не надо: sobrat уже поставил самое широкое место равным
// заданному габариту, второй пересчёт только всё ломал.
export function podognat(els, katalog, izmer, mash) {
  const zam = [];
  // если масштаб УЖЕ взят от длины штока, второй раз её применять нельзя
  const shtokUzhe = mash && /штока/.test(mash.otkuda || '');
  if (katalog.dlinaShtoka > 0 && !shtokUzhe) {
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
  // отверстие: каталог главнее, но если его нет — берём померенное по снимку
  let dOtv = 0, otkuda = '';
  if (katalog.otverstie > 0) { dOtv = katalog.otverstie; otkuda = 'по каталогу'; }
  else if (izmer && izmer.otverstie && izmer.otverstie.dolyaD > 0.08) {
    const shir = els.reduce((m, e) => Math.max(m, e.params.d || e.params.w || e.params.l || 0), 0);
    dOtv = Math.round(shir * izmer.otverstie.dolyaD * 100) / 100;
    otkuda = 'померено по дырке на снимке';
  }
  if (dOtv > 0) {
    const e = els.find(x => 'dBore' in x.params || 'bore' in x.params);
    if (e) { if ('dBore' in e.params) e.params.dBore = dOtv; else e.params.bore = dOtv;
             zam.push('отверстие Ø' + dOtv + ' мм — ' + otkuda); }
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
