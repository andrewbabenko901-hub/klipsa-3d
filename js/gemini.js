// Обращения к Gemini напрямую из браузера. Ключ живёт только в localStorage
// этого браузера, никуда не отправляется кроме самого Google.
const BAZA = 'https://generativelanguage.googleapis.com/v1beta/models/';

export const TIPY = ['shlyapka_disk','shlyapka_kupol','shlyapka_vint','plita','ploshchadka',
  'disk','shejka','vorotnik','yubka','poyasok','katushka','vtulka','elochka','konus','ostrie',
  'lapki','kryl_ya','kletka','skoba','gajka','rezba','shajba','proushina','hvostovik','prochee'];

export const SECHENIYA = ['krugloe','krest_s_rebrami','srezannoe_ploskostyami',
  'mnogogrannik','pryamougolnoe','oval','razreznoe','trubchatoe'];

export const SHEMA = {
  type:'object',
  properties:{
    tela:{ type:'array', minItems:1, maxItems:8, items:{ type:'object', properties:{
      nomer:{type:'integer'},
      tip:{type:'string', enum:TIPY},
      sechenie:{type:'string', enum:SECHENIYA},
      rebra:{type:'integer'},
      zubcov:{type:'integer'},
      napravlenieZubcov:{type:'string', enum:['vverh','vniz','net']},
      dolyaVysoty:{type:'number'},
      dolyaShiriny:{type:'number'},
      suzhaetsya:{type:'string', enum:['net','knizu','kverhu']},
      opisanie:{type:'string'},
      uverennost:{type:'number'},
    }, required:['nomer','tip','sechenie','rebra','zubcov','napravlenieZubcov',
                 'dolyaVysoty','dolyaShiriny','suzhaetsya','opisanie','uverennost'] } },
    tipDetali:{type:'string'},
    vidovNaFoto:{type:'integer'},
    somneniya:{type:'array', items:{type:'string'}},
    uverennostObshchaya:{type:'number'},
  },
  required:['tela','tipDetali','vidovNaFoto','uverennostObshchaya'],
};

export const PROMT_RAZBOR = `Ты разбираешь фотографию пластиковой автомобильной клипсы на составные тела.

Смотри внимательно. Красные стрелки и любые пометки на фото — чужая разметка,
не часть детали, игнорируй их. Если в кадре несколько ракурсов одной детали,
разбирай по самому информативному, а их число укажи в vidovNaFoto.

ПРАВИЛО РАЗРЕЗА. Новое тело начинается там, где меняется сечение. Отдельным
телом считается каждая ступень, шляпка, плита, площадка, диск, поясок, юбка,
воротник, гладкая шейка, зубчатая секция, лапка, остриё. Число тел определяешь
по самой детали, от одного до восьми, ни под какое заданное число не подгоняй.

ИСКЛЮЧЕНИЕ, ОНО ВАЖНЕЕ ПРАВИЛА РАЗРЕЗА. Подряд идущие одинаковые зубцы,
лепестки или воротники одной ёлочки — это ОДНО тело с повторяющимся рельефом.
Разрезать ёлочку на отдельные зубцы нельзя. Число зубцов посчитай и запиши в
zubcov, направление — в napravlenieZubcov.

СЕЧЕНИЕ — САМОЕ ВАЖНОЕ ПОЛЕ. По силуэту сбоку круглый конус, конус со срезанными
плоскостями и конус с выступающими рёбрами выглядят одинаково. Различить можно
только по бликам и линиям на поверхности:
- krugloe — гладкое тело вращения, продольных линий нет.
- krest_s_rebrami — из тела ВЫСТУПАЮТ плоские рёбра, поверхность между ними
  утоплена и выглядит вогнутой; ребро даёт яркую узкую полосу блика вдоль оси.
- srezannoe_ploskostyami — наоборот, тело ОБРЕЗАНО плоскостями: грани плоские и
  широкие, а рёбра это лишь линии стыка, ничего не выступает.
- mnogogrannik — правильный многоугольник, все грани одинаковые.
- razreznoe — продольные сквозные щели делят тело на лапки.
- trubchatoe — сквозное осевое отверстие.
Если сечение не круглое, обязательно посчитай число рёбер, граней или лапок и
запиши в rebra. Сомневаешься между krest_s_rebrami и srezannoe_ploskostyami —
поставь uverennost этого тела ниже 0.6 и напиши об этом в somneniya.

ПРОПОРЦИИ. dolyaVysoty — доля полной высоты детали, сумма по телам примерно 1.
dolyaShiriny — ширина тела как доля самого широкого места, у самого широкого 1.0.
Миллиметры не указывай, их мы меряем сами.

opisanie — три-пять слов по-русски, что это за кусок.
Отвечай строго по схеме, без пояснений вокруг.`;

