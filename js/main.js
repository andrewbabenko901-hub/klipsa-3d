import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ELEMENTY, SPISOK, geometriya, vysota } from './elementy.js';
import { slozhit } from './geom.js';
import * as O from './obmer.js';
import * as A from './algoritmy.js';
import * as N from './nejro.js';
import { promtKartinki, promtVida, promtVidaKratko } from './shema.js';
import { svesti, svodka } from './konsensus.js';
import { sobrat, podognat, summarno, elementDlya, masshtab } from './sborka.js';
import { chertyozh, listRazbora } from './vidy.js';
import { vStl, skachat } from './stl.js';
import * as SIL from './siluet.js';
import * as OB from './objyom.js';
import { narezatList } from './narezka.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/** Только настоящие снимки: нарисованные виды с листа сюда не попадают —
 *  нейронке на разбор и на лист нужна фотография, а не чужой рисунок. */
const svoiFoto = () => { const f = S.foto.filter(x => !x.izLista); return f.length ? f : S.foto; };

// v17: у Google картиночные модели имеют Free Tier «недоступен» — на бесплатном
// ключе они отвечают 429 всегда. Кто ещё стоял на Google, разово переводим на
// OpenRouter: там те же модели и биллинг Google не нужен. Вернуть можно в окне.
try {
  if (!localStorage.getItem('klipsa.migr17')) {
    const r = JSON.parse(localStorage.getItem('klipsa.risovalka') || 'null');
    if (r && r.post === 'gemini') {
      localStorage.setItem('klipsa.risovalka', JSON.stringify({ ...r, post: 'openrouter' }));
      localStorage.setItem('klipsa.modelKartinki', 'google/gemini-3.1-flash-image');
    }
    localStorage.setItem('klipsa.migr17', '1');
  }
} catch {}

const S = {
  foto: [], izmer: null, tela: [], els: [], zam: [],
  varianty: [], svod: null, shablon: null, nejro: null,
  rashod: [], granicy: null, nalozhenie: null, masshtab: null,
  izmery: [], vidy: null, svodkaVidov: null, geomCeloe: null, kontrolVida: null, objyom: null,
  list: null, listOtbroshen: null,
};

// ---------- хранилище ----------
const LS = {
  j(k, po) { try { return JSON.parse(localStorage.getItem('klipsa.'+k)) ?? po; } catch { return po; } },
  s(k, v) { try { localStorage.setItem('klipsa.'+k, JSON.stringify(v)); } catch {} },
  get klyuchi(){ return this.j('klyuchi', {}); }, set klyuchi(v){ this.s('klyuchi', v); },
  get modeli(){ return this.j('modeli', {}); },  set modeli(v){ this.s('modeli', v); },
  get adresa(){ return this.j('adresa', {}); },  set adresa(v){ this.s('adresa', v); },
  get objyom(){ return this.j('objyom', { post:'fal' }); }, set objyom(v){ this.s('objyom', v); },
  get vkl(){ return this.j('vkl', { gemini:true }); }, set vkl(v){ this.s('vkl', v); },
  get obr(){ return this.j('obr', {}); },        set obr(v){ this.s('obr', v); },
  get plotnost(){ return +(localStorage.getItem('klipsa.plotnost') || 1); },
  set plotnost(v){ localStorage.setItem('klipsa.plotnost', String(v)); },
  get modelKartinki(){ return localStorage.getItem('klipsa.modelKartinki') || N.MODELI_KARTINOK[0]; },
  set modelKartinki(v){ localStorage.setItem('klipsa.modelKartinki', v); },
  get risovalka(){ return this.j('risovalka', { post:'openrouter', adres:'' }); },
  set risovalka(v){ this.s('risovalka', v); },
  get shablon(){ return this.j('shablon', null); }, set shablon(v){ this.s('shablon', v); },
  get istoria(){ return this.j('istoria', []); },  set istoria(v){ this.s('istoria', v.slice(0,40)); },
};

// ---------- плотность ----------
function plotnost(v) {
  const m = Math.max(0.72, Math.min(1.35, +v.toFixed(2)));
  LS.plotnost = m;
  document.documentElement.style.setProperty('--m', m);
  $('#plotnostZnak').textContent = Math.round(m*100) + '%';
  setTimeout(razmer3d, 60);
}

// ---------- сцена ----------
let ren, scena, kamera, upr, setkaPola, telo3d;
function scenaInit() {
  const el = $('#scena3d');
  ren = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
  ren.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.appendChild(ren.domElement);
  scena = new THREE.Scene(); scena.background = new THREE.Color(0x0b1512);
  kamera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 4000);
  kamera.position.set(38, 26, 46);
  upr = new OrbitControls(kamera, ren.domElement); upr.enableDamping = true;
  scena.add(new THREE.HemisphereLight(0xd8ffe8, 0x0a1a12, 1.15));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.5); d1.position.set(24,40,30); scena.add(d1);
  const d2 = new THREE.DirectionalLight(0x9fd8bb, .5); d2.position.set(-30,12,-20); scena.add(d2);
  setkaPola = new THREE.GridHelper(120, 24, 0x1d3227, 0x152219); scena.add(setkaPola);
  new ResizeObserver(() => { razmer3d(); if (!$('#holstMaski').hidden) risovatMasku(); }).observe($('#stsena'));
  razmer3d();
  (function tick(){ requestAnimationFrame(tick); upr.update(); ren.render(scena, kamera); })();
}
function razmer3d() {
  const el = $('#stsena'); if (!ren || !el.clientWidth) return;
  ren.setSize(el.clientWidth, el.clientHeight);
  kamera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
  kamera.updateProjectionMatrix();
}
function pokazatModel(geom, cvet) {
  if (telo3d) { scena.remove(telo3d); telo3d.geometry.dispose(); telo3d.material.dispose(); telo3d = null; }
  if (!geom) return;
  const c = cvet || [61,143,99];
  const mat = new THREE.MeshStandardMaterial({ color:new THREE.Color(c[0]/255,c[1]/255,c[2]/255),
    roughness:.55, metalness:.06, side:THREE.DoubleSide });
  telo3d = new THREE.Mesh(geom, mat);
  geom.computeBoundingBox();
  const bb = geom.boundingBox, ce = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3());
  telo3d.position.set(-ce.x, -bb.min.y, -ce.z);
  scena.add(telo3d);
  const d = Math.max(r.x, r.y, r.z) || 10;
  setkaPola.scale.setScalar(Math.max(0.25, d/40));
  kamera.position.set(d*1.5, d*1.15, d*1.8);
  upr.target.set(0, r.y/2, 0); upr.update();
}

// ---------- геометрия ----------
function geomRecepta(els) {
  const kuski = [], celoe = []; let y = 0;
  for (const e of els) {
    const g = geometriya(e.kind, e.params), h = vysota(e.kind, e.params);
    if (g) {
      // сплющивание по глубине: круглый элемент так становится овальным.
      // Деталь перестаёт быть телом вращения, а элементы конструктора
      // при этом не трогаются — они не мои.
      const sz = +e.szhatie || 1;
      if (Math.abs(sz - 1) > 0.01) g.scale(1, 1, sz);
      kuski.push(g.clone()); const v = g.clone(); v.translate(0,y,0); celoe.push(v);
    }
    y -= h;
  }
  return { celoe: slozhit(celoe), kuski };
}

function pererisovat() {
  if (!S.els.length) { pokazatModel(null); return; }
  const { celoe, kuski } = geomRecepta(S.els);
  S.geomCeloe = celoe;
  const cvet = (S.izmer && S.izmer.cvet) || [74,132,92];
  pokazatModel(celoe, cvet);
  const gab = summarno(S.els);
  chertyozh($('#chertyozh'), celoe, {
    nomer: $('#pNomer').value || '—', material: $('#pMaterial').value || 'пластик',
    elementov: S.els.length, vysota: gab.vysota, shirina: gab.shirina, cvet });
  listRazbora($('#listRazbora'), celoe, kuski, cvet);
  sverkaSiluetov(celoe);
  risovatMasku();
}

// ---------- сверка силуэтов ----------
// Ответ на «почему модель не похожа на снимок» должен быть не на словах:
// силуэт модели кладётся на маску снимка и меряется совпадение.
// Маски всех видов, годных для сверки с моделью: спереди — 0°, сбоку — 90°.
// Вид сверху так не сравнить, он служит только для формы сечения.
function maskiVidov() {
  const UGOL = { speredi: 0, sboku: 90 };
  return (S.izmery || []).filter(v => (v.izmer || v.maskaGotovaya) && UGOL[v.rol] !== undefined)
    .map(v => ({ rol: v.rol, ugol: UGOL[v.rol],
                 maska: v.maskaGotovaya || O.maskaVyravnennaya(v.izmer) }))
    .filter(v => v.maska);
}

function sverkaSiluetov(geom) {
  S.nalozhenie = null; S.svodkaVidov = null;
  if (!S.izmer || !geom) { pokazatSovpadenie(); return; }
  try {
    const vidy = maskiVidov();
    const sv = SIL.sravnitVidy(vidy, geom);
    if (sv) { S.svodkaVidov = sv; S.nalozhenie = sv.glavnyj; }
  } catch (e) { S.nalozhenie = null; }
  pokazatSovpadenie();
}

function pokazatSovpadenie() {
  const b = $('#sovpad'); if (!b) return;
  const n = S.nalozhenie;
  b.hidden = !n;
  if (!n) return;
  $('#sovpadPolosa').style.width = Math.round(n.iou*100) + '%';
  const raz = Math.abs(n.vysotaModeli - n.vysotaFoto) / Math.max(n.vysotaFoto, 1e-6);
  const sv = S.svodkaVidov;
  const poVidam = sv && sv.vidy.length > 1
    ? '<br>' + sv.vidy.map(v => (v.rol === 'sboku' ? 'сбоку' : 'спереди') + ' ' +
        Math.round(v.iou*100) + '%').join(' · ')
    : '';
  const obshch = sv ? sv.iou : n.iou;
  $('#sovpadPolosa').style.width = Math.round(obshch*100) + '%';
  $('#sovpadPod').innerHTML =
    'Силуэт совпал с фото на <b>' + Math.round(obshch*100) + '%</b> · ' +
    'модель добавила лишнего ' + Math.round(n.lishneeVModeli*100) + '%, ' +
    'не построила ' + Math.round(n.netVModeli*100) + '%' + poVidam +
    (raz > 0.12 ? '<br>пропорции разошлись на ' + Math.round(raz*100) + '% по высоте' : '');
}

