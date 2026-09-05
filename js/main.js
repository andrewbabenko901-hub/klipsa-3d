import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ELEMENTY, SPISOK, geometriya, vysota } from './elementy.js';
import { slozhit } from './geom.js';
import { obmerit } from './obmer.js';
import { sobrat, podognat, summarno, KARTA, elementDlya } from './sborka.js';
import * as G from './gemini.js';
import { chertyozh, listRazbora } from './vidy.js';
import { vStl, skachat } from './stl.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const S = {
  foto: [], izmer: null, tela: [], els: [], zam: [],
  shablon: null, nejro: null, rashod: { vhod:0, vyhod:0, kartinok:0 },
};

// ---------- хранилище ----------
const LS = {
  get k(){ return localStorage.getItem('klipsa.klyuch') || ''; },
  set k(v){ localStorage.setItem('klipsa.klyuch', v); },
  get mr(){ return localStorage.getItem('klipsa.modelRazbor') || 'gemini-3.5-flash-lite'; },
  set mr(v){ localStorage.setItem('klipsa.modelRazbor', v); },
  get mk(){ return localStorage.getItem('klipsa.modelKartinka') || 'gemini-3.1-flash-image'; },
  set mk(v){ localStorage.setItem('klipsa.modelKartinka', v); },
  get sh(){ try { return JSON.parse(localStorage.getItem('klipsa.shablon') || 'null'); } catch { return null; } },
  set sh(v){ try { localStorage.setItem('klipsa.shablon', JSON.stringify(v)); } catch {} },
  get ist(){ try { return JSON.parse(localStorage.getItem('klipsa.istoria') || '[]'); } catch { return []; } },
  set ist(v){ try { localStorage.setItem('klipsa.istoria', JSON.stringify(v.slice(0, 40))); } catch {} },
};

// ---------- сцена ----------
let ren, scena, kamera, upr, setkaPola, telo3d;
function scenaInit() {
  const el = $('#scena');
  ren = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
  ren.setPixelRatio(Math.min(devicePixelRatio, 2));
  ren.setSize(el.clientWidth, el.clientHeight);
  el.appendChild(ren.domElement);
  scena = new THREE.Scene(); scena.background = new THREE.Color(0x0b1512);
  kamera = new THREE.PerspectiveCamera(38, el.clientWidth/el.clientHeight, 0.1, 4000);
  kamera.position.set(38, 26, 46);
  upr = new OrbitControls(kamera, ren.domElement); upr.enableDamping = true;
  scena.add(new THREE.HemisphereLight(0xd8ffe8, 0x0a1a12, 1.15));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.5); d1.position.set(24, 40, 30); scena.add(d1);
  const d2 = new THREE.DirectionalLight(0x9fd8bb, .5); d2.position.set(-30, 12, -20); scena.add(d2);
  setkaPola = new THREE.GridHelper(120, 24, 0x1d3227, 0x152219); scena.add(setkaPola);
  new ResizeObserver(() => {
    if (!el.clientWidth) return;
    ren.setSize(el.clientWidth, el.clientHeight);
    kamera.aspect = el.clientWidth/el.clientHeight; kamera.updateProjectionMatrix();
  }).observe(el);
  (function tick(){ requestAnimationFrame(tick); upr.update(); ren.render(scena, kamera); })();
}

function pokazatModel(geom) {
  if (telo3d) { scena.remove(telo3d); telo3d.geometry.dispose(); telo3d.material.dispose(); telo3d = null; }
  if (!geom) return;
  const mat = new THREE.MeshStandardMaterial({ color:0x3d8f63, roughness:.55, metalness:.06,
                                               side:THREE.DoubleSide, flatShading:false });
  telo3d = new THREE.Mesh(geom, mat);
  geom.computeBoundingBox();
  const bb = geom.boundingBox, c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3());
  telo3d.position.set(-c.x, -bb.min.y, -c.z);
  scena.add(telo3d);
  const d = Math.max(r.x, r.y, r.z) || 10;
  setkaPola.scale.setScalar(Math.max(0.25, d/40));
  kamera.position.set(d*1.5, d*1.15, d*1.8);
  upr.target.set(0, r.y/2, 0); upr.update();
}

