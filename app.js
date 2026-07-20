/* ═══════════════════════════════════════════════════════════════════════
   Саханхой — Lineage Keeper
   ═══════════════════════════════════════════════════════════════════════ */

const CFG = window.SITE_CONFIG || {};
const SPACING_X = 120, SPACING_Y = 150, NODE_R = 24;
const GRID_X = SPACING_X / 2, GRID_Y = SPACING_Y / 2;
/* The chart opens with three near-invisible root generations (Özd, Lom,
   Ghaydmr) before it fans out. Multiplying only those top gaps keeps them
   distinct without stretching the whole tree. */
const TOP_GEN_GAP = 2.0;
function rowY(depth){
  const extra = Math.min(depth, 3) * SPACING_Y * (TOP_GEN_GAP - 1);
  return depth * SPACING_Y + 70 + extra;
}
const PALETTE = ['#c4903f','#748067','#b1583f','#5f7ea3','#9a6a4f','#8471a0','#4c8a75',
                 '#c2a25c','#5f8a78','#a1607a','#5b7a45','#87699a','#8f8248','#4f7a8a'];
const MIN_K = 0.03, MAX_K = 3;

let state = null, baseData = null;
let currentUser = {name:'', role:'viewer'};
let viewT = {x:0, y:0, k:1};
let collapsed = new Set();
let highlightSet = null;
let tooltipEnabled = true;
let langDisplay = 'both';
let draggingId = null, dragMoved = false, dragStart = null;
let isPanning = false, panStart = null;
let layoutCache = null, contentBox = null;
let undoStack = [], redoStack = [];
let selectedIds = new Set();
let linkDrag = null;           // {fromId, x, y} while dragging a relationship
let labelPlan = new Set();     // ids whose names are drawn at this zoom
let labelRefreshTimer = null;
let dragOrigin = new Map();

const $ = id => document.getElementById(id);
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => (s==null?'':String(s)).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* ============================= STORAGE =============================
   The reference build used window.storage, which exists only inside
   Claude artifacts. Here we use localStorage, falling back to memory
   where that is blocked, so the page never hard-fails. */
const memBag = {};
const store = {
  ok:(()=>{ try{ localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; }catch(e){ return false; } })(),
  get(k,d){ try{ const v=this.ok?localStorage.getItem(k):memBag[k]; return v==null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ const s=JSON.stringify(v); try{ this.ok?localStorage.setItem(k,s):(memBag[k]=s); }catch(e){ memBag[k]=s; } }
};
const K = {state:'lk.state', user:'lk.user'};

function saveState(){
  store.set(K.state, {
    edits:state.edits, positions:state.positions, pending:state.pending,
    audit:state.audit, passcodes:state.passcodes, tags:state.tags,
    versions:state.versions, ui:state.ui
  });
}
const saveUser = () => store.set(K.user, currentUser);

/* ============================= DATES & TIME =============================
   Stored as YYYY, YYYY-MM or YYYY-MM-DD. Shown as DD-MM-YYYY, and
   every clock reading is 24-hour. */
const pad = n => String(n).padStart(2,'0');
function fmtDate(v){
  if(!v) return '';
  const [y,m,d] = String(v).split('-');
  if(d) return `${d}-${m}-${y}`;
  if(m) return `${m}-${y}`;
  return y;
}
function fmtDateTime(iso){
  const t = new Date(iso);
  if(isNaN(t)) return String(iso||'');
  return `${pad(t.getDate())}-${pad(t.getMonth()+1)}-${t.getFullYear()} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}
const nowISO = () => new Date().toISOString();
const daysInMonth = (y,m) => new Date(y||2000, m, 0).getDate();

/* A fixed DD-MM-YYYY control. Day and month may be left blank when only
   the year is known, which is true for most of this chart. */
function buildDateField(host, value){
  const [y,m,d] = String(value||'').split('-');
  host.innerHTML = `
    <select class="dd"><option value="">DD</option>${
      Array.from({length:31},(_,i)=>`<option value="${pad(i+1)}"${pad(i+1)===d?' selected':''}>${pad(i+1)}</option>`).join('')}</select>
    <span class="sep">–</span>
    <select class="mm"><option value="">MM</option>${
      Array.from({length:12},(_,i)=>`<option value="${pad(i+1)}"${pad(i+1)===m?' selected':''}>${pad(i+1)}</option>`).join('')}</select>
    <span class="sep">–</span>
    <input class="yy" type="number" min="1" max="2200" placeholder="YYYY" value="${y||''}">`;
  const dd=host.querySelector('.dd'), mm=host.querySelector('.mm'), yy=host.querySelector('.yy');
  const clamp = ()=>{
    if(dd.value && mm.value){
      const max = daysInMonth(+yy.value||2000, +mm.value);
      if(+dd.value > max) dd.value = pad(max);         // 31-02 can never be typed
    }
    host.classList.toggle('bad', (!!dd.value && !mm.value) || ((dd.value||mm.value) && !yy.value));
  };
  [dd,mm,yy].forEach(el=>el.addEventListener('change', clamp));
  clamp();
}
function readDateField(host){
  const dd=host.querySelector('.dd').value, mm=host.querySelector('.mm').value, yy=host.querySelector('.yy').value;
  if(!yy) return '';
  if(!mm) return String(yy);
  if(!dd) return `${yy}-${mm}`;
  return `${yy}-${mm}-${dd}`;
}

/* ============================= I18N ============================= */
const I18N = {
  en:{
    brandTitle:'Sahanhoy', searchPh:'Search a name (typos okay)…', fieldsBtn:'Fields', fieldsTitle:'What to show',
    onHover:'Hover', onSelect:'Card', hoverTags:'Show tags on hover',
    scriptBoth:'Both scripts', scriptRu:'Cyrillic only', scriptEn:'Latin only',
    logIn:'Log in', signOut:'Sign out', signedIn:'Signed in',
    whoAreYou:'Who are you?', yourName:'Your name', namePh:'e.g. Adam Musaev', role:'Role',
    roleViewer:'Viewer — look only', roleContributor:'Contributor — suggest changes',
    roleModerator:'Moderator — confirm and delete', roleAdmin:'Admin — full editing',
    passcode:'Passcode', save:'Save',
    passcodeHint:'Moderator and Admin passcodes are a soft, shared-community gate — not real security. The published tree only changes when someone commits data/people.json.',
    addPerson:'Add a person', nameRu:'Имя (RU)', nameEn:'Name (EN)',
    translitHint:'Type either script and the other fills itself in.',
    born:'Born', died:'Died', father:'Father', familyName:'Family name', notes:'Notes',
    addPersonBtn:'Add person', newFamily:'New family name', newTeip:'New teip', newTukkhum:'New tukkhum',
    pending:'Pending suggestions', families:'Families', teips:'Teips', tukkhums:'Tukkhums',
    verification:'Verification',
    filterHint:'Click families to show only those. Click again to clear.',
    dashHint:'A dashed link means the father–son connection could not be read with certainty from the original chart.',
    exportXlsx:'Export Excel', importXlsx:'Import Excel', adminDataHint:'Download the tree for backup, import an edited spreadsheet, or wipe every local edit. Edits reach other people only after you commit people.json to the repository.',
    exportJson:'people.json', exportBackup:'Backup', importBackup:'Restore',
    dataHint:'Excel round-trips the whole tree. Editing is undoable, and every change is kept in Versions.',
    versions:'Versions', adminSettings:'Admin settings', modPass:'Moderator passcode',
    adminPass:'Admin passcode', savePasscodes:'Save passcodes', resetLocal:'Reset local edits…',
    activity:'Activity log', emptyTitle:'No one on the map yet', emptyBody:'Sign in as Admin, then add the first ancestor →',
    family:'Family', teip:'Teip', tukkhum:'Tukkhum', lived:'Lived', age:'Age',
    ageAtDeath:'Age at death', generation:'Generation', sons:'Sons', line:'Line',
    source:'Source', status:'Status', below:'below',
    sourceHint:'Pick one you have used before, or type a new one.',
    sources:'Sources', sourcesHint:'Every source in use. Removing one clears it from the people who cite it.',
    removeSource:'Remove this source', removeSourceBody:'It will be cleared from everyone citing it. The people stay.',
    highlightLine:'Highlight this line', centreMap:'Centre on map', suggestChange:'Suggest a change',
    edit:'Edit', addSon:'Add a son', del:'Delete', cancel:'Cancel', restore:'Restore',
    approve:'Approve', reject:'Reject', github:'GitHub',
    suggestTitle:'Suggest a change', whatCorrect:'What to correct', shouldSay:'What it should say',
    describe:'Describe the correction', whereFrom:'Where this comes from', sendSuggestion:'Send suggestion',
    openIssue:'Open as GitHub issue', somethingElse:'Something else',
    linkConf:'Link confidence', nameConf:'Spelling confidence',
    confChart:'Read from the chart', confUnverified:'Unverified (dashed)', confAdded:'Added later',
    confHigh:'Confident', confMedium:'Needs checking', confLow:'Uncertain',
    rootAncestor:'— root ancestor —', none:'— None (root ancestor) —', newTag:'+ new…',
    noFamily:'no family name', unverifiedLink:'unverified link', spellingCheck:'spelling to check',
    savedLocally:'Saved locally.', deleted:'Deleted locally.', added:'Added locally.',
    signedInAs:'Signed in as', wrongPass:'That passcode is not right.',
    nothingFound:'No one by that name.', nothingYet:'Nothing yet.', noVersions:'No saved versions yet.',
    lineageLit:'Lineage highlighted.', undone:'Undone.', redone:'Redone.',
    nothingUndo:'Nothing to undo.', nothingRedo:'Nothing to redo.',
    restored:'Restored that version.', confirmRestore:'Restore this version? Current local edits are kept in the undo stack.',
    confirmDelete:'Delete', reparent:'His sons will be attached to', becomeRoots:'His sons will become root ancestors.',
    downloadFirst:'Commit this to publish.', setRepo:'Set your repo in config.js first.',
    storageOff:'Storage unavailable — edits last until reload.',
    nameNeeded:'A name in either script is enough.', addedHint:'Added. Export people.json to publish it.',
    fatherSetTo:'Father set to', people:'people', patrilineal:'patrilineal',
    editMode:'Edit mode', realign:'Realign', realigned:'Generations realigned.',
    linkCancelled:'Cancelled — drop onto a name to connect.',
    detach:'Detach from father', clearHighlight:'Clear highlight',
    clearHighlightTip:'Remove the lineage highlight and show everyone again',
    showingOnly:'Showing only', deleteFamily:'Delete family name',
    deleteFamilyBody:'This removes the family name from everyone who carries it. The people stay.',
    source:'Source', sourcePh:'Choose or type a source', loops:'That would make a loop.',
    viewModeOn:'View mode — editing is off.', editModeOn:'Edit mode — editing is on.',
    addChildHere:'Add a son here', reparentHint:'Drag onto another person to change the father, or onto empty space to detach.',
    reparented:'Father changed.', detached:'Detached — now a root ancestor.',
    selected:'selected', confirmTitle:'Are you sure?', yes:'Yes', no:'Cancel',
    typeToSearch:'Type a name in either script…', clear:'Clear',
    excelHint:'Excel file loaded — review and undo if it looks wrong.',
    csvFallback:'Excel library unavailable, exported CSV instead (opens in Excel).'
  },
  ru:{
    brandTitle:'Саханхой', searchPh:'Найти имя (опечатки не страшны)…', fieldsBtn:'Поля', fieldsTitle:'Что показывать',
    onHover:'Наведение', onSelect:'Карточка', hoverTags:'Подсказка при наведении',
    scriptBoth:'Оба алфавита', scriptRu:'Только кириллица', scriptEn:'Только латиница',
    logIn:'Войти', signOut:'Выйти', signedIn:'Вы вошли',
    whoAreYou:'Кто вы?', yourName:'Ваше имя', namePh:'напр. Адам Мусаев', role:'Роль',
    roleViewer:'Гость — только просмотр', roleContributor:'Участник — предлагать правки',
    roleModerator:'Модератор — подтверждать и удалять', roleAdmin:'Администратор — полное редактирование',
    passcode:'Код доступа', save:'Сохранить',
    passcodeHint:'Коды модератора и администратора — это общий негласный барьер, а не настоящая защита. Опубликованное дерево меняется только когда кто-то коммитит data/people.json.',
    addPerson:'Добавить человека', nameRu:'Имя (кир.)', nameEn:'Имя (лат.)',
    translitHint:'Введите один алфавит — второй заполнится сам.',
    born:'Родился', died:'Умер', father:'Отец', familyName:'Фамилия', notes:'Примечание',
    addPersonBtn:'Добавить', newFamily:'Новая фамилия', newTeip:'Новый тейп', newTukkhum:'Новый тукхум',
    pending:'Предложения', families:'Фамилии', teips:'Тейпы', tukkhums:'Тукхумы',
    verification:'Проверка',
    filterHint:'Выберите фамилии, чтобы показать только их. Повторный клик снимает выбор.',
    dashHint:'Пунктирная линия означает, что связь «отец — сын» не удалось уверенно прочитать на оригинале.',
    exportXlsx:'Выгрузить Excel', importXlsx:'Загрузить Excel', adminDataHint:'Скачать дерево для резервной копии, загрузить исправленную таблицу или стереть все локальные правки. Правки видны другим только после коммита people.json в репозиторий.',
    exportJson:'people.json', exportBackup:'Копия', importBackup:'Восстановить',
    dataHint:'Excel выгружает и принимает всё дерево. Правки можно отменить, каждое изменение сохраняется в «Версиях».',
    versions:'Версии', adminSettings:'Настройки администратора', modPass:'Код модератора',
    adminPass:'Код администратора', savePasscodes:'Сохранить коды', resetLocal:'Сбросить локальные правки…',
    activity:'Журнал', emptyTitle:'На карте пока никого', emptyBody:'Войдите администратором и добавьте первого предка →',
    family:'Фамилия', teip:'Тейп', tukkhum:'Тукхум', lived:'Годы жизни', age:'Возраст',
    ageAtDeath:'Прожил', generation:'Колено', sons:'Сыновья', line:'Линия',
    source:'Источник', status:'Статус', below:'ниже',
    sourceHint:'Выберите использованный ранее или введите новый.',
    sources:'Источники', sourcesHint:'Все используемые источники. Удаление снимает источник у тех, кто на него ссылается.',
    removeSource:'Удалить источник', removeSourceBody:'Он будет снят у всех, кто на него ссылается. Люди останутся.',
    highlightLine:'Подсветить линию', centreMap:'Показать на карте', suggestChange:'Предложить правку',
    edit:'Редактировать', addSon:'Добавить сына', del:'Удалить', cancel:'Отмена', restore:'Восстановить',
    approve:'Принять', reject:'Отклонить', github:'GitHub',
    suggestTitle:'Предложить правку', whatCorrect:'Что уточняем', shouldSay:'Как должно быть',
    describe:'Опишите правку', whereFrom:'Откуда сведения', sendSuggestion:'Отправить',
    openIssue:'Оформить issue на GitHub', somethingElse:'Другое',
    linkConf:'Уверенность в связи', nameConf:'Уверенность в написании',
    confChart:'Прочитано со схемы', confUnverified:'Не подтверждено (пунктир)', confAdded:'Добавлено позже',
    confHigh:'Уверенно', confMedium:'Требует проверки', confLow:'Ненадёжно',
    rootAncestor:'— первопредок —', none:'— нет (первопредок) —', newTag:'+ новый…',
    noFamily:'без фамилии', unverifiedLink:'связь не подтверждена', spellingCheck:'проверить написание',
    savedLocally:'Сохранено локально.', deleted:'Удалено локально.', added:'Добавлено локально.',
    signedInAs:'Вы вошли как', wrongPass:'Код не подошёл.',
    nothingFound:'Никого с таким именем.', nothingYet:'Пока пусто.', noVersions:'Сохранённых версий пока нет.',
    lineageLit:'Линия подсвечена.', undone:'Отменено.', redone:'Возвращено.',
    nothingUndo:'Отменять нечего.', nothingRedo:'Возвращать нечего.',
    restored:'Версия восстановлена.', confirmRestore:'Восстановить эту версию? Текущие правки останутся в истории отмены.',
    confirmDelete:'Удалить', reparent:'Его сыновья перейдут к', becomeRoots:'Его сыновья станут первопредками.',
    downloadFirst:'Закоммитьте файл, чтобы опубликовать.', setRepo:'Сначала укажите репозиторий в config.js.',
    storageOff:'Хранилище недоступно — правки живут до перезагрузки.',
    nameNeeded:'Достаточно имени в одном алфавите.', addedHint:'Добавлено. Выгрузите people.json, чтобы опубликовать.',
    fatherSetTo:'Отец:', people:'человек', patrilineal:'по мужской линии',
    editMode:'Режим правки', realign:'Выровнять', realigned:'Поколения выровнены.',
    linkCancelled:'Отменено — отпустите на имени, чтобы связать.',
    detach:'Отсоединить от отца', clearHighlight:'Убрать подсветку',
    clearHighlightTip:'Убрать подсветку линии и показать всех',
    showingOnly:'Показаны только', deleteFamily:'Удалить фамилию',
    deleteFamilyBody:'Фамилия будет снята со всех, кто её носит. Люди останутся.',
    sourcePh:'Выберите или введите источник', loops:'Получилась бы петля.',
    viewModeOn:'Режим просмотра — правка выключена.', editModeOn:'Режим правки — правка включена.',
    addChildHere:'Добавить сюда сына', reparentHint:'Перетащите на другого человека, чтобы сменить отца, или на пустое место, чтобы отсоединить.',
    reparented:'Отец изменён.', detached:'Отсоединён — теперь первопредок.',
    selected:'выбрано', confirmTitle:'Вы уверены?', yes:'Да', no:'Отмена',
    typeToSearch:'Введите имя любым алфавитом…', clear:'Очистить',
    excelHint:'Файл Excel загружен — проверьте и отмените, если что-то не так.',
    csvFallback:'Библиотека Excel недоступна, выгружен CSV (открывается в Excel).'
  }
};
let LANG = 'en';
const t = k => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;

const FIELD_KEYS = ['family','teip','tukkhum','lived','age','generation','sons','line','notes','source','flags'];

function applyLang(){
  document.documentElement.lang = LANG;
  const bt = $('brandTitle'); if(bt) bt.textContent = t('brandTitle');
  document.title = t('brandTitle') + ' — Lineage Keeper';
  const chb = $('clearHighlightBtn');
  if(chb){ chb.textContent='✕ '+t('clearHighlight'); chb.title=t('clearHighlightTip'); }
  $('uiLangBtn').textContent = LANG === 'en' ? 'EN' : 'РУ';
  document.querySelectorAll('[data-i18n]').forEach(n=>{ n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(n=>{ n.placeholder = t(n.dataset.i18nPh); });
  $('brandSub').textContent = `${t('patrilineal')} · ${state.people.length} ${t('people')}`;
  renderFieldRows();
}

/* ============================= TRANSLITERATION ============================= */
const CY2LA_DI = [['оь','ö'],['уь','ü'],['аь','ä'],['хь','h'],['хӏ','h'],['хi','h'],
  ['къ','q'],['кх','kh'],['кӏ',"k'"],['кi',"k'"],['гӏ','gh'],['гi','gh'],
  ['тӏ',"t'"],['тi',"t'"],['цӏ',"ts'"],['цi',"ts'"],['чӏ',"ch'"],['чi',"ch'"],['пӏ',"p'"],['пi',"p'"]];
const CY2LA = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',
  л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',
  ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',ӏ:"'",i:"'"};
function cyrToLat(str){
  const s=String(str||'').toLowerCase(); let out='',i=0;
  outer: while(i<s.length){
    for(const [c,l] of CY2LA_DI) if(s.startsWith(c,i)){ out+=l; i+=c.length; continue outer; }
    out += (s[i] in CY2LA)?CY2LA[s[i]]:s[i]; i++;
  }
  return out.replace(/(^|[\s-])([a-zäöü'])/g,(m,a,b)=>a+b.toUpperCase());
}
const LA2CY_DI = [['shch','щ'],['ch','ч'],['sh','ш'],['zh','ж'],['kh','х'],['gh','гӏ'],
  ['ts','ц'],['yo','ё'],['yu','ю'],['ya','я'],['ö','оь'],['ü','уь'],['ä','аь']];
const LA2CY = {a:'а',b:'б',v:'в',g:'г',d:'д',e:'е',z:'з',i:'и',k:'к',l:'л',m:'м',n:'н',
  o:'о',p:'п',r:'р',s:'с',t:'т',u:'у',f:'ф',h:'хь',q:'къ',y:'й',c:'ц',j:'ж',w:'в',x:'кс',"'":'ӏ'};
function latToCyr(str, titleCase){
  const s=String(str||'').toLowerCase(); let out='',i=0;
  outer: while(i<s.length){
    for(const [l,c] of LA2CY_DI) if(s.startsWith(l,i)){ out+=c; i+=l.length; continue outer; }
    out += (s[i] in LA2CY)?LA2CY[s[i]]:s[i]; i++;
  }
  if(!titleCase) return out.toUpperCase();
  /* Family names read as Иванов, not ИВАНОВ. */
  return out.replace(/(^|[\s-])(\S)/g, (m,a,b)=>a+b.toUpperCase());
}
function fold(str){
  let s = cyrToLat(String(str||'')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return s.replace(/['’ʼ`]/g,'').replace(/shch|sh/g,'s').replace(/ch/g,'c').replace(/zh/g,'j')
    .replace(/kh/g,'h').replace(/gh/g,'g').replace(/ts/g,'c').replace(/y[aou]/g,'a')
    .replace(/[yij]/g,'i').replace(/[eo]/g,'o').replace(/[^a-z]/g,'').replace(/(.)\1+/g,'$1');
}
function lev(a,b){
  if(a===b) return 0;
  if(!a.length||!b.length) return Math.max(a.length,b.length);
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
}
function personScore(q,p){
  const fq=fold(q); if(!fq) return 99;
  let best=99;
  for(const cand of [fold(p.nameRu), fold(p.nameEn)]){
    if(!cand) continue;
    if(cand===fq) best=Math.min(best,0);
    else if(cand.startsWith(fq)) best=Math.min(best,1);
    else if(cand.includes(fq)) best=Math.min(best,2);
    else{ const d=lev(fq,cand); if(d<=Math.max(1,Math.ceil(cand.length*0.4))) best=Math.min(best,3+d); }
  }
  if(fq.length>2 && fold(p.family||'').includes(fq)) best=Math.min(best,4);
  return best;
}