// ---------- обработка ----------
function nastrojkiObrabotki() {
  return {
    maska: $('#oMaska').value, komponenta: $('#oKomponenta').value, os: $('#oOs').value,
    chistka: $('#oChistka').value, radius: +$('#oRadius').value || 1,
    dyry: $('#oDyry').checked, bezPometok: $('#oPometki').checked,
  };
}
function zapomnitObrabotku() { LS.obr = Object.assign(nastrojkiObrabotki(), { chuvst:+$('#oChuvst').value }); }

/**
 * Обмер всех загруженных видов, а не только первого.
 * Вид спереди даёт все диаметры и длины, вид сбоку — сечение: если ширина
 * сбоку не равна ширине спереди, деталь не тело вращения.
 */
function obmerit(tiho) {
  if (!S.foto.length) { if (!tiho) skazatOshibku('Сначала загрузи фото.', true); return null; }
  const nastr = nastrojkiObrabotki();
  S.izmery = [];
  S.foto.forEach((f, i) => {
    if (!f.rol) f.rol = ['speredi','sboku','sverhu'][i] || 'sboku';
    const zapis = { rol: f.rol, nomer: i+1, izLista: !!f.izLista };
    try { zapis.izmer = O.obmerit(f.img, nastr); }
    catch (e) { zapis.izmer = null; zapis.sboj = e.message; }
    S.izmery.push(zapis);
  });
  proveritList();
  // снимок всегда старше нарисованного: если роль есть у обоих, берём снимок
  const vid = r => (S.izmery.find(v => v.rol === r && v.izmer && !v.izLista)
                 || S.izmery.find(v => v.rol === r && v.izmer) || {}).izmer || null;
  S.izmer = vid('speredi') || (S.izmery.find(v => v.izmer) || {}).izmer || null;
  if (!S.izmer) {
    if (!tiho) skazatOshibku('Обмер не вышел: ' + (S.izmery[0]?.sboj || 'деталь не найдена'));
    return null;
  }
  S.vidy = O.sopostavitVidy(S.izmer, vid('sboku'));
  const nm = A.METODY_MASKI[S.izmer.metod];
  if (nm) $('#znMetod').textContent = nm.split(' —')[0].toLowerCase();
  $('#znVidov').textContent = S.izmery.filter(v => v.izmer).length;
  return S.izmer;
}

/**
 * Виды с листа меряются наравне с фотографией, но верить им можно только
 * после очной ставки: если вид спереди с листа не лёг на настоящий снимок,
 * значит нейронка нарисовала не эту деталь — и весь лист отбрасывается.
 * Порог тот же, что у дорисовки видов.
 */
function proveritList() {
  S.listOtbroshen = null; S.listSovpal = null;
  const fo = S.izmery.find(v => !v.izLista && v.rol === 'speredi' && v.izmer);
  const li = S.izmery.find(v =>  v.izLista && v.rol === 'speredi' && v.izmer);
  if (!fo || !li) return;
  const a = O.maskaVyravnennaya(fo.izmer), b = O.maskaVyravnennaya(li.izmer);
  const sr = (a && b) ? SIL.sravnit(a, b) : null;
  if (!sr) return;
  const porog = +($('#oPorogVida')?.value || 0.8);
  if (sr.iou < porog) {
    S.listOtbroshen = { iou: sr.iou, porog };
    S.izmery = S.izmery.filter(v => !v.izLista);
  } else S.listSovpal = sr.iou;
}

/**
 * Достроить виды через объём: снимок -> 3D-меш -> ортогональные силуэты.
 *
 * Меш не становится результатом. С него снимаются виды, дальше он выбрасывается,
 * а деталь всё равно собирается из наших элементов по силуэтам — правило
 * «никаких чужих 3D-моделей в выдаче» не нарушается.
 */
async function dostroitPoObjyomu() {
  const n = LS.objyom, p = OB.POSTAVSHCHIKI_OBJYOMA[n.post] || OB.POSTAVSHCHIKI_OBJYOMA.fal;
  if (!n.klyuch) throw new Error('Для объёма нужен ключ ' + p.imya + '.');
  const front = (S.izmery || []).find(v => v.rol === 'speredi' && v.izmer && !v.izNejronki);
  if (!front) throw new Error('Нет снимка спереди.');
  const kartinki = svoiFoto().slice(0, 3).map(f => 'data:' + (f.mime||'image/png') + ';base64,' + f.b64);

  const r = await OB.poluchitObjyom({ post:n.post, klyuch:n.klyuch, model:n.model,
                                      adres:n.adres, kartinki });
  S.rashod.push({ istochnik:'объём', post:n.post, model:n.model || p.modeli[0], kartinok:1 });
  const geom = OB.vypryamit(await OB.zagruzitGeometriyu(r.glb));

  const fot = O.maskaVyravnennaya(front.izmer);
  const v = OB.vidyIzObjyoma(geom, fot);
  const porog = +$('#oPorogVida').value || 0.8;
  S.objyom = { iou: v.iou, ugol: v.ugol, sekund: r.sekund };
  if (v.iou < porog) {
    geom.dispose();
    S.zam.push('объём построен, но его вид спереди совпал со снимком только на ' +
      Math.round(v.iou*100) + '% (нужно ' + Math.round(porog*100) + '%) — виды с него отброшены');
    return { ok:false, iou:v.iou };
  }

  // вид сбоку — то, ради чего всё затевалось
  const pm = O.polosyMaski(v.sboku);
  if (!(S.izmery || []).some(x => x.rol === 'sboku' && x.izmer)) {
    // псевдо-обмер: полос и пропорций хватает, чтобы посчитать сечение
    const psevdo = { polosy: pm.polosy, runs: pm.runs, zapoln: pm.zapoln,
                     os: 'вертикально', vysotaKShirine: +(v.sboku.H / v.sboku.W).toFixed(4),
                     izObjyoma: true };
    S.izmery.push({ rol:'sboku', nomer:S.izmery.length+1, izObjyoma:true, izNejronki:true,
                    izmer: psevdo, maskaGotovaya: v.sboku, polosy: pm.polosy, runs: pm.runs,
                    iouKontrolya: v.iou });
    S.vidy = O.sopostavitVidy(S.izmer, psevdo);
  }
  // сечение по виду сверху — самая честная его оценка
  const okr = OB.okruglostKontura(v.sverhu);
  S.objyom.okruglostSverhu = okr;
  S.zam.push('объём: вид спереди сошёлся на ' + Math.round(v.iou*100) + '% при повороте ' +
    v.ugol + '°' + (okr != null ? ', контур сверху округлый на ' + Math.round(okr*100) + '%' : '') +
    ' — виды сбоку и сверху сняты с меша, сам меш выброшен');
  geom.dispose();
  return { ok:true, iou:v.iou, okruglostSverhu:okr };
}

/**
 * Дорисовать недостающие виды нейронкой.
 *
 * Порядок такой: сначала рисуем КОНТРОЛЬНЫЙ вид спереди и накладываем его на
 * настоящий снимок. Если модель нарисовала не ту деталь — это видно сразу, и
 * тогда отбрасываются все нарисованные виды, а обмер идёт по фотографии.
 * Только когда контроль прошёл, берём вид сбоку: сверить его не с чем, но раз
 * на проверяемом виде модель не соврала, ему можно верить с оговоркой.
 *
 * Абсолютные размеры всё равно снимаются с настоящего снимка. Нарисованный
 * даёт форму сечения — то, чего на одном фото нет в принципе.
 */
async function dorisovatVidy() {
  const ris = LS.risovalka;
  const gk = (LS.klyuchi[ris.post === 'svoj' ? 'svoj' : ris.post] || '').trim();
  if (!gk) throw new Error('Для эталонных видов нужен ключ: ' +
    (N.RISOVALKI[ris.post]?.imya || ris.post) + '. Впиши его в «Нейронки и ключи».');
  const model = LS.modelKartinki;
  const porog = +$('#oPorogVida').value || 0.8;
  const nastr = nastrojkiObrabotki();
  const podskazka = $('#pPodskazka').value.trim();

  const front = (S.izmery || []).find(v => v.rol === 'speredi' && v.izmer && !v.izNejronki);
  const fotoFront = S.foto[(front ? front.nomer : 1) - 1] || svoiFoto()[0];
  if (!front || !fotoFront) throw new Error('Нет снимка спереди — с чем сверять.');

  const zagruzit = async url => {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('картинка не открылась')); im.src = url; });
    return im;
  };
  const narisovat = async rol => {
    const r = await N.narisovatCherez(ris.post, gk, model, fotoFront,
                                      promtVida(rol, podskazka), ris.adres,
                                      promtVidaKratko(rol));
    S.rashod.push({ istochnik: 'вид ' + rol, post: ris.post, model, kartinok: 1 });
    return r;
  };

  // 1. контрольный вид спереди
  const k = await narisovat('speredi');
  const izmK = O.obmerit(await zagruzit(k.kartinka), nastr);
  const sv = SIL.sravnit(O.maskaVyravnennaya(front.izmer), O.maskaVyravnennaya(izmK), 200);
  const iou = sv ? sv.iou : 0;
  S.kontrolVida = { iou, porog, kartinka: k.kartinka };
  // показываем, что именно нарисовала нейронка — и когда прошло, и когда нет
  $('#nejroList').innerHTML =
    `<div style="padding:10px"><div class="podskazka" style="margin-bottom:6px">
       Контрольный вид спереди, нарисован нейронкой. Совпал со снимком на
       <b>${Math.round(iou*100)}%</b> при пороге ${Math.round(porog*100)}%.</div>
     <img src="${k.kartinka}" style="max-width:100%"></div>`;
  if (iou < porog) {
    S.zam.push('нейронка нарисовала деталь на ' + Math.round(iou*100) + '% похожую на снимок ' +
               '(нужно ' + Math.round(porog*100) + '%) — все нарисованные виды отброшены, мерим по фото');
    return { ok: false, iou };
  }

  // 2. вид сбоку — его-то и не хватает
  const nuzhen = !(S.izmery || []).some(v => v.rol === 'sboku' && v.izmer);
  if (!nuzhen) return { ok: true, iou, dobavleno: 0 };
  const b = await narisovat('sboku');
  const izmB = O.obmerit(await zagruzit(b.kartinka), nastr);
  const sogl = O.soglasieVysot(front.izmer, izmB);
  if (sogl < 0.3) {
    S.zam.push('вид сбоку нарисован, но ступени профиля на нём стоят на других высотах ' +
               '(согласие ' + sogl + ') — вид отброшен');
    return { ok: false, iou, sogl };
  }
  S.izmery.push({ rol:'sboku', nomer: S.izmery.length+1, izmer: izmB,
                  izNejronki: true, kartinka: b.kartinka, iouKontrolya: iou, soglasie: sogl });
  S.vidy = O.sopostavitVidy(S.izmer, izmB);
  S.zam.push('вид сбоку нарисован нейронкой: контрольный вид совпал со снимком на ' +
             Math.round(iou*100) + '%, ступени сошлись на ' + Math.round(sogl*100) + '% — ' +
             'сечение взято с него, миллиметры по-прежнему с фотографии');
  return { ok: true, iou, sogl, dobavleno: 1 };
}

