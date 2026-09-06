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

/**
 * Заголовки HTTP умеют только латиницу-1. Если в ключ или в имя модели
 * затесалась кириллица — а это бывает сплошь и рядом, стоит набрать «х» в
 * русской раскладке вместо латинского «x», — fetch падает с невразумительным
 * «String contains non ISO-8859-1 code point». Ловим заранее и говорим
 * по-человечески, что именно чинить.
 */
export function proverZagolovki(zagolovki, imya) {
  for (const [klyuch, znachenie] of Object.entries(zagolovki || {})) {
    const plohie = [...String(znachenie)].filter(c => c.charCodeAt(0) > 255);
    if (!plohie.length) continue;
    const gde = /^authorization$/i.test(klyuch) ? 'в ключе'
              : /^x-model$/i.test(klyuch)        ? 'в имени модели'
              : 'в заголовке ' + klyuch;
    throw new Error(imya + ': ' + gde + ' есть нелатинские символы (' +
      [...new Set(plohie)].join(' ') + '). Скорее всего набрано в русской раскладке — ' +
      'например «х» вместо латинской «x». Заголовки такое не переносят: перенаберите латиницей.');
  }
}

/**
 * Сколько ждать ответа. Без потолка одна задумчивая модель вешает весь синтез:
 * рассуждающие модели вроде nemotron думают минутами, а пользователь видит
 * бесконечное «идёт» и не понимает, кто виноват.
 */
export const ZHDAT_SEKUND = 150;

async function poslat(url, zagolovki, telo, imya, sekund) {
  proverZagolovki(zagolovki, imya);
  const predel = (sekund || ZHDAT_SEKUND) * 1000;
  const strazh = new AbortController();
  const budilnik = setTimeout(() => strazh.abort(), predel);
  let r;
  try {
    r = await fetch(url, { method:'POST', headers:zagolovki,
                           body:JSON.stringify(telo), signal: strazh.signal });
  }
  catch (e) {
    if (e && e.name === 'AbortError')
      throw new Error(imya + ': модель не ответила за ' + Math.round(predel/1000) +
        ' секунд и запрос снят. Рассуждающие модели бывают очень медленными — ' +
        'возьми другую из списка или повтори позже.');
    throw new Error(imya + ': сеть не пустила запрос (' + e.message + ')');
  }
  finally { clearTimeout(budilnik); }
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) {
    const m = j?.error?.message || j?.message || t.slice(0, 240);
    if (/rate-limited upstream|ResourceExhausted|request limit reached|temporarily rate-limited/i.test(m))
      throw new Error(imya + ': выбранная бесплатная модель сейчас занята у провайдера. ' +
        'Возьми другую из списка — например minimax/minimax-m3:free — или повтори через минуту. ' +
        'Ответ поставщика: ' + m);
    if (r.status === 402 || /more credits|insufficient|can only afford/i.test(m))
      throw new Error(imya + ': не хватает кредитов на счёте. ' +
        'Пополни счёт у поставщика — либо переключи «Через кого рисовать» на ' +
        '«Свой адрес» и рисуй бесплатно через свой Cloudflare Worker ' +
        '(модель @cf/black-forest-labs/flux-1-schnell). Ответ поставщика: ' + m);
    throw new Error(imya + ' ответил ' + r.status + ': ' + m);
  }
  if (!j) throw new Error(imya + ': ответ не разобрался');
  return j;
}

/**
 * Мелкие модели переводят имена полей на русский: «тела» вместо tela, «тип»
 * вместо tip. Формально они правы — промпт по-русски, — но приложение ждёт
 * латиницу и молча получает ноль тел. Переименовываем известные ключи обратно.
 * Значения не трогаем: там перечисления, и они и так латиницей.
 */