export const PROMT_KARTINKA_HVOST = `
ЗАПРЕЩЕНО НА ЛИСТЕ: буквы, слова, цифры, подписи, заголовки, номера, таблицы,
кружки, выноски, стрелки, размерные линии, пунктир, рамки, сетка, линейки,
логотипы, водяные знаки. Только тела на светло-сером фоне и одна вертикальная
разделительная линия посередине.`;

export function promtKartinki(tela) {
  const spisok = tela.map((t, i) => (i+1) + ') ' + (t.opisanie || t.tip)).join(', ');
  return `САМОЕ ГЛАВНОЕ: на первом изображении нарисована СОВСЕМ ДРУГАЯ, ПОСТОРОННЯЯ
деталь. Её форму копировать КАТЕГОРИЧЕСКИ НЕЛЬЗЯ, и перекрашивать её в другой
цвет тоже нельзя. Первое изображение — шаблон ВЁРСТКИ, он показывает только где
на листе что расположено, в каком стиле и в каком ракурсе рисовать. На шаблоне
нет ни одной буквы и ни одной цифры — у тебя тоже их быть не должно.

Рисуешь ИСКЛЮЧИТЕЛЬНО деталь со ВТОРОГО фото, повторяя её геометрию: те же
ступени, те же диаметры, те же высоты, тот же низ.

Сгенерируй ОДНО изображение в такой же вёрстке: горизонтальный лист, разделённый
ровно посередине одной тонкой вертикальной линией, однородный светло-серый фон,
мягкий рассеянный свет, пластик того же цвета, что на втором фото.

ЛЕВАЯ ПОЛОВИНА — четыре вида детали сеткой два на два: слева вверху вид спереди,
справа вверху вид сбоку, слева внизу вид сверху, справа внизу изометрия.

ПРАВАЯ ПОЛОВИНА — та же деталь, разобранная на отдельные тела, одним вертикальным
столбцом по общей оси, сверху вниз в том же порядке, что в детали, с равными
просветами, тела не соприкасаются.

ТЕЛ РОВНО ${tela.length}, вот они сверху вниз: ${spisok}.
Подряд идущие одинаковые зубцы одной ёлочки — это одно тело целиком.

РАКУРС ТЕЛ СПРАВА — СТРОГО В ПРОФИЛЬ. Камера ровно на высоте каждого тела, линия
горизонта проходит через тело, ни одной верхней или нижней плоскости не видно,
никаких овалов, никакой перспективы, никакого вида три четверти, никаких парящих
наклонённых деталей. Диск — плоская полоска, воротник — трапеция, остриё —
треугольник.` + PROMT_KARTINKA_HVOST;
}

export const SHEMA_SVERKI = {
  type:'object',
  properties:{
    sovpadaet:{type:'boolean'},
    rashozhdeniya:{type:'array', maxItems:8, items:{type:'object', properties:{
      telo:{type:'integer'},
      chtoNeTak:{type:'string', enum:['sechenie','chisloReber','chisloZubcov','proporcii',
                                      'lishneeTelo','propushchenoTelo','napravlenie','forma']},
      dolzhnoByt:{type:'string'},
      uverennost:{type:'number'},
    }, required:['telo','chtoNeTak','dolzhnoByt','uverennost']}},
  },
  required:['sovpadaet','rashozhdeniya'],
};