/**
 * Разбор без нейронки. Сколько тел — решает не штраф из головы: перебираются
 * все нарезки от двух тел до восьми, каждая собирается в настоящую модель, и
 * побеждает та, чей силуэт ближе всего лёг на снимок.
 */
function razborAlgoritmom() {
  if (!S.izmer) return null;
  const chuvst = +$('#oChuvst').value;
  let tela = O.razborAlgoritmom(S.izmer, chuvst);
  let podpis = 'изломы профиля', uver = 0.6, iou = 0;
  try {
    const vidyM = maskiVidov();
    const varianty = O.variantyRazbora(S.izmer);
    let luchshee = -1, luchshie = null, luchshieIou = 0;
    for (const v of varianty) {
      const sb = sobrat(v.tela, S.izmer, masshtab(katalog(), S.izmer, v.tela).mm, S.vidy);
      const g = geomRecepta(sb.els).celoe;
      const sv = SIL.sravnitVidy(vidyM, g, 140, 180);
      if (g && g.dispose) g.dispose();
      // небольшой штраф за лишние тела: рецепт из восьми кусков ради лишнего
      // процента совпадения — это не модель, а мозаика
      const o = sv ? sv.iou - 0.008*v.tel : -1;
      if (o > luchshee) { luchshee = o; luchshieIou = sv.iou; luchshie = v.tela; }
    }
    if (luchshie) {
      tela = luchshie; iou = luchshieIou;
      podpis = 'нарезка выбрана по силуэту (' + Math.round(iou*100) + '%)';
      uver = Math.max(0.5, Math.min(0.85, 0.3 + iou*0.7));
    }
  } catch (e) { /* нет WebGL — остаёмся на штрафе */ }
  return { istochnik:'Алгоритм по профилю', post:'algoritm', model: podpis,
           tela, uverennost: uver, ves: 0.8 + (iou > 0.7 ? 0.4 : 0), rashod:null, sekund:0 };
}

// ---------- сборка ----------
function katalog() {
  return { shirinaMm:+$('#pGolova').value||0, otverstie:+$('#pOtverstie').value||0,
           dlinaShtoka:+$('#pShtok').value||0 };
}
function peresobrat() {
  if (!S.tela.length || !S.izmer) return;
  const kat = katalog();
  S.masshtab = masshtab(kat, S.izmer, S.tela);
  const r = sobrat(S.tela, S.izmer, S.masshtab.mm, S.vidy);
  S.els = r.els; S.zam = r.zam.concat(podognat(S.els, kat, S.izmer, S.masshtab));
  S.granicy = O.granicyTel(S.izmer.polosy, S.tela.map(t => Math.max(0.02, +t.dolyaVysoty||0.1)));
  pererisovat(); pokazatRezultat(); $('#znKuskov').textContent = S.tela.length;
}

// ---------- показ результата ----------
const UVER = u => u >= 0.75 ? ['m-v','высокая'] : u >= 0.55 ? ['m-s','средняя'] : ['m-n','низкая'];

function pokazatRezultat() {
  const est = S.els.length > 0, it = $('#itog');
  it.classList.toggle('ploho', !est);
  it.querySelector('.krug').textContent = est ? '✓' : '·';
  it.querySelector('b').textContent = est ? 'Собирается в конструкторе' : 'Пока пусто';
  const gab = est ? summarno(S.els) : null;
  $('#itogPod').textContent = est
    ? `${S.els.length} эл. · ${gab.vysota}×${gab.shirina} мм` +
      (S.svod?.istochnikov > 1 ? ` · сведено из ${S.svod.istochnikov} источников` : '')
    : 'Модель ещё не собрана';

  const tb = $('#tabSopost').querySelector('tbody');
  tb.innerHTML = est ? '<tr><th>№</th><th>Примитив</th><th>Элемент</th><th>Параметры</th><th>Увер.</th></tr>' : '';
  S.els.forEach((e, i) => {
    const t = e.primitiv || {}, el = ELEMENTY[e.kind] || {};
    const [kl, txt] = UVER(t.uverennost ?? 0.8);
    const par = Object.entries(e.params).filter(([k]) => !['drive','nasechki','plecho','poyas'].includes(k))
      .map(([k,v]) => `${k} ${v}`).join(', ');
    const soglasie = t.soglasie != null && S.svod?.istochnikov > 1
      ? `<span class="metka m-i">${Math.round(t.soglasie*100)}%</span>` : '';
    tb.insertAdjacentHTML('beforeend',
      `<tr><td>${i+1}</td><td>${t.opisanie || t.tip || '—'}<div class="klyuch">${t.sechenie||''}${t.rebra?' ×'+t.rebra:''}</div></td>
       <td>${el.imya || e.kind}<div class="klyuch">${e.kind}</div></td>
       <td class="klyuch">${par}</td><td><span class="metka ${kl}">${txt}</span> ${soglasie}</td></tr>`);
  });

  const rz = S.svod?.raznoglasiya || [];
  $('#raznoglasiyaBlok').hidden = !rz.length;
  $('#raznoglasiya').innerHTML = rz.map(r =>
    `<div class="raznoglasie"><b>${r.telo ? 'Тело '+r.telo : 'Всего'}</b>, ${r.pole}: ${r.varianty}</div>`).join('');

  const ins = $('#instrukcia'); ins.innerHTML = '';
  S.els.forEach((e, i) => {
    const el = ELEMENTY[e.kind] || {};
    const g = e.params.d ?? e.params.l ?? e.params.w ?? e.params.s;
    ins.insertAdjacentHTML('beforeend',
      `<li><span>${i===0?'Поставь базовым':'Добавь под предыдущий'} <b>${e.kind}</b>${g?' Ø'+g+' мм':''} — ${(el.imya||'').toLowerCase()}.</span></li>`);
  });

  const vz = $('#vzyato'), dd = $('#dodumano'); vz.innerHTML = ''; dd.innerHTML = '';
  const kat = katalog();
  if (S.masshtab) {
    const izvestno = /каталог|отверстия|штока/.test(S.masshtab.otkuda);
    (izvestno ? vz : dd).insertAdjacentHTML('beforeend', `<li>${S.masshtab.otkuda}</li>`);
  }
  if (kat.otverstie) vz.insertAdjacentHTML('beforeend', `<li>Отверстие Ø${kat.otverstie} мм — каталог</li>`);
  const nar = (S.izmery||[]).filter(v => v.izNejronki && v.izmer).length;
  if (nar) dd.insertAdjacentHTML('beforeend',
    `<li>Видов нарисовано нейронкой: ${nar}${S.kontrolVida ? ', контроль ' + Math.round(S.kontrolVida.iou*100) + '%' : ''}</li>`);
  if (S.izmer && S.izmer.otverstie) vz.insertAdjacentHTML('beforeend',
    `<li>Дырка на снимке: ${Math.round(S.izmer.otverstie.dolyaD*100)}% ширины${S.izmer.otverstie.skvoznoe?', сквозная':''}</li>`);
  if (kat.dlinaShtoka) vz.insertAdjacentHTML('beforeend', `<li>Длина штока ${kat.dlinaShtoka} мм — каталог</li>`);
  if (S.izmer) {
    const nazvMetoda = A.METODY_MASKI[S.izmer.metod];
    vz.insertAdjacentHTML('beforeend', `<li>Пропорции по 40 полосам — обмер${nazvMetoda ? ' (' + nazvMetoda.split(' —')[0] + ')' : ''}</li>`);
    vz.insertAdjacentHTML('beforeend', `<li>Высота к ширине ${S.izmer.vysotaKShirine}</li>`);
    vz.insertAdjacentHTML('beforeend', `<li>Цвет детали — со снимка</li>`);
  }
  const poSvetu = (S.els||[]).filter(e => /светотени/.test(e.otkudaSech||'')).length;
  if (poSvetu) vz.insertAdjacentHTML('beforeend',
    `<li>Сечение ${poSvetu} тел определено по светотени на снимке</li>`);
  S.tela.forEach(t => { if (t.sechenie && t.sechenie !== 'krugloe')
    vz.insertAdjacentHTML('beforeend', `<li>Сечение «${t.sechenie}», рёбер ${t.rebra||0}</li>`); });
  if (!vz.children.length) vz.innerHTML = '<li class="tiho">пока ничего</li>';
  S.zam.forEach(z => dd.insertAdjacentHTML('beforeend', `<li>${z}</li>`));
  dd.insertAdjacentHTML('beforeend', '<li>Толщины не ниже печатного минимума</li>');


  $('#jsonVyhod').textContent = JSON.stringify(S.els.map(e => ({ kind:e.kind, params:e.params })), null, 1);
}