// ---------- геометрия рецепта ----------
function geomRecepta(els) {
  const kuski = [], celoe = [];
  let y = 0;
  for (const e of els) {
    const g = geometriya(e.kind, e.params);
    const h = vysota(e.kind, e.params);
    if (g) {
      const otdelno = g.clone(); kuski.push(otdelno);
      const v = g.clone(); v.translate(0, y, 0); celoe.push(v);
    } else kuski.push(null);
    y -= h;
  }
  return { celoe: slozhit(celoe.filter(Boolean)), kuski };
}

// ---------- рисование ----------
function pererisovat() {
  if (!S.els.length) { pokazatModel(null); return; }
  const { celoe, kuski } = geomRecepta(S.els);
  pokazatModel(celoe);
  const gab = summarno(S.els);
  chertyozh($('#chertyozh'), celoe, {
    nomer: $('#pNomer').value || '—',
    material: $('#pMaterial').value || 'пластик',
    elementov: S.els.length, vysota: gab.vysota, shirina: gab.shirina,
    cvet: [70, 128, 90],
  });
  listRazbora($('#listRazbora'), celoe, kuski.filter(Boolean), [74, 132, 92]);
}

// ---------- панель результата ----------
const UVER = u => u >= 0.75 ? ['m-v','высокая'] : u >= 0.55 ? ['m-s','средняя'] : ['m-n','низкая'];

function pokazatRezultat() {
  const est = S.els.length > 0;
  const it = $('#itog');
  it.classList.toggle('ploho', !est);
  it.querySelector('.krug').textContent = est ? '✓' : '·';
  it.querySelector('b').textContent = est ? 'Собирается в конструкторе' : 'Пока пусто';
  $('#itogPod').textContent = est
    ? `Элементов: ${S.els.length} · высота ${summarno(S.els).vysota} мм · ширина ${summarno(S.els).shirina} мм`
    : 'Модель ещё не собрана';

  const tb = $('#tabSopost').querySelector('tbody');
  tb.innerHTML = est ? '<tr><th>№</th><th>Примитив</th><th>Элемент</th><th>Параметры, мм</th><th>Увер.</th></tr>' : '';
  S.els.forEach((e, i) => {
    const t = e.primitiv || {}, el = ELEMENTY[e.kind] || {};
    const [kl, txt] = UVER(t.uverennost ?? 0.8);
    const par = Object.entries(e.params)
      .filter(([k]) => !['drive','nasechki','plecho','poyas'].includes(k))
      .map(([k, v]) => `${k} ${v}`).join(', ');
    tb.insertAdjacentHTML('beforeend',
      `<tr><td>${i+1}</td><td>${t.opisanie || t.tip || '—'}<div class="klyuch">${t.sechenie || ''}</div></td>
       <td>${el.imya || e.kind}<div class="klyuch">${e.kind}</div></td>
       <td class="klyuch">${par}</td><td><span class="metka ${kl}">${txt}</span></td></tr>`);
  });

  const ins = $('#instrukcia'); ins.innerHTML = '';
  S.els.forEach((e, i) => {
    const el = ELEMENTY[e.kind] || {};
    const glavn = e.params.d ?? e.params.l ?? e.params.w ?? e.params.s;
    const gde = i === 0 ? 'Поставь базовым' : 'Добавь под предыдущий';
    ins.insertAdjacentHTML('beforeend',
      `<li><span>${gde} элемент <b>${e.kind}</b>${glavn ? ' Ø/размер ' + glavn + ' мм' : ''} — ${(el.imya||'').toLowerCase()}.</span></li>`);
  });

  const vz = $('#vzyato'), dd = $('#dodumano');
  vz.innerHTML = ''; dd.innerHTML = '';
  const kat = katalog();
  if (kat.shirinaMm) vz.insertAdjacentHTML('beforeend', `<li>Габарит ${kat.shirinaMm} мм — из каталога</li>`);
  if (kat.otverstie) vz.insertAdjacentHTML('beforeend', `<li>Отверстие Ø ${kat.otverstie} мм — из каталога</li>`);
  if (kat.dlinaShtoka) vz.insertAdjacentHTML('beforeend', `<li>Длина штока ${kat.dlinaShtoka} мм — из каталога</li>`);
  if (S.izmer) {
    vz.insertAdjacentHTML('beforeend', `<li>Пропорции по 40 полосам силуэта — обмер фото</li>`);
    vz.insertAdjacentHTML('beforeend', `<li>Высота к ширине ${S.izmer.vysotaKShirine} — обмер фото</li>`);
  }
  S.tela.forEach(t => { if (t.sechenie && t.sechenie !== 'krugloe')
    vz.insertAdjacentHTML('beforeend', `<li>Сечение «${t.sechenie}», рёбер ${t.rebra||0} — распознано</li>`); });
  if (!vz.children.length) vz.innerHTML = '<li class="tiho">пока ничего</li>';

  S.zam.forEach(z => dd.insertAdjacentHTML('beforeend', `<li>${z}</li>`));
  dd.insertAdjacentHTML('beforeend', '<li>Толщины взяты не ниже печатного минимума</li>');
  if (!kat.shirinaMm) dd.insertAdjacentHTML('beforeend', '<li>Габарит не задан — масштаб принят 16 мм</li>');

  $('#jsonVyhod').textContent = JSON.stringify(
    S.els.map(e => ({ kind: e.kind, params: e.params })), null, 1);
}