/* Live two-way transliteration. A field is refilled whenever it is empty
   or still holds text we generated ourselves; anything typed by hand is
   left alone. */
function wireTranslit(ruEl, enEl, seedRu, seedEn, titleCase){
  const toCyr = v => latToCyr(v, titleCase);
  /* If the existing Latin spelling already matches what we would have
     generated, treat it as ours and keep it in step. If someone has
     overridden it, leave it alone. */
  let autoRu = (seedEn && toCyr(seedEn)===seedRu) ? seedRu : null;
  let autoEn = (seedRu && cyrToLat(seedRu)===seedEn) ? seedEn : null;
  const mine = (el, auto) => !el.value.trim() || el.value === auto;
  ruEl.addEventListener('input', ()=>{
    if(mine(enEl, autoEn)){ enEl.value = cyrToLat(ruEl.value); autoEn = enEl.value; }
  });
  enEl.addEventListener('input', ()=>{
    if(mine(ruEl, autoRu)){ ruEl.value = toCyr(enEl.value); autoRu = ruEl.value; }
  });
  ruEl.addEventListener('blur', ()=>{
    if(ruEl.value.trim() && !enEl.value.trim()){ enEl.value = cyrToLat(ruEl.value); autoEn = enEl.value; }
  });
  enEl.addEventListener('blur', ()=>{
    if(enEl.value.trim() && !ruEl.value.trim()){ ruEl.value = toCyr(enEl.value); autoRu = ruEl.value; }
  });
}

/* ============================= DATA ============================= */
function loadRaw(){
  if(window.PEOPLE_DATA) return Promise.resolve(JSON.parse(JSON.stringify(window.PEOPLE_DATA)));
  return fetch('data/people.json').then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
}
const normalise = raw => raw.people.map(p=>({
  id:p.id, fatherId:p.father||null, nameRu:p.nameRu||'', nameEn:p.nameEn||'',
  family:p.surnameRu||'', familyEn:p.surnameEn||'', teip:p.teip||'', tukkhum:p.tukkhum||'',
  birth:p.birth||'', death:p.death||'', notes:p.notes||'',
  linkConfidence:p.linkConfidence||'chart', nameConfidence:p.nameConfidence||'high',
  source:p.source||'', status:'confirmed'
}));
const denormalise = () => ({
  meta:Object.assign({}, baseData.meta, {version:(baseData.meta.version||1)+1, exported:nowISO()}),
  people:state.people.map(p=>({
    id:p.id, father:p.fatherId, nameRu:p.nameRu, nameEn:p.nameEn,
    surnameRu:p.family, surnameEn:p.familyEn, teip:p.teip, tukkhum:p.tukkhum,
    birth:p.birth, death:p.death, notes:p.notes,
    nameConfidence:p.nameConfidence, linkConfidence:p.linkConfidence, source:p.source
  }))
});
function buildTags(){
  const add=(map,name)=>{
    if(!name||map[name]) return;
    const used=new Set(Object.values(map).map(v=>v.color));
    map[name]={color:PALETTE.find(c=>!used.has(c))||PALETTE[Object.keys(map).length%PALETTE.length]};
  };
  state.people.forEach(p=>{ add(state.tags.families,p.family); add(state.tags.teips,p.teip); add(state.tags.tukkhums,p.tukkhum); });
}
function applyEdits(){
  const list = normalise(baseData);
  const byId = new Map(list.map(p=>[p.id,p]));
  const extra = [];
  for(const [id,patch] of Object.entries(state.edits||{})){
    if(byId.has(id)) Object.assign(byId.get(id), patch);
    else if(!patch._deleted) extra.push(Object.assign({id, status:'confirmed'}, patch));
  }
  state.people = list.concat(extra).filter(p=>!p._deleted);
}
const getPerson = id => state.people.find(p=>p.id===id);
const childrenOf = id => state.people.filter(p=>p.fatherId===id);
function computeAge(p){
  const b=parseInt(p.birth,10), d=parseInt(p.death,10);
  if(!b) return null;
  return d ? d-b : new Date().getFullYear()-b;
}
function ancestorChain(id){
  const out=[]; let p=getPerson(id), g=0;
  while(p && p.fatherId && g++<80){ p=getPerson(p.fatherId); if(p) out.unshift(p); }
  return out;
}
function descendantIds(id){
  const out=[]; const stack=childrenOf(id).slice();
  while(stack.length){ const p=stack.pop(); out.push(p.id); stack.push(...childrenOf(p.id)); }
  return out;
}
function lineageSet(id){
  const s=new Set([id]);
  ancestorChain(id).forEach(a=>s.add(a.id));
  descendantIds(id).forEach(x=>s.add(x));
  return s;
}
const generationOf = id => ancestorChain(id).length + 1;
const canAdmin = () => currentUser.role==='admin';
const canEdit  = () => currentUser.role==='moderator' || currentUser.role==='admin';
const canSuggest = () => true;