// ---------- сравнение ответов ----------
function pokazatSravnenie() {
  const v = $('#sravnenieVid');
  if (!S.varianty.length) { v.innerHTML = '<div class="tiho">Ещё никого не спрашивали.</div>'; return; }
  const sv = svodka(S.varianty);
  v.innerHTML = '<div class="sravnenie">' + sv.map(x => {
    const vzyat = S.svod?.opora === x.istochnik;
    const shapka = x.sboj
      ? `<span class="metka m-n">сбой</span>`
      : `<span class="metka ${x.uverennost>=0.75?'m-v':x.uverennost>=0.55?'m-s':'m-n'}">${x.uverennost}</span>`;
    return `<div class="otvet ${vzyat?'vzyat':''}">
      <h5>${x.istochnik}${vzyat?' <span class="metka m-i">опорный</span>':''}<span class="prav">${shapka}</span></h5>
      <div class="klyuch">${x.model}${x.sekund?' · '+x.sekund+' с':''}${
        x.iou!=null ? ' · силуэт совпал на '+Math.round(x.iou*100)+'%' : ''}</div>
      ${x.sboj ? `<div class="oshibka" style="margin-top:6px">${x.sboj}</div>`
        : `<div style="margin-top:5px"><b>${x.tel}</b> тел · сечения: ${x.secheniya}</div>
           <div class="klyuch" style="margin-top:4px">${x.sostav}</div>`}
    </div>`;
  }).join('') + '</div>' +
  (S.svod?.raznoglasiya?.length
    ? '<h3 class="razdel">Расхождения</h3>' + S.svod.raznoglasiya.map(r =>
        `<div class="raznoglasie"><b>${r.telo?'Тело '+r.telo:'Всего'}</b>, ${r.pole}: ${r.varianty}</div>`).join('')
    : '<div class="podskazka" style="margin-top:10px">Источники сошлись полностью.</div>');
}

// ---------- редактор примитивов ----------
// Что именно померено у этого куска. Видно, что каждый кусок считается сам по
// себе, а не по общим коэффициентам от габарита.
function zamerStroka(i) {
  const e = S.els[i]; if (!e || !e.zamer) return '';
  const M = e.zamer, p = v => Math.round(v*100) + '%';
  const ch = ['замер: верх ' + p(M.verh) + ' · низ ' + p(M.niz) +
              ' · шире всего ' + p(M.max) + ' · уже всего ' + p(M.min)];
  if (M.rebristo) ch.push('рябь: гребни ' + p(M.grebni) + ', впадины ' + p(M.vpadina) +
                          ', гребней ' + M.grebnej);
  if (M.prosvet > 0.015) ch.push('просвет ' + p(M.prosvet) + ' в ' + M.kuskov + ' кусках');
  if (M.otverstie) ch.push('дырка ' + p(M.otverstie.dolyaD));
  const kr = M.kruglost;
  if (kr) ch.push(kr.uverennost < 0.5 ? 'свет: ' + kr.pochemu
    : 'свет: ' + (kr.okruglost > 0.62 ? 'круглое' : kr.okruglost < 0.38 ? 'плоское' : 'не решается') +
      ' (' + Math.round(kr.okruglost*100) + '%, уверенность ' + Math.round(kr.uverennost*100) + '%)');
  return ch.join(' · ');
}

function pokazatKuski() {
  const k = $('#kuski');
  $('#znKuskov').textContent = S.tela.length;
  if (!S.tela.length) { k.innerHTML = '<div class="tiho">Загрузи фото и нажми «Синтезировать».</div>'; return; }
  k.innerHTML = '';
  S.tela.forEach((t, i) => {
    const d = document.createElement('div'); d.className = 'kusok';
    const ist = t.istochnik ? `<span class="metka m-i" title="${t.istochnik}">${t.soglasie!=null?Math.round(t.soglasie*100)+'%':'—'}</span>` : '';
    d.innerHTML = `
      <div class="verh"><span class="nomer">${i+1}</span>
        <input type="text" data-p="opisanie" value="${(t.opisanie||'').replace(/"/g,'&quot;')}" placeholder="что это за кусок">
        ${ist}
        <div class="strelki"><button data-d="up">▲</button><button data-d="dn">▼</button><button data-d="rm">✕</button></div></div>
      <div class="troika">
        <div><label>Тип</label><select data-p="tip">${N.TIPY.map(x=>`<option${x===t.tip?' selected':''}>${x}</option>`).join('')}</select></div>
        <div><label>Сечение</label><select data-p="sechenie">${N.SECHENIYA.map(x=>`<option${x===t.sechenie?' selected':''}>${x}</option>`).join('')}</select></div>
        <div><label>Рёбер</label><input type="number" data-p="rebra" min="0" max="12" value="${t.rebra||0}"></div>
      </div>
      <div class="troika" style="margin-top:6px">
        <div><label>Доля высоты</label><input type="number" data-p="dolyaVysoty" step="0.01" min="0" max="1" value="${t.dolyaVysoty}"></div>
        <div><label>Доля ширины</label><input type="number" data-p="dolyaShiriny" step="0.01" min="0" max="1" value="${t.dolyaShiriny}"></div>
        <div><label>Зубцов</label><input type="number" data-p="zubcov" min="0" max="20" value="${t.zubcov||0}"></div>
      </div>
      <div class="podskazka">→ ${elementDlya(t.tip, t.sechenie)}${t.istochnik?' · '+t.istochnik:''}</div>
      <div class="podskazka zamer">${zamerStroka(i)}</div>`;
    d.addEventListener('input', ev => {
      const p = ev.target.dataset.p; if (!p) return;
      t[p] = ev.target.type === 'number' ? +ev.target.value : ev.target.value;
      if (p==='tip'||p==='sechenie') d.querySelector('.podskazka').textContent = '→ ' + elementDlya(t.tip, t.sechenie);
      peresobrat();
    });
    d.addEventListener('click', ev => {
      const c = ev.target.dataset.d; if (!c) return;
      if (c==='rm') S.tela.splice(i,1);
      if (c==='up' && i>0) S.tela.splice(i-1,0,S.tela.splice(i,1)[0]);
      if (c==='dn' && i<S.tela.length-1) S.tela.splice(i+1,0,S.tela.splice(i,1)[0]);
      S.tela.forEach((x,j)=>x.nomer=j+1);
      pokazatKuski(); peresobrat();
    });
    k.appendChild(d);
  });
}

// ---------- шаги и ошибки ----------
function shag(imya, sost) {
  const li = $(`.shagi li[data-shag="${imya}"]`); if (!li) return;
  li.classList.remove('idet','est','sboj'); if (sost) li.classList.add(sost);
}
const shagiSbros = () => $$('.shagi li').forEach(l => l.classList.remove('idet','est','sboj'));
function skazatOshibku(t, vazhno) {
  const o = $('#oshibka');
  o.innerHTML = t ? `<div class="oshibka" style="margin-top:8px">${t}</div>` : '';
  if (t) try { o.scrollIntoView({block:'nearest',behavior:'smooth'}); } catch {}
  $('#drop').classList.toggle('zovyot', !!vazhno);
}
function pokazatRashod() {
  if (!S.rashod.length) { $('#rashod').textContent = ''; return; }
  let itog = 0; const kus = [];
  for (const r of S.rashod) {
    const c = N.stoimost(r.post, r.model, r.rashod);
    if (c != null) itog += c;
    if (r.kartinok) itog += r.kartinok * (N.CENY_KARTINOK[r.model] || 0);
    kus.push(r.istochnik + (c != null ? ' $' + c.toFixed(4) : ''));
  }
  $('#rashod').textContent = 'Расход за сеанс: ' + kus.join(', ') +
    (itog ? ' — всего около $' + itog.toFixed(3) : '');
}

