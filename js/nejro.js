// Подключение разных нейронок. Один интерфейс, пять поставщиков плюс свой адрес.
// Ключи живут только в localStorage этого браузера и уходят строго
// на сервер своего поставщика.
import { TIPY, SECHENIYA, SHEMA, PROMT_RAZBOR, PROMT_SVERKA, SHEMA_SVERKI } from './shema.js';
export { TIPY, SECHENIYA, SHEMA, PROMT_RAZBOR };

// Схема для тех, кто ждёт строгий JSON Schema (OpenAI и совместимые).
function strogaya(sh) {
  const obojti = o => {
    if (!o || typeof o !== 'object') return o;
    if (o.type === 'object') {
      const p = {}; for (const k in (o.properties||{})) p[k] = obojti(o.properties[k]);
      return { type:'object', properties:p, required:Object.keys(p), additionalProperties:false };
    }
    if (o.type === 'array') return { type:'array', items: obojti(o.items) };
    return o;
  };
  return obojti(sh);
}

const dataUrl = f => 'data:' + (f.mime || 'image/png') + ';base64,' + f.b64;

/**
 * Ужать снимок под лимит поставщика.
 * NVIDIA NIM принимает картинку внутри запроса, только пока весь запрос
 * меньше ~180 КБ; фотография с телефона в это не влезает никогда. Жмём в JPEG,
 * последовательно уменьшая сторону и качество, пока не поместится.
 */
async function szhatFoto(f, predel = 130000) {
  if (f.b64 && f.b64.length <= predel) return dataUrl(f);
  const img = f.img || await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl(f);
  });
  const c = document.createElement('canvas'), cx = c.getContext('2d');
  for (const storona of [1400, 1100, 900, 720, 560, 440]) {
    const k = Math.min(1, storona / Math.max(img.width, img.height));
    c.width = Math.max(8, Math.round(img.width * k));
    c.height = Math.max(8, Math.round(img.height * k));
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(img, 0, 0, c.width, c.height);
    for (const kach of [0.9, 0.75, 0.6]) {
      const u = c.toDataURL('image/jpeg', kach);
      if (u.length <= predel) return u;
    }
  }
  return c.toDataURL('image/jpeg', 0.5);
}

async function poslat(url, zagolovki, telo, imya) {
  let r;
  try { r = await fetch(url, { method:'POST', headers:zagolovki, body:JSON.stringify(telo) }); }
  catch (e) { throw new Error(imya + ': сеть не пустила запрос (' + e.message + ')'); }
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) {
    const m = j?.error?.message || j?.message || t.slice(0, 240);
    throw new Error(imya + ' ответил ' + r.status + ': ' + m);
  }
  if (!j) throw new Error(imya + ': ответ не разобрался');
  return j;
}

function razobratJson(tekst, imya) {
  if (!tekst) throw new Error(imya + ': пустой ответ');
  const t = tekst.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); }
  catch {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b+1));
    throw new Error(imya + ': ответ не похож на JSON');
  }
}

// ---------- поставщики ----------