/* ============================= HISTORY ============================= */
const snapshot = () => JSON.stringify({edits:state.edits, positions:state.positions, pending:state.pending});
function pushHistory(){
  undoStack.push(snapshot());
  if(undoStack.length > 60) undoStack.shift();
  redoStack = [];
  refreshHistoryButtons();
}
function restoreSnapshot(json){
  const s = JSON.parse(json);
  state.edits = s.edits; state.positions = s.positions; state.pending = s.pending || [];
  saveState(); rebuild();
}
function undo(){
  if(!undoStack.length){ toast(t('nothingUndo')); return; }
  redoStack.push(snapshot());
  restoreSnapshot(undoStack.pop());
  toast(t('undone')); refreshHistoryButtons();
}
function redo(){
  if(!redoStack.length){ toast(t('nothingRedo')); return; }
  undoStack.push(snapshot());
  restoreSnapshot(redoStack.pop());
  toast(t('redone')); refreshHistoryButtons();
}
function refreshHistoryButtons(){
  $('undoBtn').disabled = !undoStack.length;
  $('redoBtn').disabled = !redoStack.length;
}
function saveVersion(label){
  state.versions.unshift({
    time:nowISO(), who:currentUser.name||'anonymous', label,
    edits:JSON.parse(JSON.stringify(state.edits)),
    positions:JSON.parse(JSON.stringify(state.positions))
  });
  state.versions = state.versions.slice(0,30);
}
function log(action, detail){
  state.audit.unshift({time:nowISO(), who:currentUser.name||'anonymous', action, detail});
  state.audit = state.audit.slice(0,200);
}
/* Every mutating action funnels through here: one undo step, one version,
   one audit line, one save. */
function mutate(label, fn){
  pushHistory();
  fn();
  log(label.action, label.detail);
  saveVersion(`${label.action} ${label.detail||''}`.trim());
  saveState();
  rebuild();
}

function askConfirm(title, body){
  return new Promise(res=>{
    const wrap=document.createElement('div');
    wrap.className='overlay show';
    wrap.innerHTML=`<div class="confirm-card"><h4>${esc(title)}</h4><p>${esc(body||'')}</p>
      <div class="row"><button class="btn" data-no>${t('no')}</button>
      <button class="btn danger" data-yes>${t('yes')}</button></div></div>`;
    document.body.appendChild(wrap);
    const done=v=>{ wrap.remove(); res(v); };
    wrap.querySelector('[data-yes]').onclick=()=>done(true);
    wrap.querySelector('[data-no]').onclick=()=>done(false);
    wrap.addEventListener('click',e=>{ if(e.target===wrap) done(false); });
  });
}
let toastTimer;
function toast(msg){
  const el=$('toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
}

/* ============================= LAYOUT ============================= */
/* A tighter Reingold–Tilford variant: leaves are packed to a grid,
   parents sit centred over their children (mid of first and last), and
   whole subtrees are shifted only where they would collide. Manual
   positions no longer leak into descendants — a dragged person stays
   put, everyone below them keeps their computed symmetry. */
function computeLayout(){
  const roots = state.people.filter(p=>!p.fatherId || !getPerson(p.fatherId));
  const kids = new Map();
  state.people.forEach(p=>{ if(!kids.has(p.fatherId)) kids.set(p.fatherId,[]); kids.get(p.fatherId).push(p); });
  const auto = {};
  const subtreeCentres = new Map();       // id -> {x, depth}

  /* Post-order: place leaves left to right, then centre each parent. */
  let nextLeaf = 0;
  function place(p, depth){
    const cs = collapsed.has(p.id) ? [] : (kids.get(p.id)||[]);
    if(!cs.length){
      const x = nextLeaf * SPACING_X + 80;
      nextLeaf++;
      auto[p.id] = {x, y:rowY(depth), depth};
      subtreeCentres.set(p.id, {x, l:x, r:x});
      return {x, l:x, r:x};
    }
    let l=Infinity, r=-Infinity;
    cs.forEach(c=>{ const b=place(c, depth+1); l=Math.min(l,b.l); r=Math.max(r,b.r); });
    /* Centre over the first and last child, which is the true middle for
       both even and uneven counts. */
    const first = subtreeCentres.get(cs[0].id).x;
    const last  = subtreeCentres.get(cs[cs.length-1].id).x;
    const x = (first + last) / 2;
    auto[p.id] = {x, y:rowY(depth), depth};
    subtreeCentres.set(p.id, {x, l, r});
    return {x, l, r};
  }
  roots.forEach(r=>place(r,0));
  /* Any orphaned records still get somewhere reasonable. */
  state.people.forEach(p=>{
    if(auto[p.id]) return;
    auto[p.id] = {x: nextLeaf*SPACING_X+80, y:rowY(0), depth:0}; nextLeaf++;
  });

  /* Manual positions override the computed ones, but never propagate
     down — a dragged parent stays wherever you put him; his children
     stay in their symmetrical places. */
  const out = {};
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  state.people.forEach(p=>{
    const a = auto[p.id];
    const c = state.positions[p.id];
    const o = c ? {x:c.x, y:c.y, depth:a.depth} : {x:a.x, y:a.y, depth:a.depth};
    /* Optional grid snap for the admin. Applied only to manual
       positions so the auto layout keeps its true centres. */
    if(c && state.ui.gridSnap){
      o.x = Math.round(o.x / GRID_X) * GRID_X + 80 % GRID_X;
      o.y = Math.round(o.y / GRID_Y) * GRID_Y;
    }
    out[p.id] = o;
    minX=Math.min(minX,o.x); maxX=Math.max(maxX,o.x);
    minY=Math.min(minY,o.y); maxY=Math.max(maxY,o.y);
  });
  contentBox = {minX:minX-90, maxX:maxX+90, minY:minY-70, maxY:maxY+90};
  genThresholds = computeGenThresholds(out);
  return out;
}

/* ============================= VIEW ============================= */
/* Panning is bounded: the tree may be pushed to an edge but never off
   screen entirely. */
/* The point at the centre of the screen may never leave the tree's
   bounding box, so you can reach any edge but not drift into nothing. */
function clampView(){
  if(!contentBox) return;
  const r = $('tree-svg').getBoundingClientRect();
  const k = viewT.k;
  viewT.x = Math.max(r.width/2  - contentBox.maxX*k, Math.min(r.width/2  - contentBox.minX*k, viewT.x));
  viewT.y = Math.max(r.height/2 - contentBox.maxY*k, Math.min(r.height/2 - contentBox.minY*k, viewT.y));
}
/* A bounding box has empty corners. If a pan ends with nobody on screen,
   ease back to whoever is nearest rather than leaving a blank field. */
function ensureSomeoneVisible(){
  if(!layoutCache) return;
  const r = $('tree-svg').getBoundingClientRect(), k = viewT.k;
  const x0=-viewT.x/k, y0=-viewT.y/k;
  const x1=(r.width-viewT.x)/k, y1=(r.height-viewT.y)/k;
  const cx=(x0+x1)/2, cy=(y0+y1)/2;
  let nearest=null, best=Infinity;
  for(const p of state.people){
    const pos=layoutCache[p.id]; if(!pos) continue;
    if(pos.x>=x0 && pos.x<=x1 && pos.y>=y0 && pos.y<=y1) return;   // someone is on screen
    const d=(pos.x-cx)*(pos.x-cx)+(pos.y-cy)*(pos.y-cy);
    if(d<best){ best=d; nearest=pos; }
  }
  if(nearest) animateTo({k, x:r.width/2-nearest.x*k, y:r.height/2-nearest.y*k}, 260);
}
/* Labels grow as you zoom out and settle to a floor as you zoom in, so
   names stay legible across the whole range. */
function labelSizes(k){
  const span = Math.min(1, Math.max(0, (0.9 - k) / 0.74));   // 1 far out, 0 close in
  let ru = 11 + 5.5*span;                                    // 11px close in, 16.5px far out
  /* Never write labels bigger than the row will hold. Half the row gap
     for the largest run (which is SPACING_Y*2 = 300 world units) is our
     ceiling; the same rule protects the regular 150-unit rows too. */
  const rowGapScreen = SPACING_Y * k;
  ru = Math.min(ru, Math.max(6, rowGapScreen * 0.55));
  return {ru, en:ru*0.84, meta:ru*0.75};
}
/* ── Text measurement ────────────────────────────────────────────────
   Cyrillic capitals are appreciably wider than mixed-case Latin, so a
   single characters-times-constant estimate collides. We measure each
   string once at 100px and scale it, which costs nothing and treats both
   scripts alike. */
const _measureCanvas = document.createElement('canvas').getContext('2d');
const _measureCache = new Map();
function textUnitWidth(text, weight){
  const key = weight + '|' + text;
  let w = _measureCache.get(key);
  if(w == null){
    _measureCanvas.font = `${weight} 100px Inter, system-ui, sans-serif`;
    w = _measureCanvas.measureText(text).width / 100;
    _measureCache.set(key, w);
  }
  return w;
}

/* How many lines of text fit between two generations at this zoom. */
let labelLines = {ru:true, en:true, meta:true};
function planLines(k){
  const s = labelSizes(k);
  const gap = SPACING_Y * k;                       // vertical room, screen px
  const h = (ru,en,meta)=> 6 + (ru?s.ru+3:0) + (en?s.en+3:0) + (meta?s.meta+3:0);
  const wantRu = langDisplay!=='en', wantEn = langDisplay!=='ru';
  let en = wantEn, meta = true;
  if(h(wantRu,en,meta) > gap*0.78) meta = false;
  if(h(wantRu,en,meta) > gap*0.78) en = wantEn && !wantRu;
  return {ru:wantRu, en, meta};
}

/* The zoom at which each generation's names stop colliding. Derived
   from the actual spacing and measured widths of that row, so a sparse
   early generation appears almost immediately and a crowded late one
   waits until there is room. */
let genThresholds = [];
function computeGenThresholds(positions){
  const s = {ru:11, en:11*0.84, meta:11*0.75};      // the floor size
  const rows = new Map();
  for(const p of state.people){
    const pos = positions[p.id]; if(!pos) continue;
    if(!rows.has(pos.depth)) rows.set(pos.depth, []);
    rows.get(pos.depth).push({p, x:pos.x});
  }
  const out = [];
  rows.forEach((list, depth)=>{
    list.sort((a,b)=>a.x-b.x);
    const need = [];
    for(let i=1;i<list.length;i++){
      const gap = list[i].x - list[i-1].x;
      if(gap <= 0) continue;
      const w = (labelWidthAt(list[i-1].p, s) + labelWidthAt(list[i].p, s))/2 + 10;
      need.push(w / gap);                            // k at which they clear
    }
    need.sort((a,b)=>a-b);
    /* the 92nd percentile, so a couple of tight spots are left to the
       per-row planner instead of holding back the whole generation */
    const k = need.length ? need[Math.min(need.length-1, Math.floor(need.length*0.80))] : 0;
    out[depth] = k;
  });
  return out;
}
function labelWidthAt(p, s){
  let w = textUnitWidth(p.nameRu||'', 600) * s.ru;
  w = Math.max(w, textUnitWidth(p.nameEn||'', 400) * s.en);
  return w;
}
/* A generation is drawn if it has cleared its own threshold. Names may
   still be culled inside a row, but the frame at least contains everyone
   the density calculation says will fit. */
function isDepthVisible(k, depth){
  const t = genThresholds[depth] || 0;
  return k >= t || depth === 0;
}
function visibleDepthFor(k){
  let d = 0;
  for(let i=0;i<genThresholds.length;i++) if(isDepthVisible(k,i)) d = Math.max(d,i);
  return d;
}

/* Which names can be drawn without colliding. Rows are handled
   independently, and within a row the people with the most descendants
   are placed first so the trunk keeps its labels when space is tight. */
function planLabels(positions){
  const k = viewT.k, s = labelSizes(k);
  labelLines = planLines(k);
  const plan = new Set();
  const rows = new Map();
  for(const p of state.people){
    const pos = positions[p.id]; if(!pos) continue;
    if(ancestorChain(p.id).some(a=>collapsed.has(a.id))) continue;
    if(!rows.has(pos.depth)) rows.set(pos.depth, []);
    rows.get(pos.depth).push({p, x:pos.x});
  }
  /* First cull inside each row — two names on the same generation may
     not share a slot horizontally. */
  const rowBoxes = new Map();
  rows.forEach((list, depth)=>{
    list.forEach(it=>{ it.w = labelWidth(it.p, s); it.rank = descendantIds(it.p.id).length; });
    list.sort((a,b)=> b.rank-a.rank || a.x-b.x);
    const taken = [];
    for(const it of list){
      const cx = it.x*k, half = it.w/2 + 5;
      const l = cx-half, r = cx+half;
      if(taken.some(t=> l < t[1] && r > t[0])) continue;
      taken.push([l,r]);
      plan.add(it.p.id);
    }
    rowBoxes.set(depth, taken);
  });
  /* Then cull vertically: two labels may overlap in Y only if their
     bounding boxes clear on X. Rows are physically 150–300 px apart, so
     usually irrelevant — the trigger is a mid-row extra line pushing
     into the next generation. */
  const rowYs = new Map();
  rows.forEach((list, depth)=>{ if(list[0]) rowYs.set(depth, positions[list[0].p.id].y); });
  /* Row-gap already shrinks the label size for us. Only drop a bottom
     label whose box would actually overlap a top label's box, not just
     share a column — a stack of chain names sits fine. */
  const linesShown = 1 + (labelLines.en?1:0) + (labelLines.meta?1:0);
  const labelBox = (labelLines.ru?s.ru:0) + (labelLines.en?s.en:0) + (labelLines.meta?s.meta:0) + linesShown*3 + 4;
  const depths = [...rowYs.keys()].sort((a,b)=>a-b);
  for(let i=1;i<depths.length;i++){
    const dTop = depths[i-1], dBot = depths[i];
    const yGap = (rowYs.get(dBot) - rowYs.get(dTop)) * k;
    if(yGap >= labelBox) continue;                 // rows already clear
    /* Prefer the row that already has fewer labels through. */
    const topShown = (rowBoxes.get(dTop)||[]).length;
    const botShown = (rowBoxes.get(dBot)||[]).length;
    const drop = topShown <= botShown ? dBot : dTop;
    const keep = drop === dTop ? dBot : dTop;
    const keepBoxes = rowBoxes.get(keep) || [];
    const dropList = rows.get(drop) || [];
    for(const it of dropList){
      if(!plan.has(it.p.id)) continue;
      const cx = it.x*k, half = it.w/2 + 5;
      const l = cx-half, r = cx+half;
      if(keepBoxes.some(t=> l < t[1] && r > t[0])) plan.delete(it.p.id);
    }
  }
  return plan;
}
function labelWidth(p, s){
  let w = 0;
  if(labelLines.ru) w = Math.max(w, textUnitWidth(p.nameRu||'', 600) * s.ru);
  if(labelLines.en) w = Math.max(w, textUnitWidth(p.nameEn||'', 400) * s.en);
  if(labelLines.meta && (p.birth||p.death))
    w = Math.max(w, textUnitWidth(`${yearOf(p.birth)||'?'}–${yearOf(p.death)||'?'}`, 400) * s.meta);
  return w;      // already screen px: unit width x on-screen font size
}
function scheduleLabelRefresh(){
  clearTimeout(labelRefreshTimer);
  labelRefreshTimer = setTimeout(()=>{
    const before = labelPlan;
    const next = planLabels(layoutCache||computeLayout());
    if(next.size !== before.size || [...next].some(id=>!before.has(id))) renderTree();
  }, 110);
}
function applyTransform(){
  clampView();
  $('viewport').setAttribute('transform', `translate(${viewT.x},${viewT.y}) scale(${viewT.k})`);
  const s = labelSizes(viewT.k);
  const svg = $('tree-svg');
  svg.style.setProperty('--lbl-ru', (s.ru/viewT.k)+'px');
  svg.style.setProperty('--lbl-en', (s.en/viewT.k)+'px');
  svg.style.setProperty('--lbl-meta', (s.meta/viewT.k)+'px');
}
function animateTo(target, ms=320){
  const start={...viewT}, t0=performance.now();
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){ viewT={...target}; applyTransform(); scheduleLabelRefresh(); return; }
  (function step(now){
    const q=Math.min(1,(now-t0)/ms), e=1-Math.pow(1-q,3);
    viewT={x:start.x+(target.x-start.x)*e, y:start.y+(target.y-start.y)*e, k:start.k+(target.k-start.k)*e};
    applyTransform();
    if(q<1) requestAnimationFrame(step); else scheduleLabelRefresh();
  })(performance.now());
}
/* Zoom about a fixed screen point — the viewport centre for the buttons. */
function zoomAbout(factor, cx, cy){
  const r=$('tree-svg').getBoundingClientRect();
  if(cx==null){ cx=r.width/2; cy=r.height/2; }
  const k2=Math.min(MAX_K, Math.max(MIN_K, viewT.k*factor));
  animateTo({k:k2, x:cx-(cx-viewT.x)*(k2/viewT.k), y:cy-(cy-viewT.y)*(k2/viewT.k)}, 180);
  scheduleLabelRefresh();
}
/* The extent of everything down to a given generation. */
function extentForDepth(depth){
  const pos = layoutCache || computeLayout();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity, any=false;
  for(const p of state.people){
    const o=pos[p.id]; if(!o || o.depth>depth) continue;
    any=true;
    minX=Math.min(minX,o.x); maxX=Math.max(maxX,o.x);
    minY=Math.min(minY,o.y); maxY=Math.max(maxY,o.y);
  }
  if(!any) return contentBox;
  return {minX:minX-90, maxX:maxX+90, minY:minY-70, maxY:maxY+90};
}
/* Fitting and generation visibility feed each other — zoom in and more
   generations appear, which widens the tree. Settle on the value where
   the two agree, taking the lower of the last pair so the content always
   fits rather than oscillating. */