// ---------- фото ----------
function vstavitFoto(files) {
  const spisok = [...files];
  if (!spisok.length) return skazatOshibku(
    'Ничего не пришло. Картинку прямо со страницы сайта перетащить нельзя — сохрани файл и брось его.');
  const kartinki = spisok.filter(f => f.type.startsWith('image/'));
  if (!kartinki.length) return skazatOshibku(
    'Это не картинка: ' + spisok.map(f=>f.name||'файл').join(', ') + '. Нужен JPG, PNG или WEBP. HEIC с айфона пересохрани в JPG.');
  const svoih = S.foto.filter(f => !f.izLista).length;
  if (svoih >= 3) return skazatOshibku('Уже три снимка, больше не влезет. Виды с листа — отдельно, ниже.');
  skazatOshibku('');
  kartinki.slice(0, 3 - svoih).forEach(f => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => { S.foto.push({ url:fr.result, img:im, imya:f.name,
        b64:fr.result.split(',')[1], mime:f.type }); pokazatFoto(); if (obmerit(true)) { peresobrat(); risovatMasku(); } };
      im.src = fr.result;
    };
    fr.readAsDataURL(f);
  });
}
function risovatMasku() {
  if (!S.izmer) return;
  const cv = $('#holstMaski'), box = $('#stsena');
  // холст под размер окна: раньше картинка 900x500 растягивалась на любую
  // форму контейнера, и деталь на ней переставала быть собой
  const nalPoRoli = {};
  if (S.svodkaVidov) for (const x of S.svodkaVidov.vidy) nalPoRoli[x.rol] = x;
  const vidy = (S.izmery || []).filter(v => v.izmer || v.maskaGotovaya).map(v =>
    ({ rol: v.rol, izmer: v.maskaGotovaya ? null : v.izmer, maska: v.maskaGotovaya || null,
       polosy: v.polosy, runs: v.runs, izNejronki: v.izNejronki, izObjyoma: v.izObjyoma,
       granicy: S.granicy, nal: nalPoRoli[v.rol] || null }));

  // Снимка сбоку нет — показываем, каким видит бок сама модель. Так видно,
  // что она построила по глубине, и есть с чем спорить руками.
  if (!vidy.some(v => v.rol === 'sboku') && S.geomCeloe) {
    try {
      const sil = SIL.siluetGeometrii(S.geomCeloe, 260, 90);
      if (sil && sil.W > 1) {
        const pm = O.polosyMaski(sil);
        vidy.push({ rol:'sboku', izModeli:true, maska: sil, granicy: S.granicy,
                    polosy: pm.polosy, runs: pm.runs, nal: null });
      }
    } catch (e) { console.warn('вид сбоку из модели не построился:', e.message); }
  }
  const shirMm = S.masshtab ? S.masshtab.mm : (+$('#pGolova').value || 0);
  // на два-три ряда нужно больше высоты, иначе картинки сжимаются в марки
  box.classList.toggle('vidov2', vidy.length === 2);
  box.classList.toggle('vidov3', vidy.length >= 3);
  const rw2 = box.clientWidth || 900, rh2 = box.clientHeight || 420;
  const k2 = Math.max(1, Math.min(2.4, 1200 / rw2));
  const w2 = Math.round(rw2 * k2), h2 = Math.round(rh2 * k2);
  if (cv.width !== w2 || cv.height !== h2) { cv.width = w2; cv.height = h2; }

  O.narisovatRazbor(cv, S.izmer, S.granicy, {
    shirinaMm: shirMm,
    vysotaMm: shirMm * (S.izmer.vysotaKShirine || 1),   // высота у всех видов одна
    nalozhenie: S.nalozhenie,
    vidy: vidy.length ? vidy : null,
    sechenie: S.vidy
      ? (S.vidy.teloVrashcheniya
         ? 'по двум видам это тело вращения'
         : 'НЕ тело вращения: ' + Math.round(S.vidy.dolyaNekruglyh*100) +
           '% высоты сбоку в ' + S.vidy.krajnee.toFixed(2) + ' раза ' +
           (S.vidy.krajnee < 1 ? 'уже' : 'шире') + ', чем спереди')
      : 'второго вида нет — сечение не проверено, принято круглое',
  });
}
function pokazatFoto() {
  const m = $('#mini'); m.innerHTML = '';
  S.foto.forEach((f, i) => {
    const fg = document.createElement('figure');
    if (f.izLista) fg.classList.add('sLista');
    if (!f.rol) f.rol = ['speredi','sboku','sverhu'][i] || 'sboku';
    fg.innerHTML = `<img src="${f.url}" alt=""><button class="x">✕</button>
      ${f.izLista ? '<span class="metka">с листа</span>' : ''}
      <figcaption><select class="rol">${Object.entries(O.ROLI).map(([k,v]) =>
        `<option value="${k}"${k===f.rol?' selected':''}>${v.split(' —')[0]}</option>`).join('')}</select></figcaption>`;
    fg.querySelector('.x').onclick = () => { S.foto.splice(i,1); pokazatFoto(); if (S.foto.length) { obmerit(true); peresobrat(); risovatMasku(); } };
    fg.querySelector('.rol').onchange = e => { f.rol = e.target.value; obmerit(true); peresobrat(); risovatMasku(); };
    m.appendChild(fg);
  });
}

// ---------- лист с видами, нарисованный руками ----------
/*
 * Картинку по шаблону проще получить на странице самой нейронки: там рисуют
 * бесплатно, а по ключу тем же моделям нужен биллинг. Значит лист приходит
 * сюда файлом, приложение само находит на нём панели, режет и раздаёт роли,
 * а дальше каждый вид идёт в обычный обмер — наравне со снимком.
 */
function vstavitList(files) {
  const f = [...files].find(x => x.type && x.type.startsWith('image/'));
  if (!f) return skazatOshibku('Нужна картинка листа: JPG, PNG или WEBP.');
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      let r;
      try { r = narezatList(im); }
      catch (e) { return skazatOshibku('Лист не разрезался: ' + e.message); }
      if (!r.paneli.length) return skazatOshibku(r.sboj || 'На листе не нашлось ни одного вида.');
      S.list = { ...r, imya: f.name };
      skazatOshibku('');
      pokazatList();
    };
    im.onerror = () => skazatOshibku('Файл не открылся как картинка.');
    im.src = fr.result;
  };
  fr.readAsDataURL(f);
}

function pokazatList() {
  const box = $('#listVidy'); if (!box) return;
  if (!S.list) { box.innerHTML = ''; $('#listItog').textContent = ''; return; }
  const roli = { ...O.ROLI, propustit: 'Не брать — изометрия или лишнее' };
  box.innerHTML = '';
  S.list.paneli.forEach((p, i) => {
    const fg = document.createElement('figure');
    fg.innerHTML = `<img src="${p.dataUrl}" alt="">
      <figcaption><select class="rol">${Object.entries(roli).map(([k, v]) =>
        `<option value="${k}"${k === p.rol ? ' selected' : ''}>${v.split(' —')[0]}</option>`).join('')}</select></figcaption>`;
    fg.title = 'симметрия ' + p.sym + ', заполнение ' + p.zapoln;
    fg.querySelector('.rol').onchange = e => { p.rol = e.target.value; };
    box.appendChild(fg);
  });
  const setka = S.list.setka || {};
  $('#listItog').textContent =
    `Нашлось ${S.list.paneli.length} панел${S.list.paneli.length === 1 ? 'ь' : 'и'}` +
    (setka.stolbcov ? `, сетка ${setka.stolbcov}×${setka.strok}` : '') +
    '. Проверь роли и нажми «Взять виды».';
}

async function vzyatIzLista() {
  if (!S.list) return skazatOshibku('Сначала загрузи лист.');
  const brat = S.list.paneli.filter(p => p.rol && p.rol !== 'propustit');
  if (!brat.length) return skazatOshibku('Ни один вид не выбран: все роли стоят «не брать».');
  S.foto = S.foto.filter(f => !f.izLista);          // прошлый лист заменяем целиком
  const gotovo = await Promise.all(brat.map(p => new Promise(res => {
    const im = new Image();
    im.onload  = () => res({ url: p.dataUrl, img: im, imya: 'лист: ' + p.rol,
                             b64: p.dataUrl.split(',')[1], mime: 'image/png',
                             rol: p.rol, izLista: true });
    im.onerror = () => res(null);
    im.src = p.dataUrl;
  })));
  gotovo.filter(Boolean).forEach(f => S.foto.push(f));
  pokazatFoto();
  if (obmerit()) { peresobrat(); risovatMasku(); }
  if (S.listOtbroshen) skazatOshibku(
    `Виды с листа отброшены: вид спереди с листа совпал со снимком лишь на ` +
    `${Math.round(S.listOtbroshen.iou*100)}% при пороге ${Math.round(S.listOtbroshen.porog*100)}%. ` +
    `Нейронка нарисовала не эту деталь. Обмер идёт по фотографии.`);
  else if (S.listSovpal != null) skazatOshibku(
    `Виды с листа приняты, совпадение с фотографией ${Math.round(S.listSovpal*100)}%.`, true);
  else skazatOshibku('Виды с листа приняты. Сверить их не с чем — своего снимка спереди нет.', true);
}

function ubratList() {
  S.list = null; S.foto = S.foto.filter(f => !f.izLista);
  pokazatList(); pokazatFoto();
  if (S.foto.length && obmerit(true)) { peresobrat(); risovatMasku(); }
}

