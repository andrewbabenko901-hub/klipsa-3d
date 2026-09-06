import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ELEMENTY, SPISOK, geometriya, vysota } from './elementy.js';
import { slozhit } from './geom.js';
import * as O from './obmer.js';
import * as A from './algoritmy.js';
import * as N from './nejro.js';
import { promtKartinki } from './shema.js';
import { svesti, svodka } from './konsensus.js';
import { sobrat, podognat, summarno, elementDlya } from './sborka.js';
import { chertyozh, listRazbora } from './vidy.js';
import { vStl, skachat } from './stl.js';
import { PROBY } from './proby.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const S = {
  foto: [], izmer: null, tela: [], els: [], zam: [],
  varianty: [], svod: null, shablon: null, nejro: null,
  rashod: [], granicy: null,
};

// ---------- хранилище ----------
const LS = {
  j(k, po) { try { return JSON.parse(localStorage.getItem('klipsa.'+k)) ?? po; } catch { return po; } },
  s(k, v) { try { localStorage.setItem('klipsa.'+k, JSON.stringify(v)); } catch {} },
  get klyuchi(){ return this.j('klyuchi', {}); }, set klyuchi(v){ this.s('klyuchi', v); },
  get modeli(){ return this.j('modeli', {}); },  set modeli(v){ this.s('modeli', v); },
  get vkl(){ return this.j('vkl', { gemini:true }); }, set vkl(v){ this.s('vkl', v); },
  get obr(){ return this.j('obr', {}); },        set obr(v){ this.s('obr', v); },
  get plotnost(){ return +(localStorage.getItem('klipsa.plotnost') || 1); },
  set plotnost(v){ localStorage.setItem('klipsa.plotnost', String(v)); },
  get modelKartinki(){ return localStorage.getItem('klipsa.modelKartinki') || N.MODELI_KARTINOK[0]; },
  set modelKartinki(v){ localStorage.setItem('klipsa.modelKartinki', v); },
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
  new ResizeObserver(razmer3d).observe($('#stsena'));
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
    if (g) { kuski.push(g.clone()); const v = g.clone(); v.translate(0,y,0); celoe.push(v); }
    y -= h;
  }
  return { celoe: slozhit(celoe), kuski };
}

function pererisovat() {
  if (!S.els.length) { pokazatModel(null); return; }
  const { celoe, kuski } = geomRecepta(S.els);
  const cvet = (S.izmer && S.izmer.cvet) || [74,132,92];
  pokazatModel(celoe, cvet);
  const gab = summarno(S.els);
  chertyozh($('#chertyozh'), celoe, {
    nomer: $('#pNomer').value || '—', material: $('#pMaterial').value || 'пластик',
    elementov: S.els.length, vysota: gab.vysota, shirina: gab.shirina, cvet });
  listRazbora($('#listRazbora'), celoe, kuski, cvet);
  if (S.izmer) O.narisovatRazbor($('#holstMaski'), S.izmer, S.granicy);
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

function obmerit(tiho) {
  if (!S.foto.length) { if (!tiho) skazatOshibku('Сначала загрузи фото.', true); return null; }
  try {
    S.izmer = O.obmerit(S.foto[0].img, nastrojkiObrabotki());
    const nm = A.METODY_MASKI[S.izmer.metod];
    if (nm) $('#znMetod').textContent = nm.split(' —')[0].toLowerCase();
    return S.izmer;
  } catch (e) { skazatOshibku('Обмер не вышел: ' + e.message); return null; }
}

function razborAlgoritmom() {
  if (!S.izmer) return null;
  const tela = O.razborAlgoritmom(S.izmer, +$('#oChuvst').value);
  return { istochnik:'Алгоритм по профилю', post:'algoritm', model:'изломы профиля',
           tela, uverennost: 0.6, ves: 0.8, rashod:null, sekund:0 };
}

// ---------- сборка ----------
function katalog() {
  return { shirinaMm:+$('#pGolova').value||0, otverstie:+$('#pOtverstie').value||0,
           dlinaShtoka:+$('#pShtok').value||0 };
}
function peresobrat() {
  if (!S.tela.length || !S.izmer) return;
  const kat = katalog();
  const r = sobrat(S.tela, S.izmer, kat.shirinaMm || 16);
  S.els = r.els; S.zam = r.zam.concat(podognat(S.els, kat));
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
  if (kat.shirinaMm) vz.insertAdjacentHTML('beforeend', `<li>Габарит ${kat.shirinaMm} мм — каталог</li>`);
  if (kat.otverstie) vz.insertAdjacentHTML('beforeend', `<li>Отверстие Ø${kat.otverstie} мм — каталог</li>`);
  if (kat.dlinaShtoka) vz.insertAdjacentHTML('beforeend', `<li>Длина штока ${kat.dlinaShtoka} мм — каталог</li>`);
  if (S.izmer) {
    const nazvMetoda = A.METODY_MASKI[S.izmer.metod];
    vz.insertAdjacentHTML('beforeend', `<li>Пропорции по 40 полосам — обмер${nazvMetoda ? ' (' + nazvMetoda.split(' —')[0] + ')' : ''}</li>`);
    vz.insertAdjacentHTML('beforeend', `<li>Высота к ширине ${S.izmer.vysotaKShirine}</li>`);
    vz.insertAdjacentHTML('beforeend', `<li>Цвет детали — со снимка</li>`);
  }
  S.tela.forEach(t => { if (t.sechenie && t.sechenie !== 'krugloe')
    vz.insertAdjacentHTML('beforeend', `<li>Сечение «${t.sechenie}», рёбер ${t.rebra||0}</li>`); });
  if (!vz.children.length) vz.innerHTML = '<li class="tiho">пока ничего</li>';
  S.zam.forEach(z => dd.insertAdjacentHTML('beforeend', `<li>${z}</li>`));
  dd.insertAdjacentHTML('beforeend', '<li>Толщины не ниже печатного минимума</li>');
  if (!kat.shirinaMm) dd.insertAdjacentHTML('beforeend', '<li>Габарит не задан — масштаб 16 мм</li>');

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
      <div class="klyuch">${x.model}${x.sekund?' · '+x.sekund+' с':''}</div>
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
      <div class="podskazka">→ ${elementDlya(t.tip, t.sechenie)}${t.istochnik?' · '+t.istochnik:''}</div>`;
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
  if (S.foto.length >= 3) return skazatOshibku('Уже три фото, больше не влезет.');
  skazatOshibku('');
  kartinki.slice(0, 3 - S.foto.length).forEach(f => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => { S.foto.push({ url:fr.result, img:im, imya:f.name,
        b64:fr.result.split(',')[1], mime:f.type }); pokazatFoto(); if (S.foto.length===1) obmerit(true) && risovatMasku(); };
      im.src = fr.result;
    };
    fr.readAsDataURL(f);
  });
}
function risovatMasku() { if (S.izmer) O.narisovatRazbor($('#holstMaski'), S.izmer, S.granicy); }
function pokazatFoto() {
  const m = $('#mini'); m.innerHTML = '';
  S.foto.forEach((f, i) => {
    const fg = document.createElement('figure');
    fg.innerHTML = `<img src="${f.url}" alt=""><figcaption>#${i+1}</figcaption><button class="x">✕</button>`;
    fg.querySelector('.x').onclick = () => { S.foto.splice(i,1); pokazatFoto(); };
    m.appendChild(fg);
  });
}