function fitAll(){
  if(!layoutCache) computeLayout();
  const r=$('tree-svg').getBoundingClientRect();
  const kFor = cb => {
    const w=cb.maxX-cb.minX, h=cb.maxY-cb.minY;
    if(!w||!h) return 1;
    return Math.min((r.width-80)/w, (r.height-80)/h, 1.5);
  };
  let k = kFor(contentBox), prev = k;
  for(let i=0;i<5;i++){
    const next = kFor(extentForDepth(visibleDepthFor(k)));
    if(Math.abs(next-k) < 0.002){ prev=k; k=next; break; }
    prev = k; k = next;
  }
  k = Math.max(MIN_K, Math.min(k, prev));
  const cb = extentForDepth(visibleDepthFor(k));
  const w=cb.maxX-cb.minX, h=cb.maxY-cb.minY;
  animateTo({k, x:(r.width-w*k)/2-cb.minX*k, y:(r.height-h*k)/2-cb.minY*k});
}
/* Centring keeps the current zoom — it only translates. */
function centreOn(id){
  const pos=(layoutCache||computeLayout())[id]; if(!pos) return;
  const r=$('tree-svg').getBoundingClientRect();
  animateTo({k:viewT.k, x:r.width/2-pos.x*viewT.k, y:r.height/2-pos.y*viewT.k});
}
function revealAndCentre(id){
  ancestorChain(id).forEach(a=>collapsed.delete(a.id));
  renderTree();
  highlightSet = lineageSet(id);
  renderTree(); addClearHighlightButton();
  centreOn(id);
}

/* ============================= RENDER ============================= */
function renderAll(){
  renderIdentity(); renderSelects(); renderLegends();
  renderPending(); renderSources(); renderVersions(); renderAdmin(); renderAudit(); renderTree();
  $('brandSub').textContent = `${t('patrilineal')} · ${state.people.length} ${t('people')}`;
  refreshHistoryButtons();
}
function rebuild(){ applyEdits(); buildTags(); renderAll(); }

/* Roles that can no longer use a control simply do not see it. */
function renderIdentity(){
  const badge=$('roleBadge');
  badge.className='role-badge '+currentUser.role;
  badge.textContent = t('role'+currentUser.role[0].toUpperCase()+currentUser.role.slice(1)).split('—')[0].trim();
  const signedIn = currentUser.role !== 'viewer';
  $('loginPanel').hidden = signedIn;
  $('signedInPanel').hidden = !signedIn;
  $('loginBtn').hidden = signedIn;
  $('signOutBtn').hidden = !signedIn;
  $('signedName').textContent = currentUser.name || '—';
  $('signedRole').textContent = currentUser.role;
  $('editModeWrap').hidden = !canEdit();
  $('realignBtn').hidden = !editing();
  $('editModeToggle').checked = !!state.ui.editMode;
  $('addPersonPanel').style.display = (canAdmin() && state.ui.editMode) ? '' : 'none';
  $('adminPanel').style.display = canAdmin() ? '' : 'none';
  if(!editing()){ selectedIds.clear(); linkDrag=null; }
  $('versionsPanel').hidden = !canEdit();
  $('undoBtn').hidden = !canEdit();
  $('redoBtn').hidden = !canEdit();
  const dp = $('dataPanel'); if(dp) dp.hidden = !canSuggest();
  const ap = $('activityPanel'); if(ap) ap.hidden = !canEdit();
  $('userName').value = currentUser.name||'';
  $('userRole').value = currentUser.role;
}

function fillSelect(sel, map, current){
  sel.innerHTML = Object.keys(map).sort().map(n=>
    `<option value="${esc(n)}"${n===current?' selected':''}>${esc(n)}</option>`).join('')
    + `<option value="__new">${t('newTag')}</option>`;
}
let addFatherCombo = null;
function renderSelects(){
  const keep = addFatherCombo ? addFatherCombo.get() : null;
  addFatherCombo = buildCombo($('p_fatherCombo'), keep, ()=>{});
  refreshSourceList();
  fillSelect($('p_family'), state.tags.families, 'Гадамаури');
  fillSelect($('p_teip'), state.tags.teips, 'Саханхой');
  fillSelect($('p_tukkhum'), state.tags.tukkhums, 'Мелхий');
}

/* Legends are inclusive filters: pick one or more to show only those,
   pick nothing and everyone is visible. */
function legendHtml(map, counts, picked, ring, extra, deletable){
  const names=Object.keys(map).sort((a,b)=>(counts[b]||0)-(counts[a]||0));
  const any = picked.size>0;
  let html = names.map(n=>{
    const c=map[n].color;
    const sw = ring?`<span class="swatch ring" style="border-color:${c}"></span>`
                   :`<span class="swatch" style="background:${c}"></span>`;
    const cls = picked.has(n)?' picked':(any?' muted':'');
    return `<div class="legend-item${cls}" data-name="${esc(n)}">${sw}
      <span class="lname">${esc(n)}</span><span class="lcount">${counts[n]||0}</span>${
        (deletable && canEdit())?`<span class="lx" data-del="${esc(n)}" title="${esc(t('deleteFamily'))}">✕</span>`:''}</div>`;
  }).join('');
  if(extra) html += extra(any);
  return html || `<div class="empty-note">${t('nothingYet')}</div>`;
}
const countBy = key => { const c={}; state.people.forEach(p=>{ if(p[key]) c[p[key]]=(c[p[key]]||0)+1; }); return c; };

function renderLegends(){
  const F=state.ui.filters;
  const fc=countBy('family'), tc=countBy('teip'), uc=countBy('tukkhum');
  const noFam=state.people.filter(p=>!p.family).length;
  const pickedF=new Set(F.families), pickedT=new Set(F.teips), pickedU=new Set(F.tukkhums), pickedG=new Set(F.flags);

  $('famLegend').innerHTML = legendHtml(state.tags.families, fc, pickedF, false, any=>
    noFam ? `<div class="legend-item${pickedF.has('__none')?' picked':(any?' muted':'')}" data-name="__none">
      <span class="swatch" style="background:#7d7263"></span>
      <span class="lname">${t('noFamily')}</span><span class="lcount">${noFam}</span></div>` : '', true);
  $('teipLegend').innerHTML = legendHtml(state.tags.teips, tc, pickedT, true);
  $('tukLegend').innerHTML  = legendHtml(state.tags.tukkhums, uc, pickedU, true);

  const unver=state.people.filter(p=>p.linkConfidence==='unverified').length;
  const uncert=state.people.filter(p=>p.nameConfidence!=='high').length;
  const anyG=pickedG.size>0;
  $('flagList').innerHTML =
    `<div class="legend-item${pickedG.has('link')?' picked':(anyG?' muted':'')}" data-name="link">
       <span class="swatch dash"></span><span class="lname">${t('unverifiedLink')}</span><span class="lcount">${unver}</span></div>
     <div class="legend-item${pickedG.has('name')?' picked':(anyG?' muted':'')}" data-name="name">
       <span class="swatch" style="background:var(--danger)"></span><span class="lname">${t('spellingCheck')}</span><span class="lcount">${uncert}</span></div>`;

  $('famCount').textContent=Object.keys(state.tags.families).length;
  $('teipCount').textContent=Object.keys(state.tags.teips).length;
  $('tukCount').textContent=Object.keys(state.tags.tukkhums).length;
  $('flagCount').textContent=unver+uncert;

  bindLegend('famLegend','families'); bindLegend('teipLegend','teips');
  bindLegend('tukLegend','tukkhums'); bindLegend('flagList','flags');
}
function bindLegend(elId, key){
  $(elId).querySelectorAll('.lx').forEach(x=>{
    x.onclick = async e=>{
      e.stopPropagation();
      const name = x.dataset.del;
      if(!await askConfirm(`${t('deleteFamily')}: ${name}`, t('deleteFamilyBody'))) return;
      mutate({action:'deleted family', detail:name}, ()=>{
        state.people.filter(p=>p.family===name).forEach(p=>{
          state.edits[p.id]=Object.assign({}, state.edits[p.id], {family:'', familyEn:''});
        });
        delete state.tags.families[name];
        const arr=state.ui.filters.families, i=arr.indexOf(name);
        if(i>=0) arr.splice(i,1);
      });
    };
  });
  $(elId).querySelectorAll('.legend-item').forEach(el=>{
    el.onclick = ()=>{
      const arr = state.ui.filters[key];
      const n = el.dataset.name;
      const i = arr.indexOf(n);
      i>=0 ? arr.splice(i,1) : arr.push(n);
      saveState(); renderLegends(); renderTree();
    };
  });
}
function passesFilter(p){
  const F=state.ui.filters;
  if(F.families.length && !F.families.includes(p.family || '__none')) return false;
  if(F.teips.length && !F.teips.includes(p.teip)) return false;
  if(F.tukkhums.length && !F.tukkhums.includes(p.tukkhum)) return false;
  if(F.flags.length){
    const okLink = F.flags.includes('link') && p.linkConfidence==='unverified';
    const okName = F.flags.includes('name') && p.nameConfidence!=='high';
    if(!okLink && !okName) return false;
  }
  return true;
}
function nodeOpacity(p){
  const inFilter = passesFilter(p);
  if(highlightSet){
    if(highlightSet.has(p.id) && inFilter) return 1;
    if(highlightSet.has(p.id)) return 0.35;
    if(inFilter) return 0.6;
    return 0.08;
  }
  return inFilter ? 1 : 0.1;
}