// ---------- редактор примитивов ----------
function pokazatKuski() {
  const k = $('#kuski');
  if (!S.tela.length) { k.innerHTML = '<div class="tiho">Загрузи фото и нажми «Синтезировать».</div>'; return; }
  k.innerHTML = '';
  S.tela.forEach((t, i) => {
    const d = document.createElement('div'); d.className = 'kusok';
    d.innerHTML = `
      <div class="verh"><span class="nomer">${i+1}</span>
        <input type="text" data-p="opisanie" value="${(t.opisanie||'').replace(/"/g,'&quot;')}" placeholder="что это за кусок">
        <div class="strelki">
          <button data-d="up" title="выше">▲</button>
          <button data-d="dn" title="ниже">▼</button>
          <button data-d="rm" title="убрать">✕</button></div></div>
      <div class="troika">
        <div><label>Тип</label><select data-p="tip">${G.TIPY.map(x =>
          `<option${x===t.tip?' selected':''}>${x}</option>`).join('')}</select></div>
        <div><label>Сечение</label><select data-p="sechenie">${G.SECHENIYA.map(x =>
          `<option${x===t.sechenie?' selected':''}>${x}</option>`).join('')}</select></div>
        <div><label>Рёбер / лапок</label><input type="number" data-p="rebra" min="0" max="12" value="${t.rebra||0}"></div>
      </div>
      <div class="troika" style="margin-top:7px">
        <div><label>Доля высоты</label><input type="number" data-p="dolyaVysoty" step="0.01" min="0" max="1" value="${t.dolyaVysoty}"></div>
        <div><label>Доля ширины</label><input type="number" data-p="dolyaShiriny" step="0.01" min="0" max="1" value="${t.dolyaShiriny}"></div>
        <div><label>Зубцов</label><input type="number" data-p="zubcov" min="0" max="20" value="${t.zubcov||0}"></div>
      </div>
      <div class="podskazka">→ ${elementDlya(t.tip, t.sechenie)}</div>`;
    d.addEventListener('input', ev => {
      const p = ev.target.dataset.p; if (!p) return;
      t[p] = ev.target.type === 'number' ? +ev.target.value : ev.target.value;
      if (p === 'tip' || p === 'sechenie')
        d.querySelector('.podskazka').textContent = '→ ' + elementDlya(t.tip, t.sechenie);
      peresobrat();
    });
    d.addEventListener('click', ev => {
      const c = ev.target.dataset.d; if (!c) return;
      if (c === 'rm') S.tela.splice(i, 1);
      if (c === 'up' && i > 0) S.tela.splice(i-1, 0, S.tela.splice(i, 1)[0]);
      if (c === 'dn' && i < S.tela.length-1) S.tela.splice(i+1, 0, S.tela.splice(i, 1)[0]);
      S.tela.forEach((x, j) => x.nomer = j+1);
      pokazatKuski(); peresobrat();
    });
    k.appendChild(d);
  });
}

