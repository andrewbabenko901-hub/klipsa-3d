// Подключение разных нейронок. Один интерфейс, четыре поставщика.
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
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
                            { headers:{ 'x-goog-api-key': klyuch } });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
      return (j.models||[]).map(m => String(m.name).replace('models/',''));
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
};

// ---------- общее ----------

export async function razobrat(post, klyuch, model, foto, dopolnenie) {
  const p = POSTAVSHCHIKI[post];
  if (!p) throw new Error('неизвестный поставщик: ' + post);
  if (!klyuch) throw new Error(p.imya + ': нет ключа');
  const promt = PROMT_RAZBOR + (dopolnenie ? '\n\n' + dopolnenie : '');
  const t0 = performance.now();
  const r = await p.razobrat(klyuch, model, foto, promt);
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

export async function proverit(post, klyuch, model) {
  const p = POSTAVSHCHIKI[post];
  if (!p) return { ok:false, tekst:'неизвестный поставщик' };
  if (!klyuch) return { ok:false, tekst:p.imya + ': ключ не введён.' };
  try {
    const spisok = await p.spisokModeley(klyuch);
    const est = !model || spisok.includes(model);
    return { ok: est, modeli: spisok,
      tekst: p.imya + ': ключ рабочий, доступно ' + spisok.length + ' моделей.' +
             (est ? ' Выбранная модель на месте.' : ' Но модели «' + model + '» среди них нет.') };
  } catch (e) {
    let m = e.message || String(e);
    if (/Failed to fetch|NetworkError/i.test(m))
      m += ' — похоже на блокировку сети, VPN или расширение браузера.';
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