function renderPending(){
  $('pendingCount').textContent=state.pending.length;
  $('pendingPanel').style.display = state.pending.length ? '' : 'none';
  if(!state.pending.length){ $('pendingList').innerHTML=''; return; }
  $('pendingList').innerHTML = state.pending.map((s,i)=>`
    <div class="pending-item">
      <div class="pt">${esc(s.personName)}</div>
      <div class="ps">${esc(s.fieldLabel||s.field)} → ${esc(s.value||s.description||'—')}<br>
        ${s.reason?esc(s.reason)+'<br>':''}${esc(s.by||'anonymous')} · ${fmtDateTime(s.time)}</div>
      ${canEdit()?`<div class="pactions">
        <button class="btn small primary" data-ap="${i}">${t('approve')}</button>
        <button class="btn small" data-rj="${i}">${t('reject')}</button>
        <button class="btn small" data-gh="${i}">${t('github')}</button></div>`:''}
    </div>`).join('');
  $('pendingList').querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>approveSuggestion(+b.dataset.ap));
  $('pendingList').querySelectorAll('[data-rj]').forEach(b=>b.onclick=()=>rejectSuggestion(+b.dataset.rj));
  $('pendingList').querySelectorAll('[data-gh]').forEach(b=>b.onclick=()=>openAsIssue(state.pending[+b.dataset.gh]));
}

function renderSources(){
  const counts={};
  state.people.forEach(p=>{ if(p.source) counts[p.source]=(counts[p.source]||0)+1; });
  const names=Object.keys(counts).sort();
  $('sourceCount').textContent=names.length;
  $('sourcesPanel').hidden = !canEdit();
  if(!names.length){ $('sourceList2').innerHTML=`<div class="empty-note">${t('nothingYet')}</div>`; return; }
  $('sourceList2').innerHTML=names.map(n=>`
    <div class="legend-item" title="${esc(n)}">
      <span class="lname">${esc(n)}</span><span class="lcount">${counts[n]}</span>
      <span class="lx" data-src="${esc(n)}" title="${esc(t('removeSource'))}">✕</span></div>`).join('');
  $('sourceList2').querySelectorAll('.lx').forEach(x=>{
    x.onclick=async ()=>{
      const name=x.dataset.src;
      if(!await askConfirm(`${t('removeSource')}: ${name}`, t('removeSourceBody'))) return;
      mutate({action:'removed source', detail:name}, ()=>{
        state.people.filter(p=>p.source===name).forEach(p=>{
          state.edits[p.id]=Object.assign({}, state.edits[p.id], {source:''});
        });
      });
    };
  });
}

function renderVersions(){
  $('versionCount').textContent = state.versions.length;
  if(!state.versions.length){ $('versionList').innerHTML=`<div class="empty-note">${t('noVersions')}</div>`; return; }
  $('versionList').innerHTML = state.versions.map((v,i)=>`
    <div class="version-item">
      <div class="vmeta"><div>${esc(v.label||'—')}</div>
        <div class="vtime">${fmtDateTime(v.time)} · ${esc(v.who)}</div></div>
      <button class="btn small" data-rs="${i}">${t('restore')}</button>
    </div>`).join('');
  $('versionList').querySelectorAll('[data-rs]').forEach(b=>b.onclick=async ()=>{
    const v = state.versions[+b.dataset.rs];
    if(!await askConfirm(t('confirmRestore'),'')) return;
    pushHistory();
    state.edits = JSON.parse(JSON.stringify(v.edits));
    state.positions = JSON.parse(JSON.stringify(v.positions));
    log('restored', fmtDateTime(v.time));
    saveState(); rebuild(); toast(t('restored'));
  });
}
function renderAdmin(){
  $('modPasscode').value=state.passcodes.moderator;
  $('adminPasscode').value=state.passcodes.admin;
}
function renderAudit(){
  $('auditLog').innerHTML = state.audit.length
    ? state.audit.map(a=>`${fmtDateTime(a.time)} · ${esc(a.who)} · ${esc(a.action)} ${esc(a.detail||'')}`).join('<br>')
    : `<span class="empty-note">${t('nothingYet')}</span>`;
}

const yearOf = v => v ? String(v).split('-')[0] : '';
const editing = () => canEdit() && state.ui.editMode;

/* Geometry of a person's name block, in world units. */
function blockBox(p, shown){
  const s = labelSizes(viewT.k), k = viewT.k;
  if(!shown) return {w:10/k, h:10/k, top:-5/k, bottom:5/k};
  let h = 3/k;
  if(labelLines.ru) h += (s.ru+3)/k;
  if(labelLines.en) h += (s.en+3)/k;
  if(labelLines.meta && (p.birth||p.death)) h += (s.meta+3)/k;
  const w = Math.max(labelWidth(p, s)/k, 24/k);
  return {w, h, top:-(s.ru*0.8)/k, bottom:h-(s.ru*0.8)/k};
}

function renderTree(){
  $('emptyState').style.display = state.people.length?'none':'block';
  const positions = layoutCache = computeLayout();
  labelPlan = planLabels(positions);
  const s = labelSizes(viewT.k), k = viewT.k;
  const genLimit = visibleDepthFor(k);
  const visible = p => positions[p.id]
                       && !ancestorChain(p.id).some(a=>collapsed.has(a.id));
  const withinDepth = p => isDepthVisible(k, positions[p.id].depth);
  let html='';

  /* Links run from beneath the parent's name to just above the child's,
     so nothing crosses the text. */
  state.people.forEach(p=>{
    if(!p.fatherId) return;
    const f=getPerson(p.fatherId);
    if(!f || collapsed.has(p.fatherId) || !visible(p)) return;
    const a=positions[f.id], b=positions[p.id];
    if(!a||!b) return;
    const fb = blockBox(f, labelPlan.has(f.id)), cb = blockBox(p, labelPlan.has(p.id));
    const ay = a.y + fb.bottom + 4/k, by = b.y + cb.top - 5/k;
    const midY=(ay+by)/2;
    const lit = highlightSet && highlightSet.has(p.id) && highlightSet.has(f.id);
    const op = Math.min(nodeOpacity(f), nodeOpacity(p)) < 1 ? 0.12 : 1;
    html += `<path class="link${p.linkConfidence==='unverified'?' unverified':''}${lit?' lit':''}" d="M${a.x},${ay} C${a.x},${midY} ${b.x},${midY} ${b.x},${by}" style="opacity:${op}"></path>`;
  });

  state.people.forEach(p=>{
    if(!positions[p.id] || !visible(p)) return;
    const {x,y}=positions[p.id];
    const shown = labelPlan.has(p.id) && withinDepth(p);
    const box = blockBox(p, shown);
    const isColl=collapsed.has(p.id), hidden=isColl?descendantIds(p.id).length:0;
    let inner='';

    /* Hit area: generous, invisible, and the thing that receives clicks. */
    inner += `<rect class="hit" x="${x-box.w/2-6/k}" y="${y+box.top-4/k}" width="${box.w+12/k}" height="${box.h+8/k}" rx="${4/k}"></rect>`;
    if(selectedIds.has(p.id))
      inner += `<rect class="pill" x="${x-box.w/2-6/k}" y="${y+box.top-4/k}" width="${box.w+12/k}" height="${box.h+8/k}" rx="${4/k}"></rect>`;

    if(shown){
      let ly = y;
      if(labelLines.ru){ inner+=`<text x="${x}" y="${ly}" class="node-label">${esc(p.nameRu)}</text>`; ly+=(s.en+3)/k; }
      if(labelLines.en){ inner+=`<text x="${x}" y="${ly}" class="node-label-ru">${esc(p.nameEn)}</text>`; ly+=(s.meta+3)/k; }
      if(labelLines.meta && (p.birth||p.death))
        inner+=`<text x="${x}" y="${ly}" class="node-meta">${esc(yearOf(p.birth)||'?')}–${esc(yearOf(p.death)||'?')}</text>`;
      if(p.nameConfidence!=='high')
        inner+=`<circle cx="${x+box.w/2+2/k}" cy="${y+box.top+3/k}" r="${3/k}" fill="var(--danger)"></circle>`;
      const belowHidden = (!isColl && positions[p.id].depth===genLimit) ? descendantIds(p.id).length : 0;
      const badge = hidden || belowHidden;
      if(badge)
        inner+=`<text x="${x+box.w/2+8/k}" y="${y}" class="node-badge-text">+${badge}</text>`;
    } else {
      /* Too tight for type: a small neutral tick keeps the person clickable. */
      inner += `<rect class="tick" x="${x-2/k}" y="${y-3/k}" width="${4/k}" height="${6/k}"></rect>`;
    }

    const cls = 'node-group' + (selectedIds.has(p.id)?' picked':'') + (shown?'':' tiny');
    html+=`<g class="${cls}" data-id="${p.id}" style="opacity:${nodeOpacity(p)}">${inner}</g>`;

    if(editing() && k > 0.3 && shown){
      const r2 = 9/k;
      html+=`<g class="handle" data-reparent="${p.id}">
        <circle cx="${x-box.w/2-16/k}" cy="${y-2/k}" r="${r2}"></circle>
        <text x="${x-box.w/2-16/k}" y="${y+1.5/k}" text-anchor="middle" font-size="${11/k}">↑</text></g>`;
      html+=`<g class="handle" data-addchild="${p.id}">
        <circle cx="${x+box.w/2+16/k}" cy="${y+box.h-4/k}" r="${r2}"></circle>
        <text x="${x+box.w/2+16/k}" y="${y+box.h-1/k}" text-anchor="middle" font-size="${12/k}">+</text></g>`;
    }
  });

  if(linkDrag){
    const a = positions[linkDrag.fromId];
    if(a) html += `<path class="link-preview" d="M${a.x},${a.y} L${linkDrag.x},${linkDrag.y}"></path>`;
  }

  $('viewport').innerHTML=html;
  applyTransform();
  attachNodeHandlers();
  renderFilterChips();
}

function attachNodeHandlers(){
  document.querySelectorAll('.handle').forEach(g=>{
    const rp = g.dataset.reparent, ac = g.dataset.addchild;
    g.addEventListener('pointerdown', e=>{
      e.stopPropagation();
      if(ac){ addChildTo(ac); return; }
      const pt = svgPoint(e);
      linkDrag = {fromId:rp, x:pt.x, y:pt.y};
      toast(t('reparentHint'));
    });
  });

  document.querySelectorAll('.node-group').forEach(g=>{
    const id=g.dataset.id;
    g.addEventListener('pointerdown', e=>{
      e.stopPropagation();
      if(linkDrag) return;
      if(e.shiftKey && editing()){
        selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id);
        renderTree(); return;
      }
      if(!editing()) return;
      if(!selectedIds.has(id)) selectedIds.clear();
      draggingId=id; dragMoved=false; dragStart=svgPoint(e);
      dragOrigin = new Map();
      dragBefore = new Map();
      const group = selectedIds.size ? [...selectedIds] : [id];
      group.forEach(gid=>{
        const pos=layoutCache[gid]; if(pos) dragOrigin.set(gid,{x:pos.x,y:pos.y});
        /* Snapshot the manual position we had before, so undo returns
           to what was there rather than starting from scratch. */
        dragBefore.set(gid, state.positions[gid] ? {...state.positions[gid]} : null);
      });
      try{ g.setPointerCapture(e.pointerId); }catch(_){}
    });
    g.addEventListener('pointerup', e=>{
      if(linkDrag){ finishLinkDrag(id); return; }
      if(draggingId===id && dragMoved){
        /* The positions already show the new places; roll them back to
           where the drag began so mutate() can capture a real "before". */
        const after = new Map();
        dragOrigin.forEach((_,gid)=>{ after.set(gid, state.positions[gid] ? {...state.positions[gid]} : null); });
        dragBefore.forEach((prev,gid)=>{ if(prev) state.positions[gid]=prev; else delete state.positions[gid]; });
        mutate({action:'moved', detail:getPerson(id).nameRu}, ()=>{
          after.forEach((v,gid)=>{ if(v) state.positions[gid]=v; else delete state.positions[gid]; });
        });
      } else if(!dragMoved){
        const now=Date.now();
        if(now-(g._tap||0)<320){ g._tap=0; toggleCollapse(id); }
        else { g._tap=now; openInfo(id); }
      }
      draggingId=null; dragMoved=false;
    });
    g.addEventListener('mouseenter', e=>{
      if(linkDrag) g.classList.add('drop-target');
      if(tooltipEnabled && !linkDrag) showTooltip(id,e);
    });
    g.addEventListener('mousemove', e=>{ if(tooltipEnabled && !linkDrag) positionTooltip(e); });
    g.addEventListener('mouseleave', ()=>{ g.classList.remove('drop-target'); hideTooltip(); });
  });
}

function addChildTo(fatherId){
  const pos = layoutCache[fatherId];
  const id = uid();
  const fa = getPerson(fatherId);
  mutate({action:'added', detail:'—'}, ()=>{
    state.edits[id] = {
      nameRu:'', nameEn:'', family:fa.family||'', familyEn:fa.familyEn||'',
      teip:fa.teip||'', tukkhum:fa.tukkhum||'', fatherId,
      birth:'', death:'', notes:'',
      linkConfidence:'added', nameConfidence:'high', status:'confirmed',
      source:'Added after transcription'
    };
    /* Pin it directly under its father so it appears where you clicked. */
    if(pos) state.positions[id] = {x:pos.x, y:pos.y + SPACING_Y};
  });
  openEditForm(id, true);   // fresh: cancelling removes the placeholder
}

function detachPerson(id){
  const p=getPerson(id); if(!p || !p.fatherId) return;
  const pos = layoutCache[id];
  mutate({action:'detached', detail:p.nameRu}, ()=>{
    state.edits[id]=Object.assign({}, state.edits[id], {fatherId:null});
    if(pos) state.positions[id]={x:pos.x, y:pos.y};   // stay put
  });
  toast(t('detached'));
}
function finishLinkDrag(targetId){
  const fromId = linkDrag.fromId;
  linkDrag = null;
  if(!targetId || targetId===fromId){ renderTree(); return; }
  if(descendantIds(fromId).includes(targetId)){   // no loops
    toast(t('loops')); renderTree(); return;
  }
  const p = getPerson(fromId);
  mutate({action:'reparented', detail:p.nameRu}, ()=>{
    state.edits[fromId] = Object.assign({}, state.edits[fromId], {fatherId:targetId});
    delete state.positions[fromId];
  });
  toast(t('reparented'));
}