function katalog() {
  return {
    shirinaMm: +$('#pGolova').value || 0,
    otverstie: +$('#pOtverstie').value || 0,
    dlinaShtoka: +$('#pShtok').value || 0,
  };
}

function peresobrat() {
  if (!S.tela.length || !S.izmer) return;
  const kat = katalog();
  const r = sobrat(S.tela, S.izmer, kat.shirinaMm || 16);
  S.els = r.els; S.zam = r.zam.concat(podognat(S.els, kat));
  pererisovat(); pokazatRezultat();
}

// ---------- шаги ----------
function shag(imya, sost) {
  const li = $(`.shagi li[data-shag="${imya}"]`);
  if (!li) return;
  li.classList.remove('idet','est','sboj');
  if (sost) li.classList.add(sost);
}
function shagiSbros(){ $$('.shagi li').forEach(l => l.classList.remove('idet','est','sboj')); }

function skazatOshibku(t) {
  $('#oshibka').innerHTML = t ? `<div class="oshibka" style="margin-top:10px">${t}</div>` : '';
}

function pokazatRashod() {
  const c = G.CENY[LS.mr] || {}, ck = G.CENY[LS.mk] || {};
  const d = S.rashod.vhod/1e6*(c.vhod||0) + S.rashod.vyhod/1e6*(c.vyhod||0)
          + S.rashod.kartinok*(ck.kartinka||0);
  $('#rashod').textContent = S.rashod.vhod
    ? `Потрачено за сеанс: вход ${S.rashod.vhod} ток., выход ${S.rashod.vyhod} ток., картинок ${S.rashod.kartinok} — около $${d.toFixed(3)}`
    : '';
}

// ---------- фото ----------
function vstavitFoto(files) {
  [...files].slice(0, 3 - S.foto.length).forEach(f => {
    if (!f.type.startsWith('image/')) return;
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => { S.foto.push({ url: fr.result, img: im, imya: f.name,
        b64: fr.result.split(',')[1], mime: f.type }); pokazatFoto(); };
      im.src = fr.result;
    };
    fr.readAsDataURL(f);
  });
}
function pokazatFoto() {
  const m = $('#mini'); m.innerHTML = '';
  S.foto.forEach((f, i) => {
    const fg = document.createElement('figure');
    fg.innerHTML = `<img src="${f.url}" alt=""><figcaption>#${i+1}</figcaption><button class="x">✕</button>`;
    fg.querySelector('.x').onclick = () => { S.foto.splice(i, 1); pokazatFoto(); };
    m.appendChild(fg);
  });
}