const KLYUCHI_PO_RUSSKI = {
  'тела':'tela', 'тело':'tela', 'номер':'nomer', 'тип':'tip', 'сечение':'sechenie',
  'рёбра':'rebra', 'ребра':'rebra', 'зубцов':'zubcov', 'зубцы':'zubcov',
  'направлениеЗубцов':'napravlenieZubcov', 'направление_зубцов':'napravlenieZubcov',
  'доляВысоты':'dolyaVysoty', 'доля_высоты':'dolyaVysoty',
  'доляШирины':'dolyaShiriny', 'доля_ширины':'dolyaShiriny',
  'сужается':'suzhaetsya', 'описание':'opisanie', 'уверенность':'uverennost',
  'типДетали':'tipDetali', 'тип_детали':'tipDetali',
  'видовНаФото':'vidovNaFoto', 'видов_на_фото':'vidovNaFoto',
  'сомнения':'somneniya', 'уверенностьОбщая':'uverennostObshchaya',
};
// Правильные имена полей в нижнем регистре — чтобы поймать «uVerennost»,
// «DolyaVysoty» и прочие вольности с заглавными буквами.
const PRAVILNYE = {};
for (const k of ['nomer','tip','sechenie','rebra','zubcov','napravlenieZubcov','dolyaVysoty',
                 'dolyaShiriny','suzhaetsya','opisanie','uverennost','tela','tipDetali',
                 'vidovNaFoto','somneniya','uverennostObshchaya'])
  PRAVILNYE[k.toLowerCase()] = k;

function poLatinice(v) {
  if (Array.isArray(v)) return v.map(poLatinice);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const [k, z] of Object.entries(v)) {
    const imya = KLYUCHI_PO_RUSSKI[k] || PRAVILNYE[String(k).toLowerCase()] || k;
    o[imya] = poLatinice(z);
  }
  return o;
}

/**
 * Достать JSON из ответа модели.
 *
 * Мелкие зрячие модели (llama-4-scout и подобные) любят сперва рассказать
 * словами, потом выдать JSON, а иногда обрамить его забором ```json. Бывает и
 * фигурная скобка внутри самой прозы — тогда «от первой { до последней }» даёт
 * мусор. Поэтому ищем настоящие сбалансированные объекты: идём по каждой
 * открывающей скобке, считаем вложенность с учётом строк и экранирования, и
 * берём самый крупный кусок, который действительно разобрался.
 */
/**
 * Слабые модели любят ответить списком в markdown вместо JSON: «- **tela**: 5»
 * и так далее. Разбирать такую прозу — гиблое дело, надёжнее переспросить,
 * прижав модель к стенке. Этот хвост дописывается к промпту на втором заходе.
 */
const TOLKO_JSON = `

ВНИМАНИЕ. Предыдущий ответ был не в том формате. Ответь ЗАНОВО и строго так:
первый символ ответа — открывающая фигурная скобка, последний — закрывающая.
Никакого текста до и после, никаких пояснений, никаких списков, никакого
markdown, ни одной звёздочки и ни одного дефиса в начале строк. Только JSON.`;

/**
 * Спросить и, если ответ оказался не JSON, переспросить один раз жёстче.
 * `sprosit(dopolnenie)` должна выполнить запрос и вернуть текст ответа.
 */
async function sprositJson(sprosit, imya) {
  let pervyj;
  try { pervyj = await sprosit(''); return { dannye: razobratJson(pervyj, imya), povtor: false }; }
  catch (e) {
    if (!/не похож на JSON|пустой ответ/.test(e.message)) throw e;
    const vtoroj = await sprosit(TOLKO_JSON);
    return { dannye: razobratJson(vtoroj, imya), povtor: true };
  }
}