function svgPoint(e){
  const r=$('tree-svg').getBoundingClientRect();
  return {x:(e.clientX-r.left-viewT.x)/viewT.k, y:(e.clientY-r.top-viewT.y)/viewT.k};
}
function toggleCollapse(id){
  if(!childrenOf(id).length) return;
  collapsed.has(id)?collapsed.delete(id):collapsed.add(id);
  renderTree();
}

/* ============================= FIELD VISIBILITY ============================= */
function renderFieldRows(){
  const rows = FIELD_KEYS.map(k=>{
    const label = t(k==='flags' ? 'verification' : (k==='lived' ? 'lived' : k));
    return `<tr><td>${esc(label)}</td>
      <td><input type="checkbox" data-fk="${k}" data-where="hover"${state.ui.hoverFields.includes(k)?' checked':''}></td>
      <td><input type="checkbox" data-fk="${k}" data-where="select"${state.ui.selectFields.includes(k)?' checked':''}></td></tr>`;
  }).join('');
  $('fieldRows').innerHTML = rows;
  $('fieldRows').querySelectorAll('input').forEach(cb=>{
    cb.onchange = ()=>{
      const arr = cb.dataset.where==='hover' ? state.ui.hoverFields : state.ui.selectFields;
      const i = arr.indexOf(cb.dataset.fk);
      cb.checked ? (i<0 && arr.push(cb.dataset.fk)) : (i>=0 && arr.splice(i,1));
      saveState();
    };
  });
}
function fieldRows(p, which){
  const keys = which==='hover' ? state.ui.hoverFields : state.ui.selectFields;
  const age = computeAge(p), kids = childrenOf(p.id).length, desc = descendantIds(p.id).length;
  const famColor=(state.tags.families[p.family]||{}).color||'#7d7263';
  const teipColor=(state.tags.teips[p.teip]||{}).color||'#4a4034';
  const tukColor=(state.tags.tukkhums[p.tukkhum]||{}).color||'#4a4034';
  const out=[];
  const add=(k,label,value)=>{ if(keys.includes(k) && value) out.push([label,value]); };
  add('family', t('family'), p.family ? `<span class="tt-tag"><span class="swatch" style="background:${famColor};width:10px;height:10px;border-width:1px"></span>${esc(p.family)}</span>` : '');
  add('teip', t('teip'), `<span class="tt-tag"><span class="swatch ring" style="border-color:${teipColor};width:10px;height:10px;border-width:2px"></span>${esc(p.teip||'—')}</span>`);
  add('tukkhum', t('tukkhum'), `<span class="tt-tag"><span class="swatch ring" style="border-color:${tukColor};width:10px;height:10px;border-width:2px"></span>${esc(p.tukkhum||'—')}</span>`);
  add('lived', t('lived'), (p.birth||p.death)
      ? (which==='select' ? `${esc(fmtDate(p.birth)||'?')} – ${esc(fmtDate(p.death)||'?')}`
                          : `${esc(yearOf(p.birth)||'?')}–${esc(yearOf(p.death)||'?')}`) : '');
  add('age', p.death?t('ageAtDeath'):t('age'), age!=null?String(age):'');
  add('generation', t('generation'), String(generationOf(p.id)));
  add('sons', t('sons'), kids ? kids + (desc>kids?` (${desc} ${t('below')})`:'') : '');
  add('notes', t('notes'), p.notes?esc(p.notes):'');
  add('source', t('source'), p.source?esc(p.source):'');
  return out;
}

/* ============================= TOOLTIP ============================= */
function showTooltip(id, e){
  const p=getPerson(id); if(!p) return;
  const rows=fieldRows(p,'hover');
  let html=`<div class="tt-name">${esc(p.nameRu)}</div><div class="tt-name-ru">${esc(p.nameEn)}</div>`;
  html += rows.map(([k,v])=>`<div class="tt-row"><span class="tk">${k}</span><span>${v}</span></div>`).join('');
  if(state.ui.hoverFields.includes('flags')){
    if(p.linkConfidence==='unverified') html+=`<div class="tt-flag">${t('unverifiedLink')}</div>`;
    if(p.nameConfidence!=='high') html+=`<div class="tt-flag">${t('spellingCheck')}</div>`;
  }
  const tt=$('tooltip'); tt.innerHTML=html; tt.style.display='block';
  positionTooltip(e);
}
function positionTooltip(e){
  const tt=$('tooltip');
  const r=document.querySelector('.canvas-wrap').getBoundingClientRect();
  const b=tt.getBoundingClientRect();
  let x=e.clientX-r.left+16, y=e.clientY-r.top+16;
  if(x+b.width>r.width-8) x=e.clientX-r.left-b.width-16;
  if(y+b.height>r.height-8) y=e.clientY-r.top-b.height-16;
  tt.style.left=x+'px'; tt.style.top=y+'px';
}
const hideTooltip = () => { $('tooltip').style.display='none'; };

/* ============================= MODAL ============================= */
function openInfo(id){
  const p=getPerson(id); if(!p) return;
  const father=p.fatherId?getPerson(p.fatherId):null;
  const chain=ancestorChain(id), kids=childrenOf(id);
  const rows=fieldRows(p,'select');
  const showLine=state.ui.selectFields.includes('line');
  const flags=[];
  if(state.ui.selectFields.includes('flags')){
    if(p.linkConfidence==='unverified') flags.push(t('unverifiedLink'));
    if(p.nameConfidence!=='high') flags.push(t('spellingCheck'));
  }
  $('infoModal').innerHTML = `
    <span class="close-x" id="closeInfo">✕</span>
    <h3>${esc(p.nameRu||'—')}</h3>
    <div class="modal-sub">${esc(p.nameEn||'')}</div>
    ${rows.map(([k,v])=>`<div class="detail-row"><div class="dk">${esc(k)}</div><div class="dv">${v}</div></div>`).join('')}
    <div class="detail-row"><div class="dk">${t('father')}</div><div class="dv">${
      father?`<a data-go="${father.id}">${esc(father.nameRu)}</a>`:t('rootAncestor')}</div></div>
    ${showLine?`<div class="detail-row"><div class="dk">${t('line')}</div><div class="dv"><div class="chain-line">${
      chain.map(a=>`<a data-go="${a.id}">${esc(a.nameRu)}</a>`).join('<i>›</i>')||'—'}</div></div></div>`:''}
    ${kids.length?`<div class="detail-row"><div class="dk">${t('sons')}</div><div class="dv"><div class="chain-line">${
      kids.map(c=>`<a data-go="${c.id}">${esc(c.nameRu)}</a>`).join('<i>·</i>')}</div></div></div>`:''}
    ${flags.map(f=>`<div class="flag-note"><span>◇</span><span>${esc(f)}</span></div>`).join('')}
    <div class="modal-actions">
      <button class="btn" id="highlightLineBtn">${t('highlightLine')}</button>
      <button class="btn" id="centreBtn">${t('centreMap')}</button>
      ${canSuggest()?`<button class="btn" id="suggestEditBtn">${t('suggestChange')}</button>`:''}
      ${canAdmin()?`<button class="btn" id="editBtn">${t('edit')}</button>`:''}
      ${canAdmin()?`<button class="btn" id="addSonBtn">${t('addSon')}</button>`:''}
      ${canEdit()?`<button class="btn danger" id="deleteBtn">${t('del')}</button>`:''}
    </div>`;
  $('infoOverlay').classList.add('show');
  $('closeInfo').onclick=closeInfo;
  $('infoModal').querySelectorAll('[data-go]').forEach(a=>a.onclick=()=>{ closeInfo(); revealAndCentre(a.dataset.go); });
  $('highlightLineBtn').onclick=()=>{ highlightSet=lineageSet(id); closeInfo(); renderTree(); addClearHighlightButton(); toast(t('lineageLit')); };
  $('centreBtn').onclick=()=>{ closeInfo(); centreOn(id); };
  if($('suggestEditBtn')) $('suggestEditBtn').onclick=()=>openSuggestForm(id);
  if($('editBtn')) $('editBtn').onclick=()=>openEditForm(id);
  if($('addSonBtn')) $('addSonBtn').onclick=()=>{ closeInfo(); addChildTo(id); };
  if($('deleteBtn')) $('deleteBtn').onclick=()=>deletePerson(id);
}
const closeInfo = () => $('infoOverlay').classList.remove('show');

let clearBtnAdded=false;
function addClearHighlightButton(){
  if(clearBtnAdded) return; clearBtnAdded=true;
  const btn=document.createElement('button');
  btn.className='btn'; btn.id='clearHighlightBtn';
  btn.textContent='✕ '+t('clearHighlight');
  btn.title=t('clearHighlightTip');
  btn.onclick=()=>{ highlightSet=null; renderTree(); btn.remove(); clearBtnAdded=false; };
  document.querySelector('.canvas-wrap').appendChild(btn);
}

/* Deleting re-attaches the sons to their grandfather rather than
   refusing, so a mistaken middle generation can actually be removed. */
async function deletePerson(id){
  const p=getPerson(id); if(!p) return;
  const kids=childrenOf(id);
  const grand=p.fatherId?getPerson(p.fatherId):null;
  const tail = kids.length ? (grand ? `${t('reparent')} ${grand.nameRu}.` : t('becomeRoots')) : '';
  const ok = await askConfirm(`${t('confirmDelete')} ${p.nameRu}?`, tail);
  if(!ok) return;
  closeInfo();
  mutate({action:'deleted', detail:p.nameRu}, ()=>{
    kids.forEach(c=>{ state.edits[c.id]=Object.assign({}, state.edits[c.id], {fatherId:p.fatherId||null}); });
    state.edits[id]={_deleted:true};
    delete state.positions[id];
    selectedIds.delete(id);
  });
  toast(t('deleted'));
}