// ---------- главный прогон ----------
async function sintez() {
  skazatOshibku('');
  if (!S.foto.length) return skazatOshibku('Сначала загрузи хотя бы одно фото.');
  const klyuch = LS.k;
  if (!klyuch) { $('#oknoNastroek').showModal(); return skazatOshibku('Нужен ключ Gemini — вставь его в настройках.'); }
  $('#knSintez').disabled = true; shagiSbros();

  try {
    shag('obmer','idet');
    S.izmer = obmerit(S.foto[0].img, { bezPometok: $('#chBezPometok').checked });
    shag('obmer','est');

    shag('razbor','idet');
    const hvost = [];
    const o = $('#pOpisanie').value.trim(); if (o) hvost.push('Описание из каталога: ' + o);
    const p = $('#pPodskazka').value.trim(); if (p) hvost.push('Подсказка от заказчика: ' + p);
    hvost.push('Обмер силуэта, 40 полос сверху вниз, доли от самой широкой части: '
               + S.izmer.polosy.map(v => v.toFixed(2)).join(', '));
    hvost.push('Высота детали относительно ширины: ' + S.izmer.vysotaKShirine);
    const kat = katalog();
    if (kat.shirinaMm) hvost.push('Каталог: самое широкое место ' + kat.shirinaMm + ' мм');
    if (kat.dlinaShtoka) hvost.push('Каталог: длина штока ' + kat.dlinaShtoka + ' мм');

    const { dannye, rashod } = await G.razobrat(klyuch, LS.mr, S.foto, hvost.join('\n'));
    S.rashod.vhod += rashod.vhod; S.rashod.vyhod += rashod.vyhod;
    S.tela = (dannye.tela || []).sort((a,b) => a.nomer - b.nomer);
    if (!S.tela.length) throw new Error('модель не нашла ни одного тела');
    shag('razbor','est');

    shag('sborka','idet');
    pokazatKuski(); peresobrat();
    shag('sborka','est');

    if ($('#chList').checked) {
      shag('list','idet');
      const sh = S.shablon || LS.sh;
      if (!sh) { shag('list','sboj'); skazatOshibku('Нет шаблона вёрстки — положи его в настройках.'); }
      else {
        const r2 = await G.narisovatList(klyuch, LS.mk, sh, S.foto[0], G.promtKartinki(S.tela));
        S.nejro = r2.kartinka; S.rashod.kartinok++;
        $('#nejroList').innerHTML = `<img src="${S.nejro}" style="width:100%;border-radius:8px">`;
        shag('list','est');
      }
    }
    zapisatVIstoriyu();
    pokazatRashod();
  } catch (e) {
    console.error(e);
    $$('.shagi li.idet').forEach(l => { l.classList.remove('idet'); l.classList.add('sboj'); });
    skazatOshibku('Не вышло: ' + e.message);
  } finally { $('#knSintez').disabled = false; }
}

// ---------- история ----------
function zapisatVIstoriyu() {
  const ist = LS.ist;
  ist.unshift({
    kogda: new Date().toISOString(),
    nomer: $('#pNomer').value || 'без номера',
    tela: S.tela, izmer: S.izmer,
    katalog: katalog(),
    opisanie: $('#pOpisanie').value, material: $('#pMaterial').value,
    els: S.els.map(e => ({ kind: e.kind, params: e.params })),
  });
  LS.ist = ist; pokazatIstoriyu();
}
function pokazatIstoriyu() {
  const h = $('#istoria'), ist = LS.ist;
  if (!ist.length) { h.innerHTML = '<div class="tiho">пока пусто</div>'; return; }
  h.innerHTML = '';
  ist.forEach((z, i) => {
    const d = document.createElement('div'); d.className = 'zapis';
    d.innerHTML = `<div><b>${z.nomer}</b><div class="d">${new Date(z.kogda).toLocaleString('ru')} · ${z.els.length} эл.</div></div>
                   <span class="prav metka m-v">открыть</span>`;
    d.onclick = () => {
      S.tela = z.tela; S.izmer = z.izmer;
      $('#pNomer').value = z.nomer === 'без номера' ? '' : z.nomer;
      $('#pOpisanie').value = z.opisanie || ''; $('#pMaterial').value = z.material || '';
      $('#pGolova').value = z.katalog?.shirinaMm || ''; $('#pOtverstie').value = z.katalog?.otverstie || '';
      $('#pShtok').value = z.katalog?.dlinaShtoka || '';
      pokazatKuski(); peresobrat();
    };
    h.appendChild(d);
  });
}