export const POSTAVSHCHIKI = {

  gemini: {
    imya: 'Google Gemini',
    gdeKlyuch: 'https://aistudio.google.com/apikey',
    modeli: ['gemini-3.5-flash-lite','gemini-3.5-flash','gemini-3.1-flash-lite','gemini-2.5-flash'],
    ceny: { 'gemini-3.5-flash-lite':{vhod:0.30,vyhod:2.50}, 'gemini-3.5-flash':{vhod:0.60,vyhod:3.50},
            'gemini-3.1-flash-lite':{vhod:0.20,vyhod:1.60}, 'gemini-2.5-flash':{vhod:0.30,vyhod:2.50} },
    async spisokModeley(klyuch) {
      // тянем ВЕСЬ список моделей ключа, а не только те, что зашиты в коде:
      // у Google их десятки и они меняются каждый месяц
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
                            { headers:{ 'x-goog-api-key': klyuch } });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      const vse = (j.models||[]).map(m => ({
        imya: String(m.name).replace('models/',''),
        metody: m.supportedGenerationMethods || [],
      }));
      const godnye = vse.filter(m => m.metody.includes('generateContent') &&
                                     !/embedding|aqa|tts|embed/i.test(m.imya));
      const spisok = godnye.map(m => m.imya).sort();
      spisok.kartinki = godnye.map(m => m.imya).filter(n => /image|imagen|banana/i.test(n)).sort();
      spisok.vsego = vse.length;
      return spisok;
    },
    async razobrat(klyuch, model, foto, promt) {
      const chasti = [{ text: promt }];
      for (const f of foto) chasti.push({ inline_data:{ mime_type: f.mime||'image/png', data: f.b64 } });
      const j = await poslat(
        'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
        { 'Content-Type':'application/json', 'x-goog-api-key': klyuch },
        { contents:[{ role:'user', parts: chasti }],
          generationConfig:{ responseMimeType:'application/json', responseSchema: SHEMA, temperature:0.2 } },
        'Gemini');
      const t = (j?.candidates?.[0]?.content?.parts || []).map(p => p.text||'').join('');
      const u = j?.usageMetadata || {};
      return { dannye: razobratJson(t, 'Gemini'),
               rashod:{ vhod:u.promptTokenCount||0, vyhod:(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0) } };
    },
  },

  openai: {
    imya: 'OpenAI',
    gdeKlyuch: 'https://platform.openai.com/api-keys',
    modeli: ['gpt-5-mini','gpt-5','gpt-4.1-mini','gpt-4.1'],
    ceny: { 'gpt-5-mini':{vhod:0.25,vyhod:2.00}, 'gpt-5':{vhod:1.25,vyhod:10.0},
            'gpt-4.1-mini':{vhod:0.40,vyhod:1.60}, 'gpt-4.1':{vhod:2.00,vyhod:8.00} },
    async spisokModeley(klyuch) {
      const r = await fetch('https://api.openai.com/v1/models', { headers:{ Authorization:'Bearer '+klyuch } });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      return (j.data||[]).map(m => m.id).sort();
    },
    async razobrat(klyuch, model, foto, promt) {
      const soderzhanie = [{ type:'text', text: promt }];
      for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
      const j = await poslat('https://api.openai.com/v1/chat/completions',
        { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch },
        { model, messages:[{ role:'user', content: soderzhanie }], temperature:0.2,
          response_format:{ type:'json_schema',
            json_schema:{ name:'razbor_klipsy', strict:true, schema: strogaya(SHEMA) } } },
        'OpenAI');
      const u = j.usage || {};
      return { dannye: razobratJson(j?.choices?.[0]?.message?.content, 'OpenAI'),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },

  anthropic: {
    imya: 'Anthropic Claude',
    gdeKlyuch: 'https://console.anthropic.com/settings/keys',
    modeli: ['claude-haiku-4-5','claude-sonnet-4-5','claude-opus-4-5'],
    ceny: { 'claude-haiku-4-5':{vhod:1.00,vyhod:5.00}, 'claude-sonnet-4-5':{vhod:3.00,vyhod:15.0},
            'claude-opus-4-5':{vhod:5.00,vyhod:25.0} },
    async spisokModeley(klyuch) {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100',
        { headers:{ 'x-api-key':klyuch, 'anthropic-version':'2023-06-01',
                    'anthropic-dangerous-direct-browser-access':'true' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      return (j.data||[]).map(m => m.id);
    },
    async razobrat(klyuch, model, foto, promt) {
      const soderzhanie = [{ type:'text', text: promt }];
      for (const f of foto) soderzhanie.push({ type:'image',
        source:{ type:'base64', media_type: f.mime||'image/png', data: f.b64 } });
      // строгую форму получаем через инструмент — так надёжнее, чем просить JSON словами
      const j = await poslat('https://api.anthropic.com/v1/messages',
        { 'Content-Type':'application/json', 'x-api-key':klyuch, 'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true' },
        { model, max_tokens:2000, temperature:0.2,
          tools:[{ name:'otdat_razbor', description:'Отдать разбор детали по схеме', input_schema: SHEMA }],
          tool_choice:{ type:'tool', name:'otdat_razbor' },
          messages:[{ role:'user', content: soderzhanie }] },
        'Claude');
      const inst = (j.content||[]).find(c => c.type === 'tool_use');
      const u = j.usage || {};
      if (!inst) throw new Error('Claude: не вернул разбор');
      return { dannye: inst.input,
               rashod:{ vhod:u.input_tokens||0, vyhod:u.output_tokens||0 } };
    },
  },

  openrouter: {
    imya: 'OpenRouter — много моделей одним ключом',
    gdeKlyuch: 'https://openrouter.ai/keys',
    modeli: ['google/gemini-2.5-flash','openai/gpt-5-mini','anthropic/claude-haiku-4.5',
             'qwen/qwen2.5-vl-72b-instruct','meta-llama/llama-4-maverick'],
    ceny: {},
    async spisokModeley(klyuch) {
      const r = await fetch('https://openrouter.ai/api/v1/models',
                            { headers: klyuch ? { Authorization:'Bearer '+klyuch } : {} });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      return (j.data||[])
        .filter(m => (m.architecture?.input_modalities||[]).includes('image'))
        .map(m => m.id).sort();
    },
    async razobrat(klyuch, model, foto, promt) {
      const soderzhanie = [{ type:'text', text: promt }];
      for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
      const j = await poslat('https://openrouter.ai/api/v1/chat/completions',
        { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch,
          'HTTP-Referer':location.origin, 'X-Title':'klipsa-3d' },
        { model, messages:[{ role:'user', content: soderzhanie }], temperature:0.2,
          response_format:{ type:'json_schema',
            json_schema:{ name:'razbor_klipsy', strict:true, schema: strogaya(SHEMA) } } },
        'OpenRouter');
      const u = j.usage || {};
      return { dannye: razobratJson(j?.choices?.[0]?.message?.content, 'OpenRouter'),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },
  // NVIDIA NIM — каталог build.nvidia.com. Адрес OpenAI-совместимый, запросы
  // из браузера пропускает (CORS открыт), картинка идёт обычным image_url.
  // Список моделей отдаётся даже без ключа, поэтому его видно сразу.
  nvidia: {
    imya: 'NVIDIA NIM — каталог build.nvidia.com',
    gdeKlyuch: 'https://build.nvidia.com/settings/api-keys',
    svoyAdres: true,
    adresPoUmolchaniyu: 'https://integrate.api.nvidia.com/v1',
    podskazka: 'Ключ — кнопкой <b>Generate API Key</b> на build.nvidia.com/settings/api-keys ' +
      '(значение показывают один раз). <b>Внимание:</b> NVIDIA не пускает запросы из браузера ' +
      'с чужого сайта — заголовков CORS у неё нет. Прямой адрес сработает только через свой ' +
      'прокси: поставь его сюда вместо адреса по умолчанию. Готовый конфиг лежит в ' +
      '<b>ClipGen\\NVIDIA_proksi.md</b>.',
    modeli: ['meta/llama-3.2-90b-vision-instruct','meta/llama-3.2-11b-vision-instruct',
             'google/gemma-3-12b-it','microsoft/phi-3-vision-128k-instruct','nvidia/neva-22b'],
    ceny: {},
    async spisokModeley(klyuch, adres) {
      const baza = bazaSvoego(adres || 'https://integrate.api.nvidia.com/v1');
      const r = await fetch(baza + '/models',
                            { headers: klyuch ? { Authorization:'Bearer '+klyuch } : {} });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.title || ('HTTP ' + r.status));
      const vse = (j.data||[]).map(m => m.id);
      // модальность в списке не указана — отбираем по имени, зрячие вперёд
      const zryachie = vse.filter(id =>
        /vision|-vl|vlm|llava|neva|kosmos|fuyu|gemma-3|paligemma|internvl|pixtral|maverick|scout|deplot/i.test(id));
      const spisok = [...zryachie.sort(), ...vse.filter(id => !zryachie.includes(id)).sort()];
      spisok.zryachih = zryachie.length;
      return spisok;
    },
    async razobrat(klyuch, model, foto, promt, adres) {
      const url = bazaSvoego(adres || 'https://integrate.api.nvidia.com/v1') + '/chat/completions';
      const soderzhanie = [];
      for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: await szhatFoto(f) } });
      soderzhanie.push({ type:'text', text: promt });
      const zag = { 'Content-Type':'application/json', Accept:'application/json',
                    Authorization:'Bearer ' + klyuch };
      const telo = { model, messages:[{ role:'user', content: soderzhanie }],
                     temperature:0.2, max_tokens:4096 };
      let j;
      try {
        // сначала со строгим JSON: NIM умеет guided_json, но не на всех моделях
        j = await poslat(url, zag,
              Object.assign({}, telo, { nvext:{ guided_json: strogaya(SHEMA) } }), 'NVIDIA');
      } catch (e) {
        if (/сеть не пустила/.test(e.message))
          throw new Error('NVIDIA не пускает запросы из браузера напрямую (нет заголовков CORS). ' +
                          'Нужен свой прокси — впиши его адрес в поле рядом с ключом.');
        if (!/nvext|guided|400|422/i.test(e.message)) throw e;
        j = await poslat(url, zag, telo, 'NVIDIA');
      }
      const u = j.usage || {};
      return { dannye: razobratJson(j?.choices?.[0]?.message?.content, 'NVIDIA'),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },

  // Свой поставщик: любой сервис с OpenAI-совместимым /chat/completions.
  // Адрес и ключ вводит пользователь; ключ хранится в браузере и в код не
  // попадает. Схему ответа шлём мягко (json_object): не все сервисы умеют
  // строгие json_schema, а разбор ответа у нас всё равно свой.
  svoj: {
    imya: 'Свой API — любой OpenAI-совместимый адрес',
    gdeKlyuch: '',
    svoyAdres: true,
    modeli: [],
    ceny: {},
    async spisokModeley(klyuch, adres) {
      const u = bazaSvoego(adres);
      const r = await fetch(u + '/models', { headers: klyuch ? { Authorization:'Bearer '+klyuch } : {} });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      const spisok = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).sort();
      if (!spisok.length) throw new Error('адрес ответил, но список моделей пуст');
      return spisok;
    },
    async razobrat(klyuch, model, foto, promt, adres) {
      const soderzhanie = [{ type:'text', text: promt }];
      for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
      const j = await poslat(bazaSvoego(adres) + '/chat/completions',
        { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch },
        { model, messages:[{ role:'user', content: soderzhanie }], temperature:0.2,
          response_format:{ type:'json_object' } },
        'Свой API');
      const u = j.usage || {};
      return { dannye: razobratJson(j?.choices?.[0]?.message?.content, 'Свой API'),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },
};

// Приводим введённый адрес к базе: с протоколом, без хвостового слэша и без
// уже дописанного /chat/completions.
export function bazaSvoego(adres) {
  let u = String(adres || '').trim();
  if (!u) throw new Error('не задан адрес своего API');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
  return u;
}

// ---------- общее ----------

export async function razobrat(post, klyuch, model, foto, dopolnenie, adres) {
  const p = POSTAVSHCHIKI[post];
  if (!p) throw new Error('неизвестный поставщик: ' + post);
  if (!klyuch) throw new Error(p.imya + ': нет ключа');
  const promt = PROMT_RAZBOR + (dopolnenie ? '\n\n' + dopolnenie : '');
  const t0 = performance.now();
  const r = await p.razobrat(klyuch, model, foto, promt, adres);
  const tela = (r.dannye?.tela || []).slice().sort((a,b) => (a.nomer||0) - (b.nomer||0));
  tela.forEach((t, i) => { t.nomer = i+1; t.istochnik = p.imya + ' · ' + model; });
  return {
    istochnik: p.imya, post, model,
    tela,
    uverennost: r.dannye?.uverennostObshchaya ?? 0.7,
    somneniya: r.dannye?.somneniya || [],
    rashod: r.rashod, sekund: +((performance.now()-t0)/1000).toFixed(1),
  };
}

export async function proverit(post, klyuch, model, adres) {
  const p = POSTAVSHCHIKI[post];
  if (!p) return { ok:false, tekst:'неизвестный поставщик' };
  if (!klyuch) return { ok:false, tekst:p.imya + ': ключ не введён.' };
  const adr = String(adres || p.adresPoUmolchaniyu || '').trim();
  if (p.svoyAdres && !adr)
    return { ok:false, tekst:'Не задан адрес API — впиши его рядом с ключом.' };
  try {
    const spisok = await p.spisokModeley(klyuch, adr);
    const est = !model || spisok.includes(model);
    return { ok: est, modeli: spisok, kartinki: spisok.kartinki || [],
      tekst: p.imya + ': ключ рабочий, доступно ' + spisok.length + ' моделей' +
             (spisok.kartinki && spisok.kartinki.length ? ', из них ' + spisok.kartinki.length + ' рисуют картинки' : '') +
             (spisok.zryachih ? ', из них ' + spisok.zryachih + ' видят картинки' : '') + '.' +
             (est ? ' Выбранная модель на месте.' : ' Но модели «' + model + '» среди них нет — список обновлён, выбери из него.') };
  } catch (e) {
    let m = e.message || String(e);
    if (/Failed to fetch|NetworkError/i.test(m))
      m += post === 'nvidia'
        ? ' — NVIDIA не отдаёт заголовки CORS, из браузера напрямую к ней не достучаться. ' +
          'Поставь свой прокси и впиши его адрес рядом с ключом.'
        : ' — похоже на блокировку сети, VPN или расширение браузера.';
    return { ok:false, tekst: p.imya + ': ' + m };
  }
}

export function stoimost(post, model, rashod) {
  const c = POSTAVSHCHIKI[post]?.ceny?.[model];
  if (!c || !rashod) return null;
  return rashod.vhod/1e6*c.vhod + rashod.vyhod/1e6*c.vyhod;
}

// ---------- картинки (пока только Gemini) ----------

export const MODELI_KARTINOK = ['gemini-3.1-flash-image','gemini-3.1-flash-lite-image',
                                'gemini-3-pro-image','gemini-2.5-flash-image'];
export const CENY_KARTINOK = { 'gemini-3.1-flash-image':0.067, 'gemini-3.1-flash-lite-image':0.0336,
                               'gemini-3-pro-image':0.134, 'gemini-2.5-flash-image':0.10 };

/**
 * Нарисовать один чистый вид детали по фотографии.
 * Шаблон вёрстки сюда НЕ идёт: он нужен для листа разбора, а здесь важно,
 * чтобы в кадре был один предмет на белом и ни одной посторонней линии.
 */
export async function narisovatVid(klyuch, model, foto, promt) {
  const j = await poslat(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    { 'Content-Type':'application/json', 'x-goog-api-key': klyuch },
    { contents:[{ role:'user', parts:[
        { text: promt },
        { inline_data:{ mime_type: foto.mime||'image/png', data: foto.b64 } }] }],
      generationConfig:{ responseModalities:['TEXT','IMAGE'], temperature:0.15 } },
    'Gemini');
  for (const p of (j?.candidates?.[0]?.content?.parts || [])) {
    const d = p.inline_data || p.inlineData;
    if (d?.data) return { kartinka: 'data:' + (d.mime_type||d.mimeType||'image/png') + ';base64,' + d.data,
                          mime: d.mime_type||d.mimeType||'image/png', b64: d.data };
  }
  throw new Error('модель не вернула картинку');
}

export async function narisovatList(klyuch, model, shablon, foto, promt) {
  const j = await poslat(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    { 'Content-Type':'application/json', 'x-goog-api-key': klyuch },
    { contents:[{ role:'user', parts:[
        { text: promt },
        { inline_data:{ mime_type: shablon.mime||'image/png', data: shablon.b64 } },
        { inline_data:{ mime_type: foto.mime||'image/png', data: foto.b64 } }] }],
      generationConfig:{ responseModalities:['TEXT','IMAGE'] } },
    'Gemini');
  for (const p of (j?.candidates?.[0]?.content?.parts || [])) {
    const d = p.inline_data || p.inlineData;
    if (d?.data) return { kartinka: 'data:' + (d.mime_type||d.mimeType||'image/png') + ';base64,' + d.data };
  }
  throw new Error('модель не вернула картинку');
}

export { PROMT_SVERKA, SHEMA_SVERKI };