// ---------- главный прогон ----------
async function sintez() {
  skazatOshibku(''); shagiSbros();
  if (!S.foto.length) return skazatOshibku(
    'Нет фотографии. Нажми на рамку и выбери файл — вид спереди обязателен, вид сбоку даёт сечение.', true);

  const vkl = LS.vkl, klyuchi = LS.klyuchi, modeli = LS.modeli;
  const kogo = Object.keys(N.POSTAVSHCHIKI).filter(p => vkl[p] && (klyuchi[p]||'').trim());
  const sAlgoritmom = $('#chAlgoritm').checked;
  if (!kogo.length && !sAlgoritmom)
    return skazatOshibku('Некого спрашивать: ни одной нейронки с ключом не включено и голос алгоритма выключен.');

  $('#knSintez').disabled = true;
  try {
    shag('obmer','idet');
    if (!obmerit()) throw new Error('обмер не удался');
    shag('obmer','est');

    if ($('#chVidy').checked) {
      shag('vidy','idet');
      try {
        const r = await dorisovatVidy();
        shag('vidy', r.ok ? 'est' : 'sboj');
        if (!r.ok) skazatOshibku('Нарисованные виды не прошли сверку с фото — ' +
          'разбор идёт по фотографии. Подробности в «Додумано моделью».', false);
      } catch (e) { shag('vidy','sboj'); skazatOshibku(perevesti(e.message)); }
    }

    if ($('#chObjyom').checked) {
      shag('objyom','idet');
      try {
        const r = await dostroitPoObjyomu();
        shag('objyom', r.ok ? 'est' : 'sboj');
      } catch (e) { shag('objyom','sboj'); skazatOshibku(perevesti(e.message)); }
    }

    S.varianty = [];
    if (sAlgoritmom) { const a = razborAlgoritmom(); if (a) S.varianty.push(a); }

    if (kogo.length) {
      shag('razbor','idet');
      const hvost = [];
      const o = $('#pOpisanie').value.trim(); if (o) hvost.push('Описание из каталога: ' + o);
      const p = $('#pPodskazka').value.trim(); if (p) hvost.push('Подсказка от заказчика: ' + p);
      hvost.push('Обмер силуэта, 40 полос сверху вниз: ' + S.izmer.polosy.map(v=>v.toFixed(2)).join(', '));
      hvost.push('Высота к ширине: ' + S.izmer.vysotaKShirine);
      if (S.izmer.zapoln) {
        hvost.push('Доля материала внутри огибающей по тем же полосам ' +
          '(1.00 — сплошное сечение, меньше — между кусками есть просвет): ' +
          S.izmer.zapoln.map(v => v.toFixed(2)).join(', '));
        const kus = S.izmer.runs.map(r => r.length);
        hvost.push('Сколько отдельных кусков материала видно в полосе: ' + kus.join(', '));
      }
      if (S.izmer.otverstie) hvost.push('На снимке видна сквозная дырка шириной ' +
        Math.round(S.izmer.otverstie.dolyaD*100) + '% от ширины детали');
      const kat = katalog();
      if (kat.shirinaMm) hvost.push('Каталог: самое широкое место ' + kat.shirinaMm + ' мм');
      if (kat.dlinaShtoka) hvost.push('Каталог: длина штока ' + kat.dlinaShtoka + ' мм');
      const dop = hvost.join('\n');

      const otvety = await Promise.all(kogo.map(async post => {
        const model = modeli[post] || N.POSTAVSHCHIKI[post].modeli[0];
        try {
          if (!model) throw new Error('не задано имя модели — впиши его в «Нейронки и ключи»');
          const r = await N.razobrat(post, klyuchi[post].trim(), model, svoiFoto(), dop,
                                     (LS.adresa[post] || N.POSTAVSHCHIKI[post].adresPoUmolchaniyu || '').trim());
          r.ves = 1; S.rashod.push({ istochnik:r.istochnik, post, model, rashod:r.rashod });
          return r;
        } catch (e) {
          return { istochnik:N.POSTAVSHCHIKI[post].imya, post, model, tela:[], sboj:e.message };
        }
      }));
      otvety.forEach(r => S.varianty.push(r));
      const zhivyh = otvety.filter(r => r.tela && r.tela.length).length;
      shag('razbor', zhivyh ? 'est' : 'sboj');
      if (!zhivyh && !sAlgoritmom) {
        const prichiny = otvety.map(r => r.sboj).filter(Boolean).join(' · ');
        throw new Error(prichiny || 'ни одна нейронка не ответила');
      }
    }

    shag('svod','idet');
    ocenitVariantySiluetom(S.varianty);
    S.svod = svesti(S.varianty.filter(v => v.tela && v.tela.length));
    S.tela = S.svod.tela;
    if (!S.tela.length) throw new Error('ни один источник не дал тел');
    $('#znIstochnik').textContent = S.svod.istochnikov > 1 ? S.svod.istochnikov + ' источника' : (S.varianty[0]?.post || 'алгоритм');
    shag('svod','est');

    shag('sborka','idet');
    pokazatKuski(); peresobrat(); pokazatSravnenie();
    shag('sborka','est');

    if ($('#chList').checked) {
      shag('list','idet');
      const ris = LS.risovalka;
      const gk = (LS.klyuchi[ris.post === 'svoj' ? 'svoj' : ris.post]||'').trim();
      const sh = S.shablon || LS.shablon;
      if (!gk) { shag('list','sboj'); skazatOshibku('Для листа картинкой нужен ключ: ' +
        (N.RISOVALKI[ris.post]?.imya || ris.post) + '.'); }
      else if (!sh) { shag('list','sboj'); skazatOshibku('Нет шаблона вёрстки — положи его в настройках.'); }
      else try {
        const r2 = ris.post === 'gemini'
          ? await N.narisovatList(gk, LS.modelKartinki, sh, svoiFoto()[0], promtKartinki(S.tela))
          : await N.narisovatCherez(ris.post, gk, LS.modelKartinki, [sh, svoiFoto()[0]],
                                    promtKartinki(S.tela), ris.adres);
        S.nejro = r2.kartinka;
        S.rashod.push({ istochnik:'картинка', post:ris.post, model:LS.modelKartinki, kartinok:1 });
        $('#nejroList').innerHTML = `<img src="${S.nejro}" style="width:100%">`;
        shag('list','est');
      } catch (e) { shag('list','sboj'); skazatOshibku(perevesti(e.message)); }
    }
    zapisatVIstoriyu(); pokazatRashod();
  } catch (e) {
    console.error(e);
    $$('.shagi li.idet').forEach(l => { l.classList.remove('idet'); l.classList.add('sboj'); });
    skazatOshibku('Не вышло: ' + perevesti(e.message || String(e)));
    pokazatSravnenie();
  } finally { $('#knSintez').disabled = false; }
}

function perevesti(m) {
  if (/API key not valid|API_KEY_INVALID|invalid_api_key|authentication/i.test(m))
    return 'ключ не принят. Открой «Нейронки и ключи» и нажми «Проверить».';
  if (/quota|RESOURCE_EXHAUSTED|429|insufficient_quota/i.test(m))
    return 'отказ по квоте. Для картинок нужен биллинг на ключе; разбор при этом работает. ' +
           'Лист бери на вкладке «Лист разбора» — он строится из нашей модели бесплатно.';
  if (/not found|404|model/i.test(m) && /model/i.test(m))
    return 'такой модели у ключа нет — проверь список в настройках.';
  if (/Failed to fetch|NetworkError|сеть не пустила/i.test(m))
    return 'сеть не пустила запрос. Проверь интернет, VPN и блокировщики.';
  return m;
}

// ---------- история ----------
function zapisatVIstoriyu() {
  const ist = LS.istoria;
  ist.unshift({ kogda:new Date().toISOString(), nomer:$('#pNomer').value || 'без номера',
    tela:S.tela, izmer:{ ...S.izmer, _predpokaz:undefined }, katalog:katalog(),
    opisanie:$('#pOpisanie').value, material:$('#pMaterial').value,
    els:S.els.map(e => ({ kind:e.kind, params:e.params })),
    istochnikov:S.svod?.istochnikov || 1 });
  LS.istoria = ist; pokazatIstoriyu();
}
function pokazatIstoriyu() {
  const h = $('#istoria'), ist = LS.istoria;
  if (!ist.length) { h.innerHTML = '<div class="tiho">пока пусто</div>'; return; }
  h.innerHTML = '';
  ist.forEach(z => {
    const d = document.createElement('div'); d.className = 'zapis';
    d.innerHTML = `<div><b>${z.nomer}</b><div class="d">${new Date(z.kogda).toLocaleString('ru')} · ${z.els.length} эл.</div></div>
                   <span class="prav metka m-v">открыть</span>`;
    d.onclick = () => {
      S.tela = z.tela; S.izmer = z.izmer; S.svod = null; S.varianty = [];
      $('#pNomer').value = z.nomer === 'без номера' ? '' : z.nomer;
      $('#pOpisanie').value = z.opisanie || ''; $('#pMaterial').value = z.material || '';
      $('#pGolova').value = z.katalog?.shirinaMm || ''; $('#pOtverstie').value = z.katalog?.otverstie || '';
      $('#pShtok').value = z.katalog?.dlinaShtoka || '';
      pokazatKuski(); peresobrat();
    };
    h.appendChild(d);
  });
}