// ---------- главный прогон ----------
async function sintez() {
  skazatOshibku(''); shagiSbros();
  if (!S.foto.length) return skazatOshibku(
    'Нет фотографии. Нажми на рамку и выбери файл. Хочешь просто посмотреть — щёлкни эталонную проверку слева.', true);

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

    S.varianty = [];
    if (sAlgoritmom) { const a = razborAlgoritmom(); if (a) S.varianty.push(a); }

    if (kogo.length) {
      shag('razbor','idet');
      const hvost = [];
      const o = $('#pOpisanie').value.trim(); if (o) hvost.push('Описание из каталога: ' + o);
      const p = $('#pPodskazka').value.trim(); if (p) hvost.push('Подсказка от заказчика: ' + p);
      hvost.push('Обмер силуэта, 40 полос сверху вниз: ' + S.izmer.polosy.map(v=>v.toFixed(2)).join(', '));
      hvost.push('Высота к ширине: ' + S.izmer.vysotaKShirine);
      const kat = katalog();
      if (kat.shirinaMm) hvost.push('Каталог: самое широкое место ' + kat.shirinaMm + ' мм');
      if (kat.dlinaShtoka) hvost.push('Каталог: длина штока ' + kat.dlinaShtoka + ' мм');
      const dop = hvost.join('\n');

      const otvety = await Promise.all(kogo.map(async post => {
        const model = modeli[post] || N.POSTAVSHCHIKI[post].modeli[0];
        try {
          const r = await N.razobrat(post, klyuchi[post].trim(), model, S.foto, dop);
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
      const gk = (LS.klyuchi.gemini||'').trim();
      const sh = S.shablon || LS.shablon;
      if (!gk) { shag('list','sboj'); skazatOshibku('Для листа картинкой нужен ключ Google.'); }
      else if (!sh) { shag('list','sboj'); skazatOshibku('Нет шаблона вёрстки — положи его в настройках.'); }
      else try {
        const r2 = await N.narisovatList(gk, LS.modelKartinki, sh, S.foto[0], promtKartinki(S.tela));
        S.nejro = r2.kartinka;
        S.rashod.push({ istochnik:'картинка', post:'gemini', model:LS.modelKartinki, kartinok:1 });
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

// ---------- эталоны ----------
function pokazatProby() {
  const b = $('#proby'); b.innerHTML = '';
  PROBY.forEach(pr => {
    const d = document.createElement('div'); d.className = 'proba';
    d.innerHTML = `<b>${pr.p}</b><span>${pr.o}</span>`;
    d.onclick = () => {
      S.tela = JSON.parse(JSON.stringify(pr.tela));
      S.izmer = JSON.parse(JSON.stringify(pr.izmer));
      S.svod = null; S.varianty = [];
      $('#pNomer').value = pr.p; $('#pOpisanie').value = pr.o;
      $('#pGolova').value = pr.kat.shirinaMm || '';
      shagiSbros(); shag('obmer','est'); shag('razbor','est'); shag('sborka','est');
      $('#znIstochnik').textContent = 'эталон';
      pokazatKuski(); peresobrat(); pokazatSravnenie(); skazatOshibku('');
    };
    b.appendChild(d);
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
          <select data-model>${p.modeli.map(m=>`<option${m===(modeli[id]||p.modeli[0])?' selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="podskazka">Ключ: <a href="${p.gdeKlyuch}" target="_blank" rel="noopener">${p.gdeKlyuch.replace('https://','')}</a></div>
      <div data-otvet></div>`;
    d.querySelector('[data-klyuch]').oninput = e => {
      const k = LS.klyuchi; k[id] = e.target.value.trim(); LS.klyuchi = k;
      d.querySelector('[data-t]').className = 'tochka ' + (k[id] ? 'est' : '');
      d.querySelector('[data-otvet]').innerHTML = '';
      obnovitKtoSprashivat();
    };
    d.querySelector('[data-model]').onchange = e => { const m = LS.modeli; m[id] = e.target.value; LS.modeli = m; obnovitKtoSprashivat(); };
    d.querySelector('[data-vkl]').onchange = e => { const v = LS.vkl; v[id] = e.target.checked; LS.vkl = v; obnovitKtoSprashivat(); };
    d.querySelector('[data-pr]').onclick = async ev => {
      const b = ev.target, o = d.querySelector('[data-otvet]');
      b.disabled = true; o.innerHTML = '<div class="podskazka">Спрашиваю…</div>';
      const r = await N.proverit(id, (LS.klyuchi[id]||'').trim(), LS.modeli[id] || p.modeli[0]);
      o.innerHTML = r.ok ? `<div class="itog" style="margin-top:7px"><div class="krug">✓</div><div>${r.tekst}</div></div>`
                         : `<div class="oshibka" style="margin-top:7px">${r.tekst}</div>`;
      if (r.modeli?.length) {
        const sel = d.querySelector('[data-model]'), bylo = sel.value;
        const nabor = [...new Set([...p.modeli, ...r.modeli])].filter(m => r.modeli.includes(m));
        sel.innerHTML = (nabor.length ? nabor : r.modeli).map(m => `<option${m===bylo?' selected':''}>${m}</option>`).join('');
      }
      b.disabled = false;
    };
    c.appendChild(d);
  }
}
function obnovitKtoSprashivat() {
  const k = $('#ktoSprashivat'); const klyuchi = LS.klyuchi, vkl = LS.vkl, modeli = LS.modeli;
  k.innerHTML = Object.entries(N.POSTAVSHCHIKI).map(([id,p]) => {
    const est = !!(klyuchi[id]||'').trim();
    return `<label class="stroka"><input type="checkbox" data-p="${id}" ${vkl[id]&&est?'checked':''} ${est?'':'disabled'}>
      <span class="tochka ${est?'est':''}"></span>${p.imya}
      <span class="klyuch">${est ? (modeli[id]||p.modeli[0]) : 'нет ключа'}</span></label>`;
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
    maska:'Слева — что алгоритм принял за деталь, справа — профиль по 40 полосам и линии реза',
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
  scenaInit(); pokazatProby(); pokazatIstoriyu(); pokazatSpravochnik(); pokazatRezultat();
  pokazatPostavshchikov(); obnovitKtoSprashivat();

  // выпадающие списки методов
  $('#oMaska').innerHTML = Object.entries(A.METODY_MASKI).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#oKomponenta').innerHTML = Object.entries(O.METODY_KOMPONENTY).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#oOs').innerHTML = Object.entries(O.METODY_OSI).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#nModelKartinka').innerHTML = N.MODELI_KARTINOK.map(m=>`<option${m===LS.modelKartinki?' selected':''}>${m}</option>`).join('');
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
  addEventListener('paste', ev => { if (ev.clipboardData?.files?.length) vstavitFoto(ev.clipboardData.files); });

  $('#knSintez').onclick = sintez;
  $('#knPereschitat').onclick = peresobrat;
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
    if (!S.izmer) S.izmer = { os:'вертикально', cvet:[74,132,92], vysotaKShirine:1.4,
      zapolnennost:.5, polosy:Array.from({length:40},(_,i)=>1-i*0.02) };
    pokazatKuski(); peresobrat();
  };

  $('#knNastrojki').onclick = () => $('#oknoNastroek').showModal();
  $('#knZakrytNastrojki').onclick = () => $('#oknoNastroek').close();
  $('#knSpravochnik').onclick = () => $('#oknoSpravochnika').showModal();
  $('#knZakrytSpravochnik').onclick = () => $('#oknoSpravochnika').close();
  $('#nModelKartinka').onchange = e => LS.modelKartinki = e.target.value;
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
}
start();
