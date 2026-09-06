// Эталонные проверки: записанные разборы настоящих деталей.
// Работают без ключа и без сети — на них видно, что конструктор цел.
const t = (nomer, tip, sechenie, dolyaVysoty, dolyaShiriny, extra = {}) => Object.assign({
  nomer, tip, sechenie, rebra: 0, zubcov: 0, napravlenieZubcov: 'net',
  dolyaVysoty, dolyaShiriny, suzhaetsya: 'net', opisanie: '', uverennost: 0.85,
}, extra);

export const PROBY = [
  { p:'Auveco 24484', o:'Пистон обшивки, плита и ёлочка',
    kat:{ shirinaMm:16 },
    izmer:{ os:'вертикально', cvet:[52,122,74], vysotaKShirine:1.29, zapolnennost:.46, polosy:
      [.55,.95,1,.98,.42,.33,.31,.34,.55,.72,.73,.66,.5,.52,.52,.52,.52,.52,.52,.52,
       .52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.52,.5,.44,.36,.3,.26,.24,.21,.17,.12] },
    tela:[
      t(1,'plita','pryamougolnoe',0.10,1.00,{opisanie:'прямоугольная плита',uverennost:0.9}),
      t(2,'shejka','krugloe',0.14,0.33,{opisanie:'гладкая шейка'}),
      t(3,'vorotnik','krugloe',0.11,0.73,{opisanie:'воротник-ограничитель',suzhaetsya:'kverhu'}),
      t(4,'elochka','krugloe',0.51,0.52,{zubcov:7,napravlenieZubcov:'vverh',opisanie:'ёлочка, 7 лепестков',uverennost:0.9}),
      t(5,'ostrie','krugloe',0.14,0.21,{opisanie:'носик-конус',suzhaetsya:'knizu',uverennost:0.8})] },

  { p:'Жёлтая клипса обшивки', o:'Три диска и нос с рёбрами',
    kat:{ shirinaMm:20 },
    izmer:{ os:'вертикально', cvet:[243,231,83], vysotaKShirine:1.30, zapolnennost:.55, polosy:
      [.71,.78,.79,.77,.47,.43,.92,1,1,.99,.78,.54,.68,.81,.93,.95,.94,.77,.56,.59,
       .6,.59,.57,.56,.54,.52,.5,.49,.47,.45,.43,.42,.4,.38,.37,.35,.3,.24,.18,.12] },
    tela:[
      t(1,'disk','krugloe',0.09,0.79,{opisanie:'верхний диск',uverennost:0.9}),
      t(2,'shejka','krugloe',0.07,0.45,{opisanie:'шейка'}),
      t(3,'disk','krugloe',0.11,1.00,{opisanie:'средний диск',uverennost:0.92}),
      t(4,'vorotnik','krugloe',0.16,0.95,{opisanie:'воротник-юбка',suzhaetsya:'kverhu',uverennost:0.82}),
      t(5,'konus','krest_s_rebrami',0.57,0.60,{rebra:4,opisanie:'нос с четырьмя рёбрами',suzhaetsya:'knizu',uverennost:0.75})] },

  { p:'Auveco 14319', o:'Купол и разрезной конус',
    kat:{ shirinaMm:20 },
    izmer:{ os:'вертикально', cvet:[46,110,68], vysotaKShirine:1.05, zapolnennost:.5, polosy:
      [.8,.98,1,.95,.4,.36,.36,.9,.94,.9,.86,.82,.78,.74,.7,.66,.62,.58,.55,.52,
       .49,.46,.43,.4,.37,.34,.31,.28,.26,.24,.22,.2,.18,.17,.16,.15,.14,.13,.12,.1] },
    tela:[
      t(1,'shlyapka_kupol','krugloe',0.16,1.00,{opisanie:'купольная шляпка',uverennost:0.9}),
      t(2,'shejka','krugloe',0.06,0.38,{opisanie:'шейка',uverennost:0.8}),
      t(3,'konus','razreznoe',0.78,0.95,{rebra:2,opisanie:'разрезной конус',suzhaetsya:'knizu'})] },

  { p:'Auveco 21382', o:'Плита молдинга и ёлочка',
    kat:{ shirinaMm:17.5 },
    izmer:{ os:'вертикально', cvet:[64,64,68], vysotaKShirine:1.45, zapolnennost:.42, polosy:
      [.7,1,.98,.32,.3,.3,.3,.3,.3,.3,.3,.3,.5,.54,.5,.46,.54,.5,.46,.54,
       .5,.46,.54,.5,.46,.54,.5,.46,.54,.5,.46,.5,.44,.38,.32,.28,.24,.2,.16,.12] },
    tela:[
      t(1,'plita','pryamougolnoe',0.11,1.00,{opisanie:'плита молдинга',uverennost:0.88}),
      t(2,'shejka','krugloe',0.28,0.31,{opisanie:'шейка'}),
      t(3,'elochka','krugloe',0.61,0.54,{zubcov:5,napravlenieZubcov:'vverh',opisanie:'ёлочка, 5 лепестков',uverennost:0.87})] },
];