// ---------- настройки нейронок ----------
function pokazatPostavshchikov() {
  const c = $('#postavshchiki'); c.innerHTML = '';
  const klyuchi = LS.klyuchi, modeli = LS.modeli, vkl = LS.vkl;
  for (const [id, p] of Object.entries(N.POSTAVSHCHIKI)) {
    const d = document.createElement('div'); d.className = 'postavshchik';
    d.innerHTML = `
      <div class="verh"><span class="tochka ${klyuchi[id]?'est':''}" data-t></span><b>${p.imya}</b>
        <div class="prav">
          <label class="stroka" style="margin:0"><input type="checkbox" data-vkl ${vkl[id]?'checked':''}> спрашивать</label>
          <button class="knopka mal" data-pr>Проверить</button></div></div>
      <div class="para">
        <div class="pole"><label>Ключ</label>
          <input type="password" data-klyuch value="${(klyuchi[id]||'').replace(/"/g,'&quot;')}" placeholder="вставь ключ" autocomplete="off"></div>
        <div class="pole"><label>Модель</label>
          ${p.svoyAdres && !p.modeli.length
            ? `<input type="text" data-modelsvoj value="${(modeli[id]||'').replace(/"/g,'&quot;')}" placeholder="имя модели">`
            : `<select data-model>${p.modeli.map(m=>`<option${m===(modeli[id]||p.modeli[0])?' selected':''}>${m}</option>`).join('')}</select>`}</div>
      </div>
      ${p.svoyAdres ? `<div class="pole" style="margin-top:7px"><label>Адрес API</label>
        <input type="text" data-adres value="${(LS.adresa[id]||p.adresPoUmolchaniyu||'').replace(/"/g,'&quot;')}"
               placeholder="${p.adresPoUmolchaniyu || 'https://свой-сервер/v1'}"></div>` : ''}
      <div class="podskazka">${p.podskazka
        ? p.podskazka + (p.gdeKlyuch ? ` <a href="${p.gdeKlyuch}" target="_blank" rel="noopener">открыть</a>` : '')
        : p.svoyAdres
        ? 'Любой сервис с методом <b>/chat/completions</b> как у OpenAI. Адрес — до /chat/completions, например <b>https://хост/v1</b>. Ключ хранится только в этом браузере.'
        : `Ключ: <a href="${p.gdeKlyuch}" target="_blank" rel="noopener">${p.gdeKlyuch.replace('https://','')}</a>`}</div>
      <div data-otvet></div>`;
    d.querySelector('[data-klyuch]').oninput = e => {
      const k = LS.klyuchi; k[id] = e.target.value.trim(); LS.klyuchi = k;
      d.querySelector('[data-t]').className = 'tochka ' + (k[id] ? 'est' : '');
      d.querySelector('[data-otvet]').innerHTML = '';
      obnovitKtoSprashivat();
    };
    const polModeli = d.querySelector('[data-model]') || d.querySelector('[data-modelsvoj]');
    polModeli.oninput = polModeli.onchange = e => {
      const m = LS.modeli; m[id] = e.target.value; LS.modeli = m; obnovitKtoSprashivat(); };
    const polAdres = d.querySelector('[data-adres]');
    if (polAdres && !LS.adresa[id] && p.adresPoUmolchaniyu) {
      const a = LS.adresa; a[id] = p.adresPoUmolchaniyu; LS.adresa = a;
    }
    if (polAdres) polAdres.oninput = e => {
      const a = LS.adresa; a[id] = e.target.value.trim(); LS.adresa = a;
      d.querySelector('[data-otvet]').innerHTML = ''; };
    d.querySelector('[data-vkl]').onchange = e => { const v = LS.vkl; v[id] = e.target.checked; LS.vkl = v; obnovitKtoSprashivat(); };
    d.querySelector('[data-pr]').onclick = async ev => {
      const b = ev.target, o = d.querySelector('[data-otvet]');
      b.disabled = true; o.innerHTML = '<div class="podskazka">Спрашиваю…</div>';
      const r = await N.proverit(id, (LS.klyuchi[id]||'').trim(),
                                 LS.modeli[id] || p.modeli[0],
                                 (LS.adresa[id] || p.adresPoUmolchaniyu || '').trim());
      o.innerHTML = r.ok ? `<div class="itog" style="margin-top:7px"><div class="krug">✓</div><div>${r.tekst}</div></div>`
                         : `<div class="oshibka" style="margin-top:7px">${r.tekst}</div>`;
      const sel = d.querySelector('[data-model]');
      if (r.modeli?.length && sel) {
        // показываем ВЕСЬ список ключа: сначала те, что мы рекомендуем,
        // потом остальные — их у Google десятки и они меняются
        const bylo = sel.value;
        const svoi = p.modeli.filter(m => r.modeli.includes(m));
        const nabor = [...svoi, ...r.modeli.filter(m => !svoi.includes(m))];
        sel.innerHTML = nabor.map(m => `<option${m===bylo?' selected':''}>${m}</option>`).join('');
        if (!nabor.includes(bylo)) { const m2 = LS.modeli; m2[id] = sel.value; LS.modeli = m2; obnovitKtoSprashivat(); }
      }
      if (r.kartinki?.length) {
        const sk = $('#nModelKartinka'), bylo = LS.modelKartinki;
        sk.innerHTML = r.kartinki.map(m => `<option${m===bylo?' selected':''}>${m}</option>`).join('');
        if (!r.kartinki.includes(bylo)) LS.modelKartinki = sk.value;
      }
      b.disabled = false;
    };
    c.appendChild(d);
  }
}
function pokazatRisovalku() {
  const r = LS.risovalka;
  $('#nRisovalka').innerHTML = Object.entries(N.RISOVALKI)
    .map(([k,v]) => `<option value="${k}"${k===r.post?' selected':''}>${v.imya}</option>`).join('');
  const spisok = N.RISOVALKI[r.post]?.modeli || [];
  const sel = $('#nModelKartinka');
  sel.innerHTML = spisok.map(m=>`<option${m===LS.modelKartinki?' selected':''}>${m}</option>`).join('');
  if (spisok.length && !spisok.includes(LS.modelKartinki)) {
    LS.modelKartinki = spisok[0]; sel.value = spisok[0];
  }
  $('#poleRisAdres').hidden = r.post !== 'svoj';
  $('#nRisAdres').value = r.adres || '';
}

function pokazatObjyom() {
  const c = $('#objyomNastrojki'); if (!c) return;
  const n = LS.objyom, p = OB.POSTAVSHCHIKI_OBJYOMA[n.post] || OB.POSTAVSHCHIKI_OBJYOMA.fal;
  c.innerHTML = `
    <div class="postavshchik">
      <div class="verh"><span class="tochka ${n.klyuch?'est':''}"></span><b>${p.imya}</b></div>
      <div class="para">
        <div class="pole"><label>Сервис</label><select data-o="post">${
          Object.entries(OB.POSTAVSHCHIKI_OBJYOMA).map(([k,x]) =>
            `<option value="${k}"${k===n.post?' selected':''}>${x.imya}</option>`).join('')}</select></div>
        <div class="pole"><label>Модель</label>${
          p.modeli.length
            ? `<select data-o="model">${p.modeli.map(m=>`<option${m===n.model?' selected':''}>${m}</option>`).join('')}</select>`
            : `<input type="text" data-o="model" value="${(n.model||'').replace(/"/g,'&quot;')}" placeholder="путь модели">`}</div>
      </div>
      <div class="para" style="margin-top:7px">
        <div class="pole"><label>Ключ</label>
          <input type="password" data-o="klyuch" value="${(n.klyuch||'').replace(/"/g,'&quot;')}" autocomplete="off" placeholder="ключ сервиса"></div>
        <div class="pole"><label>Адрес (свой прокси)</label>
          <input type="text" data-o="adres" value="${(n.adres||p.adresPoUmolchaniyu||'').replace(/"/g,'&quot;')}" placeholder="${p.adresPoUmolchaniyu||'https://свой-сервер'}"></div>
      </div>
      <div class="podskazka">${p.podskazka}${p.gdeKlyuch ? ` <a href="${p.gdeKlyuch}" target="_blank" rel="noopener">получить ключ</a>` : ''}</div>
    </div>`;
  c.querySelectorAll('[data-o]').forEach(el => {
    const sob = el.tagName === 'SELECT' ? 'onchange' : 'oninput';
    el[sob] = e => {
      const o = LS.objyom; o[e.target.dataset.o] = e.target.value.trim(); LS.objyom = o;
      if (e.target.dataset.o === 'post') { o.model = ''; o.adres = ''; LS.objyom = o; pokazatObjyom(); }
    };
  });
}

function obnovitKtoSprashivat() {
  const k = $('#ktoSprashivat'); const klyuchi = LS.klyuchi, vkl = LS.vkl, modeli = LS.modeli;
  k.innerHTML = Object.entries(N.POSTAVSHCHIKI).map(([id,p]) => {
    const est = !!(klyuchi[id]||'').trim();
    return `<label class="stroka"><input type="checkbox" data-p="${id}" ${vkl[id]&&est?'checked':''} ${est?'':'disabled'}>
      <span class="tochka ${est?'est':''}"></span>${p.imya}
      <span class="klyuch">${est ? (modeli[id]||p.modeli[0]||'модель не задана') : 'нет ключа'}</span></label>`;
  }).join('');
  k.querySelectorAll('input[data-p]').forEach(i => i.onchange = e => {
    const v = LS.vkl; v[e.target.dataset.p] = e.target.checked; LS.vkl = v; obnovitKtoSprashivat();
  });
}

// ---------- справочник ----------
function pokazatSpravochnik() {
  const s = $('#elSetka'); s.innerHTML = '';
  $('#skolkoEl').textContent = ` — ${SPISOK.length} элементов`;
  $('#knSpravochnik').textContent = `Справочник (${SPISOK.length})`;
  for (const k of SPISOK) {
    const e = ELEMENTY[k];
    s.insertAdjacentHTML('beforeend',
      `<div class="el-karta"><b>${e.imya}</b><span class="klyuch">${k} · ${e.zona}</span>
       <div class="klyuch">${Object.entries(e.p).map(([a,b])=>a+' '+b).join(', ')}</div></div>`);
  }
}

/**
 * Объективная оценка каждого источника: собрать его разбор в модель и померить,
 * насколько силуэт лёг на снимок. Голос того, кто ближе к фото, весит больше.
 */
function ocenitVariantySiluetom(varianty) {
  if (!S.izmer) return;
  let vidyM; try { vidyM = maskiVidov(); } catch { return; }
  for (const v of varianty) {
    if (!v.tela || !v.tela.length) continue;
    try {
      const g = geomRecepta(sobrat(v.tela, S.izmer, masshtab(katalog(), S.izmer, v.tela).mm, S.vidy).els).celoe;
      const sv = SIL.sravnitVidy(vidyM, g, 140, 180);
      if (g && g.dispose) g.dispose();
      if (sv) { v.iou = sv.iou; v.ves = (v.ves || 1) * (0.6 + 0.8*sv.iou); }
    } catch {}
  }
}

// ---------- подгонка по снимку ----------
const TYANEM_MM = ['d','dLow','dCore','dBore','len','t','t2','h','w','l','span','wing',
                   'core','spread','foot','s','okno','gap','barbD','dep','slot','slotW','bore'];

async function podognatPoFoto() {
  if (!S.els.length || !S.izmer) { skazatOshibku('Сначала собери модель по фото.', true); return; }
  const kn = $('#knPodognat'), bylo = kn.textContent;
  kn.disabled = true; kn.textContent = 'Подгоняю…';
  await new Promise(r => setTimeout(r, 30));
  try {
    const r = SIL.podognatPoFoto(S.els, maskiVidov(), spisok => geomRecepta(spisok).celoe);
    if (r.stalo > r.bylo + 0.002) {
      // совпадение силуэта считается с нормировкой по ширине, поэтому подгонка
      // может незаметно раздуть или сжать всю деталь. Возвращаем габарит на
      // место равномерным масштабом — форма от этого не меняется.
      const novye = S.els.map((e, i) => Object.assign({}, e, { params: r.els[i].params }));
      const bylG = summarno(S.els).shirina, stalG = summarno(novye).shirina;
      const k = stalG > 0.01 ? bylG / stalG : 1;
      if (Math.abs(k - 1) > 0.005) for (const e of novye)
        for (const kl of Object.keys(e.params))
          if (typeof e.params[kl] === 'number' && TYANEM_MM.includes(kl))
            e.params[kl] = Math.round(e.params[kl] * k * 100) / 100;
      S.els = novye;
      S.zam = S.zam.concat(['размеры подогнаны по силуэту: совпадение ' +
        Math.round(r.bylo*100) + '% → ' + Math.round(r.stalo*100) + '% (' + r.shagov + ' проб)']);
      pererisovat(); pokazatRezultat(); pokazatKuski();
      vkladka('maska');
    } else {
      skazatOshibku('Лучше не стало — модель уже настолько близка к снимку, ' +
                    'насколько позволяют выбранные элементы (' + Math.round(r.bylo*100) + '%).', true);
    }
  } catch (e) { skazatOshibku('Подгонка не вышла: ' + e.message); }
  kn.disabled = false; kn.textContent = bylo;
}

// ---------- вкладки ----------
function vkladka(v) {
  $$('.vkladki button').forEach(b => b.classList.toggle('akt', b.dataset.vid === v));
  $('#scena3d').hidden = v !== 'model';
  $('#chertyozh').hidden = v !== 'chertyozh';
  $('#listRazbora').hidden = v !== 'razbor';
  $('#holstMaski').hidden = v !== 'maska';
  $('#nejroList').hidden = v !== 'nejro';
  $('#sravnenieVid').hidden = v !== 'sravnenie';
  if (v === 'sravnenie') pokazatSravnenie();
  if (v === 'maska') risovatMasku();
  if (v === 'model') razmer3d();
  const t = { model:'ЛКМ — вращение · колесо — зум · ПКМ — сдвиг',
    maska:'Слева — что принято за деталь, в центре — профиль с просветами, справа — силуэт модели поверх снимка',
    nejro: S.nejro ? '' : 'Лист нейронкой не запрашивался — поставь галочку и синтезируй заново',
    sravnenie:'Что ответил каждый источник и где они разошлись' };
  $('#upravlenie').textContent = t[v] || '';
}

// ---------- шаблон ----------
function pokazatShablon(sh) {
  $('#miniShablon').innerHTML = `<figure><img src="data:${sh.mime};base64,${sh.b64}"></figure>`;
}
async function shablonPoUmolchaniyu() {
  try {
    const r = await fetch('shablon/shablon_verstki.png'); if (!r.ok) return;
    const b = await r.blob();
    const b64 = await new Promise(res => { const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b); });
    S.shablon = { b64, mime:'image/png' };
    try { LS.shablon = S.shablon; } catch {}
    pokazatShablon(S.shablon);
  } catch {}
}

// ---------- запуск ----------
function start() {
  plotnost(LS.plotnost);
  scenaInit(); pokazatIstoriyu(); pokazatSpravochnik(); pokazatRezultat();
  pokazatPostavshchikov(); pokazatObjyom(); obnovitKtoSprashivat();

  // выпадающие списки методов
  $('#oMaska').innerHTML = Object.entries(A.METODY_MASKI).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#oKomponenta').innerHTML = Object.entries(O.METODY_KOMPONENTY).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#oOs').innerHTML = Object.entries(O.METODY_OSI).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  pokazatRisovalku();
  const obr = LS.obr;
  if (obr.maska) $('#oMaska').value = obr.maska;
  if (obr.komponenta) $('#oKomponenta').value = obr.komponenta;
  if (obr.os) $('#oOs').value = obr.os;
  if (obr.chistka) $('#oChistka').value = obr.chistka;
  if (obr.radius) $('#oRadius').value = obr.radius;
  if (obr.dyry != null) $('#oDyry').checked = obr.dyry;
  if (obr.chuvst != null) $('#oChuvst').value = obr.chuvst;
  $('#znChuvst').textContent = (+$('#oChuvst').value).toFixed(2);

  if (LS.shablon) { S.shablon = LS.shablon; pokazatShablon(S.shablon); } else shablonPoUmolchaniyu();

  const drop = $('#drop'), fajly = $('#fajly');
  drop.onclick = () => fajly.click();
  fajly.onchange = () => vstavitFoto(fajly.files);
  ['dragenter','dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('nad'); }));
  ['dragleave','drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('nad'); }));
  drop.addEventListener('drop', async ev => {
    const dt = ev.dataTransfer;
    if (dt.files?.length) return vstavitFoto(dt.files);
    const ssylka = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim();
    if (/^https?:\/\//.test(ssylka)) {
      skazatOshibku('Тяну картинку по ссылке…');
      try {
        const r = await fetch(ssylka, { mode:'cors' }); const b = await r.blob();
        if (!b.type.startsWith('image/')) throw new Error('не картинка');
        return vstavitFoto([new File([b], 'so-stranicy.png', { type:b.type })]);
      } catch { return skazatOshibku('Сайт не отдал картинку. Сохрани её на диск и перетащи файл.'); }
    }
    vstavitFoto([]);
  });

  const dropL = $('#dropList'), fajlList = $('#fajlList');
  if (dropL) {
    dropL.onclick = () => fajlList.click();
    fajlList.onchange = () => vstavitList(fajlList.files);
    ['dragenter','dragover'].forEach(e => dropL.addEventListener(e, ev => {
      ev.preventDefault(); dropL.classList.add('nad'); }));
    ['dragleave','drop'].forEach(e => dropL.addEventListener(e, ev => {
      ev.preventDefault(); dropL.classList.remove('nad'); }));
    dropL.addEventListener('drop', ev => {
      if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length)
        vstavitList(ev.dataTransfer.files);
    });
    $('#knVzyatVidy').onclick = vzyatIzLista;
    $('#knUbratList').onclick = ubratList;
  }
  addEventListener('paste', ev => { if (ev.clipboardData?.files?.length) vstavitFoto(ev.clipboardData.files); });

  $('#knSintez').onclick = sintez;
  $('#chVidy').onchange = e => { $('#poleVidy').hidden = !e.target.checked && !$('#chObjyom').checked; };
  $('#chObjyom').onchange = e => { $('#poleVidy').hidden = !e.target.checked && !$('#chVidy').checked; };
  $('#oPorogVida').oninput = e => { $('#znPorogVida').textContent = Math.round(e.target.value*100) + '%'; };
  $('#knPereschitat').onclick = peresobrat;
  $('#knPodognat').onclick = podognatPoFoto;
  $('#knObmerit').onclick = () => {
    zapomnitObrabotku();
    if (!obmerit()) return;
    const a = razborAlgoritmom();
    if (a) { S.varianty = [a]; S.svod = svesti([a]); S.tela = S.svod.tela;
             $('#znIstochnik').textContent = 'алгоритм';
             pokazatKuski(); peresobrat(); pokazatSravnenie(); }
    vkladka('maska');
  };
  ['#oMaska','#oKomponenta','#oOs','#oChistka','#oRadius','#oDyry','#oPometki'].forEach(s =>
    $(s).addEventListener('change', () => { zapomnitObrabotku(); if (S.foto.length) { obmerit(true); risovatMasku(); } }));
  $('#oChuvst').addEventListener('input', e => $('#znChuvst').textContent = (+e.target.value).toFixed(2));
  $('#oChuvst').addEventListener('change', () => { zapomnitObrabotku(); if (S.izmer) $('#knObmerit').click(); });

  $$('.vkladki button').forEach(b => b.onclick = () => vkladka(b.dataset.vid));
  ['#pGolova','#pOtverstie','#pShtok'].forEach(s => $(s).addEventListener('change', peresobrat));

  $('#knMenshe').onclick = () => plotnost(LS.plotnost - 0.06);
  $('#knBolshe').onclick = () => plotnost(LS.plotnost + 0.06);
  $('#knLevo').onclick = () => { document.body.classList.toggle('bez-levoj'); setTimeout(razmer3d,220); };
  $('#knPravo').onclick = () => { document.body.classList.toggle('bez-pravoj'); setTimeout(razmer3d,220); };
  $$('.rejka button').forEach(b => b.onclick = () => {
    document.body.classList.remove(b.dataset.otkryt === 'levo' ? 'bez-levoj' : 'bez-pravoj');
    setTimeout(razmer3d,220);
  });

  $('#knDobavit').onclick = () => {
    S.tela.push({ nomer:S.tela.length+1, tip:'shejka', sechenie:'krugloe', rebra:0, zubcov:0,
      napravlenieZubcov:'net', dolyaVysoty:0.1, dolyaShiriny:0.5, suzhaetsya:'net',
      opisanie:'новый кусок', uverennost:0.5 });
    if (!S.izmer) {
      // без снимка мерить нечего: профиль ставится ровным, и об этом честно
      // сказано — раньше здесь подставлялся конус, и деталь «строилась» из него
      S.izmer = { os:'вертикально', cvet:[74,132,92], vysotaKShirine:1.4,
        zapolnennost:.5, polosy:Array.from({length:40},()=>1), bezSnimka:true };
      skazatOshibku('Снимка нет — профиль ровный, все размеры придётся вписать руками.', true);
    }
    pokazatKuski(); peresobrat();
  };

  $('#knNastrojki').onclick = () => $('#oknoNastroek').showModal();
  $('#knZakrytNastrojki').onclick = () => $('#oknoNastroek').close();
  $('#knSpravochnik').onclick = () => $('#oknoSpravochnika').showModal();
  $('#knZakrytSpravochnik').onclick = () => $('#oknoSpravochnika').close();
  $('#nModelKartinka').onchange = e => LS.modelKartinki = e.target.value;
  $('#nRisovalka').onchange = e => { const r = LS.risovalka; r.post = e.target.value; LS.risovalka = r;
    const m = N.RISOVALKI[r.post]?.modeli || []; if (m.length) LS.modelKartinki = m[0];
    pokazatRisovalku(); };
  $('#nRisAdres').oninput = e => { const r = LS.risovalka; r.adres = e.target.value.trim(); LS.risovalka = r; };
  $('#nShablon').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { S.shablon = { b64:fr.result.split(',')[1], mime:f.type };
      LS.shablon = S.shablon; pokazatShablon(S.shablon); };
    fr.readAsDataURL(f);
  };

  $('#knKopirovat').onclick = async () => {
    await navigator.clipboard.writeText($('#jsonVyhod').textContent);
    $('#knKopirovat').textContent = 'Скопировано';
    setTimeout(() => $('#knKopirovat').textContent = 'Скопировать', 1200);
  };
  const imyaFajla = h => (($('#pNomer').value || 'klipsa').replace(/\s+/g,'_') + h);
  const vBolshom = (cv, w, h) => {
    const sw = cv.width, sh = cv.height;
    cv.width = w; cv.height = h; pererisovat();
    return new Promise(res => cv.toBlob(b => { cv.width = sw; cv.height = sh; pererisovat(); res(b); }));
  };
  $('#knStl').onclick = () => { if (!S.els.length) return;
    skachat(vStl(geomRecepta(S.els).celoe, $('#pNomer').value), imyaFajla('.stl')); };
  $('#knPng').onclick = async () => { if (!S.els.length) return;
    skachat(await vBolshom($('#chertyozh'), 2000, 1400), imyaFajla('_chertyozh.png')); };
  $('#knList').onclick = async () => { if (!S.els.length) return;
    skachat(await vBolshom($('#listRazbora'), 2200, 1240), imyaFajla('_list.png')); };
  $('#knNejro').onclick = () => { if (!S.nejro) return;
    fetch(S.nejro).then(r=>r.blob()).then(b => skachat(b, imyaFajla('_list_nejronki.png'))); };
  $('#knVygruzit').onclick = () => {
    const d = LS.istoria.reduce((a,z) => { a[z.nomer] = z.els.map(e => [e.kind, e.params]); return a; }, {});
    skachat(new Blob([JSON.stringify(d,null,1)],{type:'application/json'}), 'recepty.json');
  };
  $('#knOchistit').onclick = () => { if (confirm('Стереть историю разборов?')) { LS.istoria = []; pokazatIstoriyu(); } };

  vkladka('model');
  window.__S = S;   // для отладки: видно состояние из консоли браузера
}
start();