export const PROMT_SVERKA = `На первом изображении фотография настоящей детали, на втором —
трёхмерная модель, которую мы по ней собрали. Скажи, где модель расходится с
оригиналом. Смотри прежде всего на сечение тел: круглое, с выступающими рёбрами,
срезанное плоскостями, многогранное — именно это по силуэту не видно. Дальше
число зубцов, число рёбер и лапок, пропорции, лишние и пропущенные тела.
К цвету, свету, фону и качеству рендера не придирайся — только геометрия.
Совпадений нет — sovpadaet true и пустой список. Отвечай строго по схеме.`;

function chast(b64, mime) { return { inline_data: { mime_type: mime || 'image/png', data: b64 } }; }

async function poslat(klyuch, model, telo) {
  const r = await fetch(BAZA + encodeURIComponent(model) + ':generateContent', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-goog-api-key': klyuch },
    body: JSON.stringify(telo),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error('ответ не разобрался: ' + t.slice(0,200)); }
  if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
  return j;
}

function tekstIz(j) {
  const p = j?.candidates?.[0]?.content?.parts || [];
  return p.map(x => x.text || '').join('').trim();
}
function kartinkaIz(j) {
  const p = j?.candidates?.[0]?.content?.parts || [];
  for (const x of p) {
    const d = x.inline_data || x.inlineData;
    if (d && d.data) return 'data:' + (d.mime_type || d.mimeType || 'image/png') + ';base64,' + d.data;
  }
  return null;
}
export function rashodIz(j) {
  const u = j?.usageMetadata || {};
  return { vhod: u.promptTokenCount || 0,
           vyhod: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
}

export async function razobrat(klyuch, model, foto, dopolnenie) {
  const chasti = [{ text: PROMT_RAZBOR + (dopolnenie ? '\n\n' + dopolnenie : '') }];
  for (const f of foto) chasti.push(chast(f.b64, f.mime));
  const j = await poslat(klyuch, model, {
    contents: [{ role:'user', parts: chasti }],
    generationConfig: { responseMimeType:'application/json', responseSchema: SHEMA, temperature: 0.2 },
  });
  const t = tekstIz(j);
  if (!t) throw new Error('пустой ответ модели');
  return { dannye: JSON.parse(t), rashod: rashodIz(j) };
}

export async function narisovatList(klyuch, model, shablon, foto, promt) {
  const j = await poslat(klyuch, model, {
    contents: [{ role:'user', parts: [{ text: promt }, chast(shablon.b64, shablon.mime), chast(foto.b64, foto.mime)] }],
    generationConfig: { responseModalities: ['TEXT','IMAGE'] },
  });
  const im = kartinkaIz(j);
  if (!im) throw new Error('модель не вернула картинку');
  return { kartinka: im, rashod: rashodIz(j) };
}

export async function sverit(klyuch, model, foto, render) {
  const j = await poslat(klyuch, model, {
    contents: [{ role:'user', parts: [{ text: PROMT_SVERKA }, chast(foto.b64, foto.mime), chast(render.b64, render.mime)] }],
    generationConfig: { responseMimeType:'application/json', responseSchema: SHEMA_SVERKI, temperature: 0.1 },
  });
  return { dannye: JSON.parse(tekstIz(j) || '{}'), rashod: rashodIz(j) };
}

export const CENY = {
  'gemini-3.5-flash-lite': { vhod: 0.30, vyhod: 2.50 },
  'gemini-3.5-flash':      { vhod: 0.60, vyhod: 3.50 },
  'gemini-3.1-flash-image':      { kartinka: 0.067 },
  'gemini-3.1-flash-lite-image': { kartinka: 0.0336 },
  'gemini-3-pro-image':          { kartinka: 0.134 },
  'gemini-2.5-flash-image':      { kartinka: 0.10 },
};