// ---------- эталонные пробы: без API, из готовых рецептов ----------
const PROBY = [
  { p:'Auveco 24484', o:'Пистон обшивки, плита и ёлочка', tela:[
    {nomer:1,tip:'plita',sechenie:'pryamougolnoe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.10,dolyaShiriny:1.0,suzhaetsya:'net',opisanie:'прямоугольная плита',uverennost:0.9},
    {nomer:2,tip:'shejka',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.14,dolyaShiriny:0.33,suzhaetsya:'net',opisanie:'гладкая шейка',uverennost:0.85},
    {nomer:3,tip:'vorotnik',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.11,dolyaShiriny:0.73,suzhaetsya:'kverhu',opisanie:'воротник-ограничитель',uverennost:0.85},
    {nomer:4,tip:'elochka',sechenie:'krugloe',rebra:0,zubcov:7,napravlenieZubcov:'vverh',dolyaVysoty:0.51,dolyaShiriny:0.52,suzhaetsya:'net',opisanie:'ёлочка, 7 лепестков',uverennost:0.9},
    {nomer:5,tip:'ostrie',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.14,dolyaShiriny:0.21,suzhaetsya:'knizu',opisanie:'носик-конус',uverennost:0.8}],
    izmer:{os:'вертикально',vysotaKShirine:1.29,zapolnennost:.46,polosy:
      [.55,.95,1,.98,.42,.33,.31,.34,.55,.72,.73,.66,.5,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.5,.44,.36,.3,.26,.24,.21,.17,.12]},
    kat:{shirinaMm:16} },
  { p:'Жёлтая клипса обшивки', o:'Три диска и нос с рёбрами', tela:[
    {nomer:1,tip:'disk',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.09,dolyaShiriny:0.79,suzhaetsya:'net',opisanie:'верхний диск',uverennost:0.9},
    {nomer:2,tip:'shejka',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.07,dolyaShiriny:0.45,suzhaetsya:'net',opisanie:'шейка',uverennost:0.85},
    {nomer:3,tip:'disk',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.11,dolyaShiriny:1.0,suzhaetsya:'net',opisanie:'средний диск',uverennost:0.92},
    {nomer:4,tip:'vorotnik',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.16,dolyaShiriny:0.95,suzhaetsya:'kverhu',opisanie:'воротник-юбка',uverennost:0.82},
    {nomer:5,tip:'konus',sechenie:'krest_s_rebrami',rebra:4,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.57,dolyaShiriny:0.6,suzhaetsya:'knizu',opisanie:'нос с четырьмя рёбрами',uverennost:0.75}],
    izmer:{os:'вертикально',vysotaKShirine:1.30,zapolnennost:.55,polosy:
      [.71,.78,.79,.77,.47,.43,.92,1,1,.99,.78,.54,.68,.81,.93,.95,.94,.77,.56,.59,.6,.59,.57,.56,.54,.52,.5,.49,.47,.45,.43,.42,.4,.38,.37,.35,.3,.24,.18,.12]},
    kat:{shirinaMm:20} },
  { p:'Auveco 14319', o:'Купол и разрезной конус', tela:[
    {nomer:1,tip:'shlyapka_kupol',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.16,dolyaShiriny:1.0,suzhaetsya:'net',opisanie:'купольная шляпка',uverennost:0.9},
    {nomer:2,tip:'shejka',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.06,dolyaShiriny:0.38,suzhaetsya:'net',opisanie:'шейка',uverennost:0.8},
    {nomer:3,tip:'konus',sechenie:'razreznoe',rebra:2,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.78,dolyaShiriny:0.95,suzhaetsya:'knizu',opisanie:'разрезной конус',uverennost:0.85}],
    izmer:{os:'вертикально',vysotaKShirine:1.05,zapolnennost:.5,polosy:
      [.8,.98,1,.95,.4,.36,.36,.9,.94,.9,.86,.82,.78,.74,.7,.66,.62,.58,.55,.52,.49,.46,.43,.4,.37,.34,.31,.28,.26,.24,.22,.2,.18,.17,.16,.15,.14,.13,.12,.1]},
    kat:{shirinaMm:20} },
  { p:'Auveco 21382', o:'Плита молдинга и ёлочка', tela:[
    {nomer:1,tip:'plita',sechenie:'pryamougolnoe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.11,dolyaShiriny:1.0,suzhaetsya:'net',opisanie:'плита молдинга',uverennost:0.88},
    {nomer:2,tip:'shejka',sechenie:'krugloe',rebra:0,zubcov:0,napravlenieZubcov:'net',dolyaVysoty:0.28,dolyaShiriny:0.31,suzhaetsya:'net',opisanie:'шейка',uverennost:0.85},
    {nomer:3,tip:'elochka',sechenie:'krugloe',rebra:0,zubcov:5,napravlenieZubcov:'vverh',dolyaVysoty:0.61,dolyaShiriny:0.54,suzhaetsya:'net',opisanie:'ёлочка, 5 лепестков',uverennost:0.87}],
    izmer:{os:'вертикально',vysotaKShirine:1.45,zapolnennost:.42,polosy:
      [.7,1,.98,.32,.3,.3,.3,.3,.3,.3,.3,.3,.5,.54,.5,.46,.54,.5,.46,.54,.5,.46,.54,.5,.46,.54,.5,.46,.54,.5,.46,.5,.44,.38,.32,.28,.24,.2,.16,.12]},
    kat:{shirinaMm:17.5} },
];

function pokazatProby() {
  const b = $('#proby'); b.innerHTML = '';
  PROBY.forEach(pr => {
    const d = document.createElement('div'); d.className = 'proba';
    d.innerHTML = `<b>${pr.p}</b><span>${pr.o}</span>`;
    d.onclick = () => {
      S.tela = JSON.parse(JSON.stringify(pr.tela));
      S.izmer = JSON.parse(JSON.stringify(pr.izmer));
      $('#pNomer').value = pr.p; $('#pOpisanie').value = pr.o;
      $('#pGolova').value = pr.kat.shirinaMm || '';
      shagiSbros(); shag('obmer','est'); shag('razbor','est'); shag('sborka','est');
      pokazatKuski(); peresobrat(); skazatOshibku('');
    };
    b.appendChild(d);
  });
}

// ---------- справочник ----------
function pokazatSpravochnik() {
  const s = $('#elSetka'); s.innerHTML = '';
  $('#skolkoEl').textContent = ` — ${SPISOK.length} элементов`;
  $('#knSpravochnik').textContent = `Справочник конструктора (${SPISOK.length})`;
  for (const k of SPISOK) {
    const e = ELEMENTY[k];
    const d = document.createElement('div'); d.className = 'el-karta';
    d.innerHTML = `<b>${e.imya}</b><span class="klyuch">${k} · ${e.zona}</span>
      <div class="klyuch">${Object.entries(e.p).map(([a,b]) => a+' '+b).join(', ')}</div>`;
    s.appendChild(d);
  }
}

// ---------- вкладки ----------
function vkladka(v) {
  $$('.vkladki button').forEach(b => b.classList.toggle('akt', b.dataset.vid === v));
  $('#scena').hidden = v !== 'model';
  $('#chertyozh').hidden = v !== 'chertyozh';
  $('#listRazbora').hidden = v !== 'razbor';
  $('#nejroList').hidden = v !== 'nejro';
  $('#upravlenie').textContent = v === 'model'
    ? 'ЛКМ — вращение · колесо — зум · ПКМ — сдвиг'
    : (v === 'nejro' && !S.nejro ? 'Лист от нейронки не запрашивался — поставь галочку и синтезируй заново.' : '');
}

// ---------- шаблон вёрстки ----------
function pokazatShablon(sh) {
  $('#miniShablon').innerHTML = `<figure><img src="data:${sh.mime};base64,${sh.b64}"></figure>`;
}
// В репозитории лежит чистый шаблон без единой буквы. Он и грузится по умолчанию:
// эталон с таблицей и подписями модель начинает копировать вместе с текстом.
async function zagruzitShablonPoUmolchaniyu() {
  try {
    const r = await fetch('shablon/shablon_verstki.png');
    if (!r.ok) return;
    const b = await r.blob();
    const b64 = await new Promise(res => {
      const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b);
    });
    S.shablon = { b64, mime: 'image/png' };
    try { LS.sh = S.shablon; } catch {}
    pokazatShablon(S.shablon);
  } catch {}
}

// ---------- запуск ----------
function start() {
  scenaInit(); pokazatProby(); pokazatIstoriyu(); pokazatSpravochnik(); pokazatRezultat();

  $('#nKlyuch').value = LS.k;
  $('#nModelRazbor').value = LS.mr;
  $('#nModelKartinka').value = LS.mk;
  if (LS.sh) pokazatShablon(LS.sh);
  else zagruzitShablonPoUmolchaniyu();

  const drop = $('#drop'), fajly = $('#fajly');
  drop.onclick = () => fajly.click();
  fajly.onchange = () => vstavitFoto(fajly.files);
  ['dragenter','dragover'].forEach(e => drop.addEventListener(e, ev => {
    ev.preventDefault(); drop.classList.add('nad'); }));
  ['dragleave','drop'].forEach(e => drop.addEventListener(e, ev => {
    ev.preventDefault(); drop.classList.remove('nad'); }));
  drop.addEventListener('drop', ev => vstavitFoto(ev.dataTransfer.files));
  addEventListener('paste', ev => { if (ev.clipboardData?.files?.length) vstavitFoto(ev.clipboardData.files); });

  $('#knSintez').onclick = sintez;
  $('#knPereschitat').onclick = peresobrat;
  $$('.vkladki button').forEach(b => b.onclick = () => vkladka(b.dataset.vid));
  ['#pGolova','#pOtverstie','#pShtok'].forEach(s => $(s).addEventListener('change', peresobrat));

  $('#knDobavit').onclick = () => {
    S.tela.push({ nomer: S.tela.length+1, tip:'shejka', sechenie:'krugloe', rebra:0, zubcov:0,
      napravlenieZubcov:'net', dolyaVysoty:0.1, dolyaShiriny:0.5, suzhaetsya:'net',
      opisanie:'новый кусок', uverennost:0.5 });
    if (!S.izmer) S.izmer = { os:'вертикально', vysotaKShirine:1.4, zapolnennost:.5,
      polosy: Array.from({length:40}, (_,i) => 1 - i*0.02) };
    pokazatKuski(); peresobrat();
  };

  $('#knNastrojki').onclick = () => $('#oknoNastroek').showModal();
  $('#knZakrytNastrojki').onclick = () => $('#oknoNastroek').close();
  $('#knSpravochnik').onclick = () => $('#oknoSpravochnika').showModal();
  $('#knZakrytSpravochnik').onclick = () => $('#oknoSpravochnika').close();
  $('#nKlyuch').onchange = e => LS.k = e.target.value.trim();
  $('#nModelRazbor').onchange = e => { LS.mr = e.target.value; pokazatRashod(); };
  $('#nModelKartinka').onchange = e => { LS.mk = e.target.value; pokazatRashod(); };
  $('#nShablon').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const b64 = fr.result.split(',')[1];
      S.shablon = { b64, mime: f.type }; LS.sh = S.shablon;
      $('#miniShablon').innerHTML = `<figure><img src="${fr.result}"></figure>`;
    };
    fr.readAsDataURL(f);
  };

  $('#knKopirovat').onclick = async () => {
    await navigator.clipboard.writeText($('#jsonVyhod').textContent);
    $('#knKopirovat').textContent = 'Скопировано';
    setTimeout(() => $('#knKopirovat').textContent = 'Скопировать', 1200);
  };
  $('#knStl').onclick = () => {
    if (!S.els.length) return;
    const { celoe } = geomRecepta(S.els);
    skachat(vStl(celoe, $('#pNomer').value), ($('#pNomer').value || 'klipsa').replace(/\s+/g,'_') + '.stl');
  };
  $('#knPng').onclick = () => {
    $('#chertyozh').toBlob(b => skachat(b, ($('#pNomer').value || 'klipsa').replace(/\s+/g,'_') + '_chertyozh.png'));
  };
  $('#knVygruzit').onclick = () => {
    const d = LS.ist.reduce((a, z) => { a[z.nomer] = z.els.map(e => [e.kind, e.params]); return a; }, {});
    skachat(new Blob([JSON.stringify(d, null, 1)], { type:'application/json' }), 'recepty.json');
  };
  $('#knOchistit').onclick = () => { if (confirm('Стереть историю разборов?')) { LS.ist = []; pokazatIstoriyu(); } };

  vkladka('model');
}
start();