/* ============================= SUGGESTIONS ============================= */
function openSuggestForm(id){
  const p=getPerson(id);
  const fields=[['nameRu',t('nameRu')],['nameEn',t('nameEn')],['family',t('familyName')],
    ['birth',t('born')],['death',t('died')],['fatherId',t('father')],['notes',t('notes')],['other',t('somethingElse')]];
  $('infoModal').innerHTML=`
    <span class="close-x" id="closeInfo">✕</span>
    <h3>${t('suggestTitle')}</h3>
    <div class="modal-sub">${esc(p.nameRu)} · ${esc(p.nameEn)}</div>
    <div class="field"><label>${t('yourName')}</label><input type="text" id="s_by" value="${esc(currentUser.name)}"></div>
    <div class="field"><label>${t('whatCorrect')}</label><select id="s_field">${
      fields.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
    <div class="field" id="s_valueWrap"><label>${t('shouldSay')}</label><input type="text" id="s_value"></div>
    <div class="field" id="s_descWrap" hidden><label>${t('describe')}</label><textarea id="s_desc"></textarea></div>
    <div class="field"><label>${t('whereFrom')}</label><textarea id="s_reason"></textarea></div>
    <div class="modal-actions">
      <button class="btn primary" id="s_send">${t('sendSuggestion')}</button>
      <button class="btn" id="s_gh">${t('openIssue')}</button>
      <button class="btn" id="s_cancel">${t('cancel')}</button>
    </div>`;
  $('infoOverlay').classList.add('show');
  $('closeInfo').onclick=closeInfo;
  $('s_cancel').onclick=()=>openInfo(id);
  /* "Something else" swaps the single-line value for a description box. */
  $('s_field').onchange=e=>{
    const other = e.target.value==='other';
    $('s_valueWrap').hidden = other;
    $('s_descWrap').hidden = !other;
  };
  const gather=()=>{
    const f=$('s_field').value;
    const label=(fields.find(x=>x[0]===f)||[,f])[1];
    return {personId:id, personName:p.nameRu, field:f, fieldLabel:label,
      value:f==='other'?'':$('s_value').value.trim(),
      description:f==='other'?$('s_desc').value.trim():'',
      reason:$('s_reason').value.trim(), by:$('s_by').value.trim()||'anonymous', time:nowISO()};
  };
  $('s_send').onclick=()=>{
    const s=gather();
    if(s.field==='other' ? !s.description : !s.value){ toast(t('shouldSay')); return; }
    pushHistory();
    state.pending.unshift(s);
    currentUser.name=s.by; saveUser();
    log('suggested', p.nameRu+' · '+s.fieldLabel);
    saveState(); closeInfo(); renderPending(); renderIdentity(); renderAudit();
    toast(t('sendSuggestion')+' ✓');
  };
  $('s_gh').onclick=()=>openAsIssue(gather());
}
function openAsIssue(s){
  const g=CFG.github||{};
  if(!g.owner||g.owner.startsWith('YOUR-')){ toast(t('setRepo')); return; }
  const title=`[correction] ${s.personName} — ${s.fieldLabel||s.field}`;
  const body=[`**Person:** ${s.personName}`,`**ID:** \`${s.personId}\``,
    `**Field:** ${s.fieldLabel||s.field}`,`**Proposed:** ${s.value||s.description}`,
    `**Source:** ${s.reason}`,`**Suggested by:** ${s.by}`].join('\n\n');
  window.open(`https://github.com/${g.owner}/${g.repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,'_blank');
}
function approveSuggestion(i){
  const s=state.pending[i]; if(!s) return;
  mutate({action:'approved', detail:s.personName+' · '+(s.fieldLabel||s.field)}, ()=>{
    if(s.field!=='other') state.edits[s.personId]=Object.assign({}, state.edits[s.personId], {[s.field]:s.value});
    state.pending.splice(i,1);
  });
  toast(t('downloadFirst'));
}
function rejectSuggestion(i){
  const s=state.pending[i]; if(!s) return;
  pushHistory();
  state.pending.splice(i,1);
  log('rejected', s.personName);
  saveState(); renderPending(); renderAudit();
}

/* ============================= EDIT ============================= */
function openEditForm(id, fresh){
  const p=getPerson(id);
  $('infoModal').innerHTML=`
    <span class="close-x" id="closeInfo">✕</span>
    <h3>${t('edit')}</h3>
    <div class="modal-sub">${esc(p.nameRu)}</div>
    <div class="field-row">
      <div class="field"><label>${t('nameRu')}</label><input type="text" id="e_ru" value="${esc(p.nameRu)}"></div>
      <div class="field"><label>${t('nameEn')}</label><input type="text" id="e_en" value="${esc(p.nameEn)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${t('familyName')} (RU)</label><input type="text" id="e_fam" value="${esc(p.family)}"></div>
      <div class="field"><label>${t('familyName')} (EN)</label><input type="text" id="e_famen" value="${esc(p.familyEn)}"></div>
    </div>
    <div class="field"><label>${t('born')}</label><div class="datefield" id="e_birth"></div></div>
    <div class="field"><label>${t('died')}</label><div class="datefield" id="e_death"></div></div>
    <div class="field"><label>${t('father')}</label><div class="combo" id="e_fatherCombo" data-exclude="${id}"></div></div>
    <div class="field"><label>${t('linkConf')}</label><select id="e_link">
      <option value="chart"${p.linkConfidence==='chart'?' selected':''}>${t('confChart')}</option>
      <option value="unverified"${p.linkConfidence==='unverified'?' selected':''}>${t('confUnverified')}</option>
      <option value="added"${p.linkConfidence==='added'?' selected':''}>${t('confAdded')}</option></select></div>
    <div class="field"><label>${t('nameConf')}</label><select id="e_name">
      <option value="high"${p.nameConfidence==='high'?' selected':''}>${t('confHigh')}</option>
      <option value="medium"${p.nameConfidence==='medium'?' selected':''}>${t('confMedium')}</option>
      <option value="low"${p.nameConfidence==='low'?' selected':''}>${t('confLow')}</option></select></div>
    <div class="field"><label>${t('source')}</label>
      <input type="text" id="e_source" list="sourceList" placeholder="${esc(t('sourcePh'))}" value="${esc(p.source)}">
      <datalist id="sourceList">${knownSources().map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist>
      <div class="hint">${t('sourceHint')}</div></div>
    <div class="field"><label>${t('notes')}</label><textarea id="e_notes">${esc(p.notes)}</textarea></div>
    <div class="modal-actions">
      <button class="btn primary" id="e_save">${t('save')}</button>
      ${p.fatherId?`<button class="btn" id="e_detach">${t('detach')}</button>`:''}
      <button class="btn" id="e_cancel">${t('cancel')}</button>
    </div>`;
  $('infoOverlay').classList.add('show');
  $('closeInfo').onclick=closeInfo;
  $('e_cancel').onclick=()=>{
    if(fresh && !$('e_ru').value.trim() && !$('e_en').value.trim()){
      /* Nothing was entered — take the placeholder back out again. */
      delete state.edits[id]; delete state.positions[id];
      saveState(); rebuild(); closeInfo(); return;
    }
    openInfo(id);
  };
  buildDateField($('e_birth'), p.birth);
  buildDateField($('e_death'), p.death);
  const eFather = buildCombo($('e_fatherCombo'), p.fatherId, ()=>{});
  wireTranslit($('e_ru'), $('e_en'), p.nameRu, p.nameEn);
  wireTranslit($('e_fam'), $('e_famen'), p.family, p.familyEn, true);   // surnames: Иванов, not ИВАНОВ
  if($('e_detach')) $('e_detach').onclick=()=>{ closeInfo(); detachPerson(id); };
  $('e_save').onclick=()=>{
    const patch={
      nameRu:$('e_ru').value.trim(), nameEn:$('e_en').value.trim(),
      family:$('e_fam').value.trim(), familyEn:$('e_famen').value.trim(),
      birth:readDateField($('e_birth')), death:readDateField($('e_death')),
      fatherId:eFather.get()||null,
      linkConfidence:$('e_link').value, nameConfidence:$('e_name').value,
      notes:$('e_notes').value.trim(),
      source:$('e_source').value.trim()
    };
    mutate({action:'edited', detail:patch.nameRu}, ()=>{
      state.edits[id]=Object.assign({}, state.edits[id], patch);
    });
    closeInfo(); toast(t('savedLocally'));
  };
}
function prefillAddPerson(fatherId){
  $('sidebar').classList.remove('collapsed');
  addFatherCombo = buildCombo($('p_fatherCombo'), fatherId, ()=>{});
  $('p_nameRu').focus();
  $('addPersonHint').textContent=`${t('fatherSetTo')} ${getPerson(fatherId).nameRu}`;
  $('addPersonPanel').scrollIntoView({behavior:'smooth', block:'nearest'});
}
function pickTag(selId,rowId,nameId,colorId,map){
  const v=$(selId).value;
  if(v!=='__new') return v;
  const name=$(nameId).value.trim();
  if(!name) return '';
  map[name]={color:$(colorId).value};
  $(rowId).style.display='none'; $(nameId).value='';
  return name;
}
function addPerson(){
  const nameRu=$('p_nameRu').value.trim(), nameEn=$('p_nameEn').value.trim();
  if(!nameRu && !nameEn){ $('addPersonHint').textContent=t('nameNeeded'); return; }
  const id=uid();
  const rec={
    nameRu:nameRu||latToCyr(nameEn), nameEn:nameEn||cyrToLat(nameRu),
    family:pickTag('p_family','newFamRow','newFamName','newFamColor',state.tags.families), familyEn:'',
    teip:pickTag('p_teip','newTeipRow','newTeipName','newTeipColor',state.tags.teips),
    tukkhum:pickTag('p_tukkhum','newTukRow','newTukName','newTukColor',state.tags.tukkhums),
    fatherId:(addFatherCombo?addFatherCombo.get():null)||null,
    birth:readDateField($('p_birth')), death:readDateField($('p_death')),
    notes:$('p_notes').value.trim(),
    linkConfidence:'added', nameConfidence:'high', status:'confirmed',
    source:$('p_source').value.trim()||'Added after transcription'
  };
  mutate({action:'added', detail:rec.nameRu}, ()=>{ state.edits[id]=rec; });
  ['p_nameRu','p_nameEn','p_notes'].forEach(i=>$(i).value='');
  buildDateField($('p_birth'),''); buildDateField($('p_death'),'');
  $('addPersonHint').textContent=t('addedHint');
  toast(t('added'));
}

/* ============================= EXCEL ============================= */
const SHEET_COLS = ['id','fatherId','nameRu','nameEn','family','familyEn','teip','tukkhum',
                    'birth','death','notes','linkConfidence','nameConfidence','source'];
function loadSheetJS(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>res(window.XLSX); s.onerror=()=>rej(new Error('cdn'));
    document.head.appendChild(s);
    setTimeout(()=>{ if(!window.XLSX) rej(new Error('timeout')); }, 8000);
  });
}
const sheetRows = () => state.people.map(p=>{
  const o={}; SHEET_COLS.forEach(c=>o[c]=p[c]==null?'':p[c]); return o;
});
function exportSheet(){
  loadSheetJS().then(XLSX=>{
    const ws=XLSX.utils.json_to_sheet(sheetRows(), {header:SHEET_COLS});
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'people');
    XLSX.writeFile(wb, `sahanhoy-${new Date().toISOString().slice(0,10)}.xlsx`);
  }).catch(()=>{
    /* No network for the library — CSV opens in Excel just as well. */
    const head=SHEET_COLS.join(',');
    const body=sheetRows().map(r=>SHEET_COLS.map(c=>`"${String(r[c]).replace(/"/g,'""')}"`).join(',')).join('\n');
    downloadBlob(`sahanhoy-${new Date().toISOString().slice(0,10)}.csv`, '\ufeff'+head+'\n'+body, 'text/csv');
    toast(t('csvFallback'));
  });
}
function importSheet(file){
  const finish = rows=>{
    const byId=new Map(state.people.map(p=>[p.id,p]));
    mutate({action:'imported', detail:file.name}, ()=>{
      rows.forEach(r=>{
        if(!r.id) return;
        const patch={};
        SHEET_COLS.forEach(c=>{ if(c!=='id' && r[c]!=null) patch[c]=String(r[c]); });
        if(patch.fatherId==='') patch.fatherId=null;
        state.edits[r.id]=Object.assign({}, state.edits[r.id], patch);
      });
    });
    toast(t('excelHint'));
  };
  const rd=new FileReader();
  if(/\.csv$/i.test(file.name)){
    rd.onload=()=>{
      const lines=String(rd.result).replace(/^\ufeff/,'').split(/\r?\n/).filter(Boolean);
      const head=parseCsvLine(lines.shift());
      finish(lines.map(l=>{ const c=parseCsvLine(l); const o={}; head.forEach((h,i)=>o[h]=c[i]); return o; }));
    };
    rd.readAsText(file);
  } else {
    loadSheetJS().then(XLSX=>{
      rd.onload=()=>{
        const wb=XLSX.read(rd.result,{type:'array'});
        finish(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
      };
      rd.readAsArrayBuffer(file);
    }).catch(()=>toast(t('csvFallback')));
  }
}
function parseCsvLine(line){
  const out=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(q){ if(ch==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
    else if(ch==='"') q=true;
    else if(ch===','){ out.push(cur); cur=''; }
    else cur+=ch;
  }
  out.push(cur); return out;
}

/* ============================= FILES ============================= */
function downloadBlob(name, text, type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:type||'application/json'}));
  a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
const downloadJson = (name,obj) => downloadBlob(name, JSON.stringify(obj,null,1));

/* Active family filters are echoed onto the chart so they can be
   dropped without going back to the sidebar. */
function renderFilterChips(){
  let bar = $('filterChips');
  const picked = state.ui.filters.families;
  if(!picked.length){ if(bar) bar.remove(); return; }
  if(!bar){
    bar=document.createElement('div'); bar.id='filterChips'; bar.className='filter-chips';
    document.querySelector('.canvas-wrap').appendChild(bar);
  }
  bar.innerHTML = `<span class="fc-label">${t('showingOnly')}</span>` + picked.map(n=>{
    const c=(state.tags.families[n]||{}).color||'#7d7263';
    const label = n==='__none' ? t('noFamily') : n;
    return `<span class="fc" data-n="${esc(n)}"><i style="background:${c}"></i>${esc(label)}<b>✕</b></span>`;
  }).join('');
  bar.querySelectorAll('.fc').forEach(el=>{
    el.querySelector('b').onclick=()=>{
      const arr=state.ui.filters.families;
      arr.splice(arr.indexOf(el.dataset.n),1);
      saveState(); renderLegends(); renderTree();
    };
  });
}

function knownSources(){
  const set=new Set();
  state.people.forEach(p=>{ if(p.source) set.add(p.source); });
  return [...set].sort();
}
function refreshSourceList(){
  const dl=$('sourceListAdd');
  if(dl) dl.innerHTML = knownSources().map(x=>`<option value="${esc(x)}"></option>`).join('');
}

/* ============================= COMBOBOX =============================
   A father picker you can type into. Matching is script-agnostic and
   typo-tolerant, so "gudi", "Гуди" and "gudee" all reach the same man. */
function buildCombo(host, currentId, onPick){
  const cur = currentId ? getPerson(currentId) : null;
  host.innerHTML = `<input type="text" placeholder="${esc(t('typeToSearch'))}" value="${cur?esc(cur.nameRu+' — '+cur.nameEn):''}">
    <button class="combo-clear" title="${esc(t('clear'))}">✕</button>
    <div class="combo-list" hidden></div>`;
  const input=host.querySelector('input'), list=host.querySelector('.combo-list');
  let picked = currentId || null, hits = [], cur_i = -1;
  const draw = ()=>{
    if(!hits.length){ list.innerHTML=`<div class="combo-empty">${t('nothingFound')}</div>`; list.hidden=false; return; }
    list.innerHTML = hits.map((h,i)=>{
      const p=getPerson(h.id);
      return `<div class="combo-item${i===cur_i?' sel':''}" data-id="${p.id}">${esc(p.nameRu)}
        <div class="sub">${esc(p.nameEn)}${p.family?' · '+esc(p.family):''} · ${t('generation')} ${generationOf(p.id)}</div></div>`;
    }).join('');
    list.hidden=false;
  };
  const search = q=>{
    hits = state.people.filter(p=>p.id!==host.dataset.exclude)
      .map(p=>({id:p.id, s:personScore(q,p)})).filter(h=>h.s<99)
      .sort((a,b)=>a.s-b.s).slice(0,30);
    cur_i=-1; draw();
  };
  const choose = id=>{
    picked=id;
    const p=getPerson(id);
    input.value = p ? p.nameRu+' — '+p.nameEn : '';
    list.hidden=true; onPick(id);
  };
  input.addEventListener('input',()=>{
    const q=input.value.trim();
    if(!q){ picked=null; onPick(null); list.hidden=true; return; }
    search(q);
  });
  input.addEventListener('focus',()=>{ if(input.value.trim()) search(input.value.trim()); });
  input.addEventListener('keydown',e=>{
    if(list.hidden||!hits.length) return;
    if(e.key==='ArrowDown'){ cur_i=Math.min(cur_i+1,hits.length-1); draw(); e.preventDefault(); }
    if(e.key==='ArrowUp'){ cur_i=Math.max(cur_i-1,0); draw(); e.preventDefault(); }
    if(e.key==='Enter'){ e.preventDefault(); const h=hits[Math.max(cur_i,0)]; if(h) choose(h.id); }
    if(e.key==='Escape') list.hidden=true;
  });
  list.addEventListener('click',e=>{ const it=e.target.closest('.combo-item'); if(it) choose(it.dataset.id); });
  host.querySelector('.combo-clear').onclick=()=>{ input.value=''; picked=null; onPick(null); list.hidden=true; };
  document.addEventListener('click',e=>{ if(!host.contains(e.target)) list.hidden=true; });
  return {get:()=>picked};
}