function razobratJson(tekst, imya) {
  if (!tekst) throw new Error(imya + ': пустой ответ');

  // Не всякий сервис отдаёт строку. Workers AI на зрячих моделях иногда кладёт
  // в content уже разобранный объект, а некоторые — массив кусков вида
  // [{type:'text',text:'...'}]. Раньше это превращалось в «[object Object]» и
  // выглядело как «ответ не похож на JSON», хотя ответ был правильный.
  if (typeof tekst === 'object') {
    if (Array.isArray(tekst)) {
      const sobrano = tekst.map(k => (typeof k === 'string' ? k : (k && (k.text || k.content)) || ''))
                           .filter(Boolean).join('\n').trim();
      if (sobrano) return razobratJson(sobrano, imya);
      throw new Error(imya + ': ответ пришёл списком, но текста в нём нет');
    }
    return tekst;                       // уже готовый объект — он и есть ответ
  }

  const t = String(tekst).trim();

  const poprobovat = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

  const celikom = poprobovat(t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  if (celikom !== undefined) return celikom;

  // заборы ```json ... ``` в любом месте текста
  for (const m of [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].reverse()) {
    const j = poprobovat(m[1].trim());
    if (j !== undefined) return j;
  }

  // сбалансированные объекты
  const kandidaty = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    let gl = 0, vStroke = false, ekran = false;
    for (let k = i; k < t.length; k++) {
      const c = t[k];
      if (ekran) { ekran = false; continue; }
      if (c === '\\') { ekran = true; continue; }
      if (c === '"') { vStroke = !vStroke; continue; }
      if (vStroke) continue;
      if (c === '{') gl++;
      else if (c === '}') { gl--; if (!gl) { kandidaty.push(t.slice(i, k+1)); break; } }
    }
  }
  kandidaty.sort((a, b) => b.length - a.length);
  for (const k of kandidaty) { const j = poprobovat(k); if (j !== undefined) return j; }

  throw new Error(imya + ': ответ не похож на JSON. Начало ответа: ' + t.slice(0, 160));
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
      return { dannye: poLatinice(razobratJson(t, 'Gemini')),
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
      return { dannye: poLatinice(razobratJson(j?.choices?.[0]?.message?.content, 'OpenAI')),
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
    // Проверено живыми запросами 6 сентября: minimax отвечает за 14 с и даёт
    // готовый JSON с телами — на нём и стоим. nemotron от NVIDIA зрячий и
    // бесплатный, но это рассуждающая модель: на полном промпте она думала
    // больше двух с половиной минут и не ответила, плюс упирается в лимит
    // провайдера. Берём её только осознанно. gemma сейчас глухо отбивает 429.
    modeli: ['minimax/minimax-m3:free','nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
             'openrouter/free','google/gemma-4-31b-it:free',
             'google/gemini-2.5-flash','qwen/qwen2.5-vl-72b-instruct','meta-llama/llama-4-maverick'],
    ceny: {},
    async spisokModeley(klyuch) {
      const r = await fetch('https://openrouter.ai/api/v1/models',
                            { headers: klyuch ? { Authorization:'Bearer '+klyuch } : {} });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      const zryachie = (j.data||[]).filter(m => (m.architecture?.input_modalities||[]).includes('image'));
      const darom = m => +((m.pricing||{}).prompt||1) === 0 && +((m.pricing||{}).completion||1) === 0;
      const besplatnye = zryachie.filter(darom).map(m => m.id).sort();
      const platnye = zryachie.filter(m => !darom(m)).map(m => m.id).sort();
      const spisok = [...besplatnye, ...platnye];
      spisok.besplatnyh = besplatnye.length;
      spisok.besplatnye = besplatnye;
      return spisok;
    },
    async razobrat(klyuch, model, foto, promt) {
      // Бесплатные модели строгую json_schema чаще всего не тянут и отвечают
      // ошибкой про response_format. Им отдаём мягкий json_object, платным —
      // строгую схему, как и раньше.
      const besplatnaya = /:free$/.test(model) || model === 'openrouter/free';
      const format = besplatnaya
        ? { type:'json_object' }
        : { type:'json_schema', json_schema:{ name:'razbor_klipsy', strict:true, schema: strogaya(SHEMA) } };
      let u = {};
      const sprosit = async (hvost) => {
        const soderzhanie = [{ type:'text', text: promt + hvost }];
        for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
        const j = await poslat('https://openrouter.ai/api/v1/chat/completions',
          { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch,
            'HTTP-Referer':location.origin, 'X-Title':'klipsa-3d' },
          { model, messages:[{ role:'user', content: soderzhanie }], temperature:0.2,
            max_tokens: 2000, response_format: format },
          'OpenRouter');
        u = j.usage || {};
        return j?.choices?.[0]?.message?.content;
      };
      const r = await sprositJson(sprosit, 'OpenRouter');
      return { dannye: poLatinice(r.dannye),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },
  // Hugging Face — маршрутизатор OpenAI-совместимый и, что редкость, открытый
  // для браузера: проверено запросом с чужого сайта, отвечает 200. Есть
  // бесплатный месячный лимит.
  huggingface: {
    imya: 'Hugging Face — маршрутизатор',
    gdeKlyuch: 'https://huggingface.co/settings/tokens',
    modeli: ['Qwen/Qwen3-VL-235B-A22B-Instruct','Qwen/Qwen3-VL-30B-A3B-Instruct',
             'meta-llama/Llama-4-Scout-17B-16E-Instruct','google/gemma-3-27b-it',
             'Qwen/Qwen2.5-VL-72B-Instruct','CohereLabs/aya-vision-32b'],
    ceny: {},
    async spisokModeley(klyuch) {
      const r = await fetch('https://router.huggingface.co/v1/models',
                            { headers: klyuch ? { Authorization:'Bearer '+klyuch } : {} });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      const zr = (j.data||[]).filter(m =>
        /vision|-vl|vl-|llava|gemma-3|internvl|smolvlm|pixtral|llama-4|aya-vision/i.test(m.id));
      return [...zr.map(m=>m.id).sort(), ...(j.data||[]).map(m=>m.id).filter(x=>!zr.some(z=>z.id===x)).sort()];
    },
    async razobrat(klyuch, model, foto, promt) {
      const soderzhanie = [{ type:'text', text: promt }];
      for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
      const j = await poslat('https://router.huggingface.co/v1/chat/completions',
        { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch },
        { model, messages:[{ role:'user', content: soderzhanie }], temperature:0.2,
          response_format:{ type:'json_object' } },
        'Hugging Face');
      const u = j.usage || {};
      return { dannye: poLatinice(razobratJson(j?.choices?.[0]?.message?.content, 'Hugging Face')),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },

  // Together AI — тоже OpenAI-совместимый и тоже пускает браузер напрямую.
  together: {
    imya: 'Together AI',
    gdeKlyuch: 'https://api.together.xyz/settings/api-keys',
    modeli: ['meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
             'meta-llama/Llama-Vision-Free','Qwen/Qwen2.5-VL-72B-Instruct'],
    ceny: {},
    async spisokModeley(klyuch) {
      const r = await fetch('https://api.together.xyz/v1/models',
                            { headers: klyuch ? { Authorization:'Bearer '+klyuch } : {} });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      const spisok = (Array.isArray(j) ? j : (j.data||[])).map(m => m.id || m.name).filter(Boolean);
      const darom = spisok.filter(x => /free/i.test(x)).sort();
      return [...darom, ...spisok.filter(x => !/free/i.test(x)).sort()];
    },
    async razobrat(klyuch, model, foto, promt) {
      const soderzhanie = [{ type:'text', text: promt }];
      for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
      const j = await poslat('https://api.together.xyz/v1/chat/completions',
        { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch },
        { model, messages:[{ role:'user', content: soderzhanie }], temperature:0.2, max_tokens:4096 },
        'Together');
      const u = j.usage || {};
      return { dannye: poLatinice(razobratJson(j?.choices?.[0]?.message?.content, 'Together')),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },

  // NVIDIA NIM — каталог build.nvidia.com. Адрес OpenAI-совместимый, картинка
  // идёт обычным image_url. НО: напрямую из браузера NVIDIA не отвечает — она
  // не отдаёт заголовки CORS (проверено дважды, и на /models, и на
  // /chat/completions). Поэтому сюда вписывается не её адрес, а адрес нашего
  // воркера: он ходит к NVIDIA со стороны сервера, где правила CORS нет.
  nvidia: {
    imya: 'NVIDIA NIM — каталог build.nvidia.com',
    gdeKlyuch: 'https://build.nvidia.com/settings/api-keys',
    svoyAdres: true,
    adresPoUmolchaniyu: 'https://integrate.api.nvidia.com/v1',
    podskazka: 'Ключ — кнопкой <b>Generate API Key</b> на build.nvidia.com/settings/api-keys. ' +
      'Ключ обязан начинаться с <b>nvapi-</b>: персональный ключ NGC вида «uuid:hex» даёт 401. ' +
      '<b>Адрес — не NVIDIA, а наш воркер:</b> ' +
      '<b>https://klipsa.&lt;логин&gt;.workers.dev/nvidia/v1</b>. Напрямую браузер к NVIDIA не ' +
      'пускают (нет заголовков CORS), а воркер ходит со стороны сервера и ключ у себя не хранит. ' +
      'Новый index.js уже лежит в <b>ClipGen\\klipsa-worker</b> — осталась одна команда ' +
      'в этой папке: <b>npx wrangler deploy</b>.',
    modeli: ['meta/llama-3.2-90b-vision-instruct','meta/llama-3.2-11b-vision-instruct',
             'google/gemma-3-12b-it','microsoft/phi-3-vision-128k-instruct','nvidia/neva-22b'],
    ceny: {},
    async spisokModeley(klyuch, adres) {
      const baza = bazaSvoego(adres || 'https://integrate.api.nvidia.com/v1');
      if (pryamoNaNvidia(baza))
        throw new Error('прямой адрес из браузера недостижим (нет CORS) — нужен шлюз');
      const r = await fetch(baza + '/models',
                            { headers: klyuch ? { Authorization:'Bearer '+klyuch } : {} });
      const j = await r.json();
      if (!r.ok) {
        const t = j?.error || j?.detail || j?.title || ('HTTP ' + r.status);
        if (r.status === 403) throw new Error(OTKAZ_403);
        if (r.status === 404 && STARYJ_VORKER.test(String(t)))
          throw new Error('шлюз отвечает, но пути /nvidia/v1 у него нет — на воркере ' +
            'лежит первая версия. Выложи вторую: в папке ClipGen\\klipsa-worker ' +
            'уже лежит нужный index.js, осталась одна команда — npx wrangler deploy.');
        throw new Error(typeof t === 'string' ? t : JSON.stringify(t));
      }
      const vse = (j.data||[]).map(m => m.id);
      // модальность в списке не указана — отбираем по имени, зрячие вперёд
      const spisok = zryachieVpered(vse);
      return spisok;
    },
    async razobrat(klyuch, model, foto, promt, adres) {
      if (pryamoNaNvidia(adres || 'https://integrate.api.nvidia.com/v1'))
        throw new Error('NVIDIA: прямой адрес из браузера недостижим (нет CORS). ' +
          'Впиши адрес шлюза https://klipsa.<логин>.workers.dev/nvidia/v1 рядом с ключом.');
      const url = bazaSvoego(adres) + '/chat/completions';
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
        if (/\b403\b|Authorization failed/i.test(e.message)) throw new Error(OTKAZ_403);
        if (!/nvext|guided|400|422/i.test(e.message)) throw e;
        j = await poslat(url, zag, telo, 'NVIDIA');
      }
      const u = j.usage || {};
      return { dannye: poLatinice(razobratJson(j?.choices?.[0]?.message?.content, 'NVIDIA')),
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
      const vse = (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean);
      if (!vse.length) throw new Error('адрес ответил, но список моделей пуст');
      return zryachieVpered(vse);
    },
    async razobrat(klyuch, model, foto, promt, adres) {
      let u = {};
      const sprosit = async (hvost) => {
        const soderzhanie = [{ type:'text', text: promt + hvost }];
        for (const f of foto) soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
        const j = await poslat(bazaSvoego(adres) + '/chat/completions',
          { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch },
          { model, messages:[{ role:'user', content: soderzhanie }], temperature:0.2,
            response_format:{ type:'json_object' } },
          'Свой API');
        u = j.usage || {};
        return j?.choices?.[0]?.message?.content;
      };
      const r = await sprositJson(sprosit, 'Свой API');
      return { dannye: poLatinice(r.dannye),
               rashod:{ vhod:u.prompt_tokens||0, vyhod:u.completion_tokens||0 } };
    },
  },
};

/**
 * Зрячие модели вперёд, и посчитать сколько их. Имена у всех поставщиков
 * разные, но узнаваемые: llama-4-scout и maverick видят картинки, хотя слова
 * vision в имени нет.
 */
export function zryachieVpered(vse) {
  const zryachie = vse.filter(id =>
    /vision|-vl|vl-|vlm|llava|neva|kosmos|fuyu|gemma-3|paligemma|internvl|pixtral|maverick|scout|moondream|aya-vision|deplot/i.test(id));
  const spisok = [...zryachie.sort(), ...vse.filter(id => !zryachie.includes(id)).sort()];
  spisok.zryachih = zryachie.length;
  return spisok;
}

// Приводим введённый адрес к базе: с протоколом, без хвостового слэша и без
// уже дописанного /chat/completions.
export function bazaSvoego(adres) {
  let u = String(adres || '').trim();
  if (!u) throw new Error('не задан адрес своего API');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
  return u;
}

// Адрес шлюза для NVIDIA угадываем по адресу «своего» API. Свой API у нас —
// Cloudflare Worker; начиная с версии 2 у того же воркера есть путь
// /nvidia/v1 (проброс на integrate.api.nvidia.com) и /nvidia-genai (проброс
// на картиночный ai.api.nvidia.com). Значит, отдельный адрес вводить не надо:
// он выводится из уже работающего.
export function podskazatAdresNvidia(adresSvoego) {
  try {
    const u = new URL(bazaSvoego(adresSvoego));
    if (!/workers\.dev$/i.test(u.hostname) && !/\/v1$/.test(u.pathname)) return '';
    return u.origin + '/nvidia/v1';
  } catch (e) { return ''; }
}

// Прямой адрес NVIDIA из браузера недостижим — проверено дважды. Отличаем его,
// чтобы не тратить 150 секунд на заведомо мёртвый запрос.
export const pryamoNaNvidia = (adres) => {
  const s = String(adres || '').trim();
  if (!s) return false;
  try {
    const h = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s).hostname;
    return /(^|\.)nvidia\.com$/i.test(h);
  } catch (e) { return /nvidia\.com/i.test(s); }
};

// NVIDIA на неверный ключ отвечает не 401, а 403 «Authorization failed», и отвечает
// так на ЛЮБУЮ модель. При этом список моделей /v1/models она отдаёт вообще без ключа —
// поэтому «Проверить» может сказать «ключ рабочий», а разбор потом упасть. Разделяем:
// 401 без заголовка — шлюз не передал ключ; 403 — ключ передан, но NVIDIA его не приняла.
const OTKAZ_403 =
  'NVIDIA не приняла ключ (403 Authorization failed). Шлюз при этом работает — значит ' +
  'дело в самом ключе: он отозван, просрочен или это ключ другого типа. Сделай новый на ' +
  'build.nvidia.com/settings/api-keys кнопкой Generate API Key — он должен начинаться ' +
  'с nvapi-. Ключ NGC вида «uuid:hex» здесь не подходит.';

// Ответ старого воркера (версии 1) на путь /nvidia/... — «нет такого пути».
const STARYJ_VORKER = /нет такого пути/i;

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
  // Прямой адрес NVIDIA заведомо не работает из браузера: у неё нет CORS.
  // Не ходим туда вовсе, а сразу говорим, что вписать.
  if (post === 'nvidia' && pryamoNaNvidia(adr))
    return { ok:false, tekst:'NVIDIA: прямой адрес ' + adr + ' из браузера недостижим — ' +
      'у NVIDIA нет заголовков CORS (проверено дважды). Впиши сюда адрес нашего шлюза: ' +
      'https://klipsa.<логин>.workers.dev/nvidia/v1' };
  // Кириллица в ключе или в имени модели роняет fetch на уровне заголовков,
  // причём сообщением, из которого ничего не понять. Проверяем до запроса.
  try { proverZagolovki({ Authorization: 'Bearer ' + klyuch, 'X-Model': model || '' }, p.imya); }
  catch (e) { return { ok:false, tekst: e.message }; }
  try {
    const spisok = await p.spisokModeley(klyuch, adr);
    const est = !model || spisok.includes(model);
    return { ok: est, modeli: spisok, kartinki: spisok.kartinki || [],
      tekst: p.imya + ': ключ рабочий, доступно ' + spisok.length + ' моделей' +
             (spisok.kartinki && spisok.kartinki.length ? ', из них ' + spisok.kartinki.length + ' рисуют картинки' : '') +
             (spisok.zryachih ? ', из них ' + spisok.zryachih + ' видят картинки' : '') +
             (spisok.besplatnyh ? ', БЕСПЛАТНЫХ зрячих ' + spisok.besplatnyh : '') + '.' +
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
/**
 * Чем рисовать картинки. У Google для картиночных моделей нужен биллинг —
 * на бесплатном ключе они отвечают 429. Те же модели несёт OpenRouter, и
 * платятся они его кредитами: биллинг Google не нужен вовсе.
 */
export const RISOVALKI = {
  openrouter: { imya: 'OpenRouter — те же модели Google, биллинг Google не нужен',
                modeli: ['google/gemini-3.1-flash-image','google/gemini-3.1-flash-lite-image',
                         'google/gemini-2.5-flash-image','google/gemini-3-pro-image',
                         'openai/gpt-5-image-mini'] },
  gemini:     { imya: 'Google напрямую — картинкам нужен биллинг на ключе',
                modeli: ['gemini-3.1-flash-image','gemini-3.1-flash-lite-image',
                         'gemini-3-pro-image','gemini-2.5-flash-image'] },
  nvidia:     { imya: 'NVIDIA через свой шлюз — flux и stable diffusion',
                modeli: ['black-forest-labs/flux.1-schnell',
                         'black-forest-labs/flux.1-dev',
                         'stabilityai/stable-diffusion-3-medium',
                         'stabilityai/sdxl-turbo',
                         'briaai/bria-2.3'] },
  svoj:       { imya: 'Свой адрес — Cloudflare Worker или шлюз на своём сервере',
                modeli: ['@cf/black-forest-labs/flux-1-schnell',
                         '@cf/black-forest-labs/flux-2-klein-4b',
                         '@cf/runwayml/stable-diffusion-v1-5-img2img',
                         '@cf/stabilityai/stable-diffusion-xl-base-1.0',
                         '@cf/bytedance/stable-diffusion-xl-lightning',
                         'black-forest-labs/flux.1-schnell',
                         'black-forest-labs/flux.1-dev',
                         'stabilityai/stable-diffusion-3.5-large'] },
};

/**
 * Видит ли рисовалка присланную фотографию.
 *
 * Чат-модели (нанобанана и её родня) принимают картинку и рисуют «эту же
 * деталь». Чистые диффузионки — flux, stable diffusion, sdxl — фотографию не
 * видят вовсе: у них на входе только текст. Просить у них эталонный вид
 * конкретной клипсы бессмысленно, а лист разбора — тем более: получится
 * красивая посторонняя железка, иногда с выдуманными буквами.
 */
export const risovalkaVidit = (model) =>
  !/flux|stable-diffusion|sdxl|dreamshaper|lightning|sana|shuttle/i.test(String(model || ''));

// Картинки у NVIDIA живут на другом хосте — ai.api.nvidia.com, путь
// /v1/genai/<вендор>/<модель>, тело {prompt, mode, steps, seed, cfg_scale},
// ответ — artifacts[0].base64. У нашего воркера это путь /nvidia-genai/...
// Адрес выводим из адреса чатового шлюза: .../nvidia/v1 → .../nvidia-genai/v1
export function bazaGenaiNvidia(adres) {
  const u = bazaSvoego(adres || '');
  if (/\/nvidia\/v1$/i.test(u)) return u.replace(/\/nvidia\/v1$/i, '/nvidia-genai/v1');
  if (/\/nvidia-genai\/v1$/i.test(u)) return u;
  if (pryamoNaNvidia(u)) throw new Error('прямой адрес NVIDIA из браузера недостижим — нужен шлюз');
  return u.replace(/\/v1$/i, '') + '/nvidia-genai/v1';
}

/** Нарисовать картинку через выбранного поставщика. */
export async function narisovatCherez(post, klyuch, model, foto, promt, adres, promtKratkij) {
  if (post === 'gemini') return narisovatVid(klyuch, model, foto, promt);
  if (post === 'nvidia') {
    // Это чистые диффузионки: фотографию они не видят, поэтому им уходит
    // короткий английский промпт — длинный русский их фильтр отбивает.
    const url = bazaGenaiNvidia(adres) + '/genai/' + model;
    const j = await poslat(url,
      { 'Content-Type':'application/json', Accept:'application/json',
        Authorization:'Bearer ' + klyuch },
      { prompt: (promtKratkij || promt).slice(0, 900), mode:'base',
        cfg_scale: 3.5, steps: /schnell|turbo/i.test(model) ? 4 : 25, seed: 0 },
      'NVIDIA-картинки');
    const b64 = j?.artifacts?.[0]?.base64 || j?.image || j?.data?.[0]?.b64_json;
    if (!b64) throw new Error('NVIDIA не вернула картинку (ответ без artifacts)');
    return { kartinka: 'data:image/png;base64,' + b64, mime:'image/png', b64 };
  }
  if (post === 'openrouter' || post === 'svoj') {
    const baza = post === 'svoj' ? bazaSvoego(adres) : 'https://openrouter.ai/api/v1';
    // Чистые рисовалки (flux, stable diffusion) картинку не видят и длинный
    // русский текст не переваривают — их фильтр отвечает «8007: NSFW content».
    // Им уходит короткий английский промпт; чат-моделям — подробный русский.
    const chistayaRisovalka = /flux|stable-diffusion|sdxl|dreamshaper|lightning|sana|shuttle/i.test(model);
    const tekst = (chistayaRisovalka && promtKratkij) ? promtKratkij : promt;
    const soderzhanie = [{ type:'text', text: tekst }];
    for (const f of (Array.isArray(foto) ? foto : [foto]))
      soderzhanie.push({ type:'image_url', image_url:{ url: dataUrl(f) } });
    // HTTP-Referer и X-Title — фирменные заголовки OpenRouter (для статистики).
    // Своему адресу их слать нельзя: чужой сервер не перечислит их в
    // Access-Control-Allow-Headers, предполётный запрос не пройдёт, и fetch
    // упадёт с «Failed to fetch» — на вид как обрыв сети, хотя сервер жив.
    const zagolovki = { 'Content-Type':'application/json', Authorization:'Bearer '+klyuch };
    if (post === 'openrouter') {
      zagolovki['HTTP-Referer'] = location.origin;
      zagolovki['X-Title'] = 'klipsa-3d';
    }
    // Потолок ответа обязателен. Без него OpenRouter резервирует под ответ весь
    // контекст модели — десятки тысяч токенов — и отбивает запрос по деньгам
    // (402), хотя картинка стоит около 1200 токенов. Ставим 4096 с запасом.
    // Если на счёте меньше, поставщик прямо пишет, сколько может себе позволить:
    // берём эту цифру и повторяем один раз. Так рисование живёт до последних
    // копеек на счёте, а не падает, когда их «почти хватает».
    const imya = post === 'svoj' ? 'Свой адрес' : 'OpenRouter';
    const zapros = (mt) => ({ model, modalities:['image','text'], max_tokens: mt,
                              messages:[{ role:'user', content: soderzhanie }] });
    const MIN_NA_KARTINKU = 1400;
    let j;
    try { j = await poslat(baza + '/chat/completions', zagolovki, zapros(4096), imya); }
    catch (e) {
      const mozhno = +((/can only afford\s+(\d+)/i.exec(e.message) || [])[1] || 0);
      if (!mozhno || mozhno < MIN_NA_KARTINKU) throw e;
      j = await poslat(baza + '/chat/completions', zagolovki,
                       zapros(mozhno - 50), imya);
    }
    const m = j?.choices?.[0]?.message || {};
    const k = (m.images || [])[0];
    const url = k?.image_url?.url || k?.url || (typeof k === 'string' ? k : null);
    if (!url) throw new Error('модель не вернула картинку (ответ без images)');
    const zpt = url.indexOf(',');
    return { kartinka: url, mime: (url.slice(5, url.indexOf(';')) || 'image/png'),
             b64: zpt > 0 ? url.slice(zpt+1) : '' };
  }
  throw new Error('неизвестная рисовалка: ' + post);
}

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