/* ============================= SEARCH ============================= */
function bindSearch(){
  const input=$('searchInput'), box=$('searchResults');
  let hits=[], cur=-1;
  const draw=()=>{
    if(!hits.length){ box.innerHTML=`<div class="sr-empty">${t('nothingFound')}</div>`; box.style.display='block'; return; }
    box.innerHTML=hits.map((h,i)=>{
      const p=getPerson(h.id);
      return `<div class="sr-item${i===cur?' sel':''}" data-id="${p.id}">
        <div>${esc(p.nameRu)}</div>
        <div class="sub">${esc(p.nameEn)}${p.family?' · '+esc(p.family):''} · ${t('generation')} ${generationOf(p.id)}</div></div>`;
    }).join('');
    box.style.display='block';
  };
  input.addEventListener('input',()=>{
    const q=input.value.trim();
    if(!q){ box.style.display='none'; hits=[]; return; }
    hits=state.people.map(p=>({id:p.id,s:personScore(q,p)})).filter(h=>h.s<99).sort((a,b)=>a.s-b.s).slice(0,40);
    cur=-1; draw();
  });
  input.addEventListener('keydown',e=>{
    if(!hits.length) return;
    if(e.key==='ArrowDown'){ cur=Math.min(cur+1,hits.length-1); draw(); e.preventDefault(); }
    if(e.key==='ArrowUp'){ cur=Math.max(cur-1,0); draw(); e.preventDefault(); }
    if(e.key==='Enter'){ const h=hits[Math.max(cur,0)]; if(h) go(h.id); }
  });
  box.addEventListener('click',e=>{ const it=e.target.closest('.sr-item'); if(it) go(it.dataset.id); });
  document.addEventListener('click',e=>{ if(!e.target.closest('.search-wrap')) box.style.display='none'; });
  function go(id){ box.style.display='none'; input.blur(); revealAndCentre(id); }
}

/* ============================= THEME ============================= */
function applyTheme(){
  document.documentElement.classList.toggle('light', state.ui.theme==='light');
  $('themeBtn').textContent = state.ui.theme==='light' ? '☀' : '☾';
}

/* ============================= BOOT ============================= */
loadRaw().then(raw=>{
  baseData=raw;
  const saved=store.get(K.state,{});
  state={
    people:[], edits:saved.edits||{}, positions:saved.positions||{},
    pending:saved.pending||[], audit:saved.audit||[], versions:saved.versions||[],
    passcodes:saved.passcodes||{moderator:'mod123', admin:'admin123'},
    tags:saved.tags||{families:{},teips:{},tukkhums:{}},
    ui:Object.assign({
      lang:'en', theme:'dark', editMode:false,
      hoverFields:['family','teip','lived','age','generation','sons','flags'],
      selectFields:['family','teip','tukkhum','lived','age','generation','line','notes','source','flags'],
      filters:{families:[],teips:[],tukkhums:[],flags:[]}
    }, saved.ui||{})
  };
  if(!state.ui.filters) state.ui.filters={families:[],teips:[],tukkhums:[],flags:[]};
  LANG=state.ui.lang||'en';
  currentUser=store.get(K.user,{name:'',role:'viewer'});
  if(currentUser.role==='contributor') currentUser.role='viewer';   // role withdrawn for now
  applyEdits(); buildTags();
  if(CFG.familyColors) for(const [n,c] of Object.entries(CFG.familyColors))
    if(state.tags.families[n]) state.tags.families[n].color=c;
  applyTheme(); applyLang(); renderAll(); bindChrome(); makePanelsFoldable();
  buildDateField($('p_birth'),''); buildDateField($('p_death'),'');
  setTimeout(fitAll,60);
  if(!store.ok) toast(t('storageOff'));
}).catch(err=>{
  document.querySelector('.canvas-wrap').insertAdjacentHTML('beforeend',
    `<div class="empty-state" style="display:block;max-width:420px">
      <div class="es-title">data/people.json didn’t load</div>
      <div style="line-height:1.6">Open this over http — a local server or GitHub Pages — rather than
      double-clicking the file.<br><br><code style="font-family:var(--font-m)">${esc(err.message)}</code></div></div>`);
});

/* ============================= BINDINGS ============================= */
function makePanelsFoldable(){
  const folded = state.ui.folded || {};
  document.querySelectorAll('.sidebar .panel').forEach((panel,i)=>{
    const h = panel.querySelector('h2'); if(!h || h.dataset.foldable) return;
    h.dataset.foldable='1';
    const key = panel.id || ('panel'+i);
    const chev = document.createElement('span');
    chev.className='chev'; chev.textContent='▾';
    h.insertBefore(chev, h.firstChild);
    const wrap = document.createElement('span');
    wrap.className='heading';
    while(h.childNodes.length>1 && h.childNodes[1]!==h.querySelector('.count')){
      wrap.appendChild(h.childNodes[1]);
    }
    h.insertBefore(wrap, h.childNodes[1] || null);
    if(folded[key]) panel.classList.add('folded');
    const toggle = ()=>{
      panel.classList.toggle('folded');
      state.ui.folded = state.ui.folded || {};
      state.ui.folded[key] = panel.classList.contains('folded');
      saveState();
    };
    chev.onclick = toggle; wrap.onclick = toggle;
  });
}

function bindChrome(){
  const svg=$('tree-svg');

  svg.addEventListener('pointerdown',e=>{
    if(e.target.closest('.node-group')||e.target.closest('.handle')) return;
    if(selectedIds.size && !e.shiftKey){ selectedIds.clear(); renderTree(); }
    $('sidebar').classList.add('collapsed');
    isPanning=true; panStart={mx:e.clientX,my:e.clientY,x:viewT.x,y:viewT.y};
    svg.classList.add('panning');
    try{ svg.setPointerCapture(e.pointerId); }catch(_){}
  });
  window.addEventListener('pointermove',e=>{
    if(isPanning){
      viewT.x=panStart.x+(e.clientX-panStart.mx);
      viewT.y=panStart.y+(e.clientY-panStart.my);
      applyTransform();
    } else if(linkDrag){
      const pt=svgPoint(e); linkDrag.x=pt.x; linkDrag.y=pt.y; renderTree();
    } else if(draggingId && editing()){
      const pt=svgPoint(e);
      const dx=pt.x-dragStart.x, dy=pt.y-dragStart.y;
      if(Math.abs(dx)+Math.abs(dy)>2) dragMoved=true;
      if(dragMoved){
        dragOrigin.forEach((o,gid)=>{ state.positions[gid]={x:o.x+dx, y:o.y+dy}; });
        renderTree();
      }
    }
  });
  window.addEventListener('pointerup',()=>{
    if(isPanning){ isPanning=false; svg.classList.remove('panning'); ensureSomeoneVisible(); }
    if(linkDrag){                       // released on empty space: cancel
      linkDrag=null; renderTree(); toast(t('linkCancelled'));
    }
  });

  svg.addEventListener('wheel',e=>{
    e.preventDefault();
    const r=svg.getBoundingClientRect();
    const k2=Math.min(MAX_K,Math.max(MIN_K,viewT.k*Math.exp(-e.deltaY*0.0016)));
    const cx=e.clientX-r.left, cy=e.clientY-r.top;
    viewT.x=cx-(cx-viewT.x)*(k2/viewT.k);
    viewT.y=cy-(cy-viewT.y)*(k2/viewT.k);
    viewT.k=k2; applyTransform(); scheduleLabelRefresh();
  },{passive:false});

  $('zoomIn').onclick=()=>zoomAbout(1.3);
  $('zoomOut').onclick=()=>zoomAbout(1/1.3);
  $('zoomFit').onclick=fitAll;

  $('editModeToggle').addEventListener('change',e=>{
    state.ui.editMode = e.target.checked;
    if(!state.ui.editMode){ selectedIds.clear(); linkDrag=null; }
    saveState(); renderAll();
    toast(state.ui.editMode ? t('editModeOn') : t('viewModeOn'));
  });
  $('realignBtn').onclick=()=>{
    mutate({action:'realigned', detail:''}, ()=>{ state.positions={}; });
    toast(t('realigned')); fitAll();
  };
  $('themeBtn').onclick=()=>{ state.ui.theme = state.ui.theme==='light'?'dark':'light'; applyTheme(); saveState(); };
  $('uiLangBtn').onclick=()=>{ LANG = LANG==='en'?'ru':'en'; state.ui.lang=LANG; saveState(); applyLang(); renderAll(); };
  $('undoBtn').onclick=undo;
  $('redoBtn').onclick=redo;

  $('fieldsBtn').onclick=e=>{ e.stopPropagation(); $('fieldsPop').hidden=!$('fieldsPop').hidden; };
  document.addEventListener('click',e=>{ if(!e.target.closest('.popwrap')) $('fieldsPop').hidden=true; });
  $('tooltipToggle').addEventListener('change',e=>{ tooltipEnabled=e.target.checked; if(!tooltipEnabled) hideTooltip(); });
  $('langDisplay').addEventListener('change',e=>{ langDisplay=e.target.value; renderTree(); });
  $('sidebarToggle').onclick=()=>$('sidebar').classList.toggle('collapsed');
  $('loginBtn').onclick=()=>{ $('sidebar').classList.remove('collapsed'); $('userName').focus(); };
  const signOut=()=>{ currentUser={name:currentUser.name,role:'viewer'}; saveUser(); renderAll(); };
  $('signOutBtn').onclick=signOut; $('signOutBtn2').onclick=signOut;

  $('userRole').addEventListener('change',e=>{
    $('passcodeField').style.display=(e.target.value==='moderator'||e.target.value==='admin')?'':'none';
  });
  $('saveIdentityBtn').onclick=()=>{
    const name=$('userName').value.trim(), role=$('userRole').value;
    if(role==='moderator'||role==='admin'){
      if($('userPasscode').value !== state.passcodes[role]){ toast(t('wrongPass')); return; }
    }
    currentUser={name,role}; saveUser();
    log('signed in as',role); saveState(); renderAll();
    toast(`${t('signedInAs')} ${role}`);
  };
  $('savePasscodesBtn').onclick=()=>{
    state.passcodes={moderator:$('modPasscode').value.trim(), admin:$('adminPasscode').value.trim()};
    saveState(); toast(t('savePasscodes')+' ✓');
  };
  $('resetAllBtn').onclick=async ()=>{
    if(!await askConfirm(t('resetLocal'),'')) return;
    pushHistory();
    state.edits={}; state.positions={}; state.pending=[]; state.audit=[];
    collapsed.clear(); saveState(); rebuild();
  };

  $('exportDataBtn').onclick=()=>{ downloadJson('people.json', denormalise()); toast(t('downloadFirst')); };
  $('exportBtn').onclick=()=>downloadJson(`lineage-backup-${new Date().toISOString().slice(0,10)}.json`,
    {kind:'lineage-backup', meta:baseData.meta, edits:state.edits, positions:state.positions,
     pending:state.pending, audit:state.audit, tags:state.tags, versions:state.versions, ui:state.ui});
  $('importBtn').onclick=()=>$('importFile').click();
  $('importFile').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const d=JSON.parse(rd.result);
        pushHistory();
        if(d.edits) state.edits=d.edits;
        if(d.positions) state.positions=d.positions;
        if(d.pending) state.pending=d.pending;
        if(d.audit) state.audit=d.audit;
        if(d.tags) state.tags=d.tags;
        if(d.versions) state.versions=d.versions;
        if(d.ui) state.ui=Object.assign(state.ui,d.ui);
        saveState(); rebuild(); toast(t('importBackup')+' ✓');
      }catch(err){ toast('JSON: '+err.message); }
    };
    rd.readAsText(f); e.target.value='';
  });
  $('exportXlsxBtn').onclick=exportSheet;
  $('importXlsxBtn').onclick=()=>$('importSheet').click();
  $('importSheet').addEventListener('change',e=>{
    const f=e.target.files[0]; if(f) importSheet(f);
    e.target.value='';
  });

  wireTranslit($('p_nameRu'), $('p_nameEn'));
  [['p_family','newFamRow'],['p_teip','newTeipRow'],['p_tukkhum','newTukRow']].forEach(([sel,row])=>{
    $(sel).addEventListener('change',e=>{ $(row).style.display=e.target.value==='__new'?'flex':'none'; });
  });
  $('addPersonBtn').onclick=addPerson;

  bindSearch();
  /* Close only when the press *and* the release both land on the backdrop.
     Otherwise the click that opened the card lands on the freshly-shown
     overlay and shuts it again. */
  let backdropDown=false;
  $('infoOverlay').addEventListener('pointerdown',e=>{ backdropDown = (e.target.id==='infoOverlay'); });
  $('infoOverlay').addEventListener('click',e=>{
    if(backdropDown && e.target.id==='infoOverlay') closeInfo();
    backdropDown=false;
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ closeInfo(); $('searchResults').style.display='none'; $('fieldsPop').hidden=true; if(selectedIds.size||linkDrag){ selectedIds.clear(); linkDrag=null; renderTree(); } }
    if(e.key==='/' && document.activeElement!==$('searchInput')){ e.preventDefault(); $('searchInput').focus(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z' && canEdit()){ e.preventDefault(); e.shiftKey?redo():undo(); }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y' && canEdit()){ e.preventDefault(); redo(); }
  });
  window.addEventListener('resize',applyTransform);
}
