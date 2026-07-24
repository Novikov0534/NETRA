/* Демонстрационные данные */
const DEMOS = {
  loaded: { name:"Нагруженная сеть", file:"data/high-load-network.json" },
  deadheavy: { name:"Много мёртвых узлов", file:"data/dead-nodes-network.json" },
  sparse: { name:"Разреженный граф", file:"data/normal-network.json" },
  mixed: { name:"Смешанная топология", file:"data/large-network.json" },
  critical: { name:"Критическая сеть", file:"data/critical-network.json" },
};

/* СОСТОЯНИЕ */
const STORAGE_KEYS = {
  visited: "netra:visited",
  recent: "netra:recent-datasets",
};
const MAX_RECENT_DATASETS = 8;
const MAX_STORED_DATASET_CHARS = 1200000;
const MAX_IMPORT_FILES = 30;
const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_TOTAL_BYTES = 100 * 1024 * 1024;

let currentData = null;
let currentName = "—";
let currentIssues = [];
let cy = null;
let deadPulseRAF = null;
let openedDatasets = [];
let activeDatasetId = null;
let renderedDatasetId = null;
let activeViewName = "home";
let draggedDatasetId = null;
let draggedDatasetSource = null;
let draggedDatasetShell = null;
let draggedDatasetPointerId = null;
let draggedDatasetStart = null;
let datasetDragGhost = null;
let datasetPointerDragging = false;
let datasetDropTarget = null;
let datasetDropAfter = false;
let suppressDatasetTabClickUntil = 0;
let importInProgress = false;
let appNoticeTimer = null;

const views = {
  home: document.getElementById("view-home"),
  viz: document.getElementById("view-viz"),
  stats: document.getElementById("view-stats"),
};
const fileInput = document.getElementById("file-input");
const uploadButtons = [
  document.getElementById("upload-trigger"),
  document.getElementById("quick-upload-trigger"),
].filter(Boolean);
const openDatasetList = document.getElementById("open-dataset-list");
const recentDatasetList = document.getElementById("recent-dataset-list");
const datasetTabs = document.getElementById("dataset-tabs");
const statsDatasetTabs = document.getElementById("stats-dataset-tabs");
const datasetTabContainers = [datasetTabs, statsDatasetTabs];
const datasetTabShells = datasetTabContainers.map(container=>container.closest(".dataset-tabs-shell"));
const appNotice = document.getElementById("app-notice");
const appNoticeTitle = document.getElementById("app-notice-title");
const appNoticeDetail = document.getElementById("app-notice-detail");

/* ПЕРВЫЙ ВИЗИТ */
let hasVisited = false;
try{
  hasVisited = localStorage.getItem(STORAGE_KEYS.visited) === "1";
  localStorage.setItem(STORAGE_KEYS.visited, "1");
}catch(err){
  // Приложение остается рабочим, даже если браузер запретил localStorage.
}
document.body.classList.toggle("returning-user", hasVisited);

/* Переключение вкладок */
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>setView(btn.dataset.view));
});

function setView(name){
  if(activeViewName === "viz" && name !== "viz"){
    captureGraphViewState();
    pauseGraphRendering();
  }

  activeViewName = name;
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===name));
  Object.entries(views).forEach(([k,el])=>el.classList.toggle("active", k===name));
  window.scrollTo(0, 0);

  if(name === "viz"){
    const requestedDatasetId = activeDatasetId;
    setTimeout(()=>{
      if(activeViewName !== "viz" || activeDatasetId !== requestedDatasetId) return;

      const dataset = openedDatasets.find(item=>item.id === requestedDatasetId);
      if(dataset && renderedDatasetId !== dataset.id){
        renderGraph(dataset);
      }else{
        resumeGraphRendering();
      }
    }, 0);
  }

  const activeTabs = name === "stats" ? statsDatasetTabs : name === "viz" ? datasetTabs : null;
  if(activeTabs) requestAnimationFrame(()=>{
    scrollActiveDatasetTabIntoView(activeTabs);
    updateDatasetTabScrollControls(activeTabs);
  });
}

document.getElementById("scroll-demos").addEventListener("click", ()=>{
  document.getElementById("demos-section").scrollIntoView({behavior:"smooth"});
});

uploadButtons.forEach(button=>{
  button.addEventListener("click", ()=>{
    if(!importInProgress) fileInput.click();
  });
});

document.getElementById("clear-recent").addEventListener("click", ()=>{
  try{
    localStorage.removeItem(STORAGE_KEYS.recent);
    renderDatasetLists();
    showAppNotice("История JSON очищена.", { type:"success" });
  }catch(err){
    showAppNotice("Не удалось очистить историю браузера.", { type:"error" });
  }
});
document.getElementById("app-notice-close").addEventListener("click", hideAppNotice);

/* ЗАГРУЗКА ДАННЫХ */
document.querySelectorAll(".demo-card").forEach(card=>{
  card.addEventListener("click", async ()=>{
    const key = card.dataset.demo;
    const demo = DEMOS[key];
    if(!demo) return;
    try{
      const data = await loadDemoDataset(key, demo);
      openDataset(data, demo.name, { id:`demo-${key}`, source:"demo" });
      setView("viz");
    }catch(err){
      showAppNotice("Не удалось загрузить демо-набор.", {
        type:"error",
        detail:"Загрузите JSON вручную или запустите проект через start.bat.",
        duration:9000,
      });
    }
  });
});

async function loadDemoDataset(key, demo){
  if(location.protocol !== "file:"){
    try{
      const response = await fetch(demo.file);
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    }catch(err){
      const fallback = getEmbeddedDemoDataset(key);
      if(fallback) return fallback;
      throw err;
    }
  }

  const fallback = getEmbeddedDemoDataset(key);
  if(fallback) return fallback;
  throw new Error(`Embedded demo "${key}" not found`);
}

function getEmbeddedDemoDataset(key){
  if(typeof DEMO_DATA === "undefined" || !DEMO_DATA[key]) return null;
  return JSON.parse(JSON.stringify(DEMO_DATA[key]));
}

function showAppNotice(title, options = {}){
  const type = ["success", "warning", "error"].includes(options.type) ? options.type : "info";
  const detail = options.detail || "";
  const duration = options.duration === undefined ? 5000 : options.duration;

  clearTimeout(appNoticeTimer);
  appNotice.className = `app-notice ${type}`;
  appNoticeTitle.textContent = title;
  appNoticeDetail.textContent = detail;
  appNoticeDetail.hidden = !detail;
  appNotice.hidden = false;

  if(duration > 0){
    appNoticeTimer = setTimeout(hideAppNotice, duration);
  }
}

function hideAppNotice(){
  clearTimeout(appNoticeTimer);
  appNoticeTimer = null;
  appNotice.hidden = true;
}

function setImportBusy(busy){
  fileInput.disabled = busy;
  uploadButtons.forEach(button=>{
    button.disabled = busy;
    button.setAttribute("aria-busy", busy ? "true" : "false");
  });
}

function readFileAsText(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = event=>resolve(String(event.target.result || ""));
    reader.onerror = ()=>reject(new Error("не удалось прочитать файл"));
    reader.onabort = ()=>reject(new Error("чтение файла отменено"));
    reader.readAsText(file);
  });
}

function formatFileSize(bytes){
  if(bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

async function parseDatasetFile(file){
  if(file.size > MAX_IMPORT_FILE_BYTES){
    throw new Error(`размер ${formatFileSize(file.size)} превышает лимит ${formatFileSize(MAX_IMPORT_FILE_BYTES)}`);
  }

  const text = (await readFileAsText(file)).replace(/^\uFEFF/, "");
  if(!text.trim()) throw new Error("файл пуст");

  let data;
  try{
    data = JSON.parse(text);
  }catch(err){
    throw new Error("неверный синтаксис JSON");
  }
  if(!isDatasetDocument(data)){
    throw new Error('ожидается объект с массивами "nodes" и "links"');
  }

  const fileName = file.name.replace(/\.json$/i, "") || file.name;
  return {
    data,
    datasetId:typeof data.datasetId === "string" && data.datasetId.trim() ? data.datasetId.trim() : null,
    name:typeof data.name === "string" && data.name.trim() ? data.name.trim() : fileName,
    source:typeof data.source === "string" && data.source.trim() ? data.source.trim() : "file",
    fileName:file.name,
  };
}

async function importDatasetFiles(files){
  const selectedFiles = files.slice(0, MAX_IMPORT_FILES);
  const failures = [];
  if(files.length > MAX_IMPORT_FILES){
    failures.push({
      fileName:`Ещё ${files.length - MAX_IMPORT_FILES} файл(ов)`,
      reason:`за один раз можно выбрать не более ${MAX_IMPORT_FILES}`,
    });
  }

  const readableFiles = [];
  let totalBytes = 0;
  selectedFiles.forEach(file=>{
    if(file.size > MAX_IMPORT_FILE_BYTES){
      failures.push({
        fileName:file.name,
        reason:`размер ${formatFileSize(file.size)} превышает лимит ${formatFileSize(MAX_IMPORT_FILE_BYTES)}`,
      });
      return;
    }
    if(totalBytes + file.size > MAX_IMPORT_TOTAL_BYTES){
      failures.push({
        fileName:file.name,
        reason:`общий размер выбранных файлов превышает ${formatFileSize(MAX_IMPORT_TOTAL_BYTES)}`,
      });
      return;
    }
    totalBytes += file.size;
    readableFiles.push(file);
  });

  const parsedResults = [];
  for(let index = 0; index < readableFiles.length; index++){
    const file = readableFiles[index];
    showAppNotice(`Чтение JSON-файлов: ${index + 1} из ${readableFiles.length}…`, { duration:0 });
    try{
      parsedResults.push({ ok:true, value:await parseDatasetFile(file) });
    }catch(err){
      parsedResults.push({ ok:false, fileName:file.name, reason:err.message || "неизвестная ошибка" });
    }
  }

  const successes = parsedResults.filter(result=>result.ok).map(result=>result.value);
  parsedResults.filter(result=>!result.ok).forEach(result=>failures.push(result));

  const openedIds = [];
  successes.forEach(item=>{
    try{
      openedIds.push(openDataset(item.data, item.name, {
        id:item.datasetId,
        source:item.source,
        replace:true,
        activate:false,
      }));
    }catch(err){
      failures.push({ fileName:item.fileName, reason:"не удалось открыть набор" });
    }
  });

  const validOpenedIds = openedIds.filter(Boolean);
  if(validOpenedIds.length){
    activateDataset(validOpenedIds[validOpenedIds.length - 1], { force:true });
    setView("viz");
  }

  const failureDetail = failures
    .slice(0, 4)
    .map(item=>`${item.fileName}: ${item.reason}`)
    .join(" · ");
  const remainingFailures = Math.max(0, failures.length - 4);
  const detail = failureDetail + (remainingFailures ? ` · Ещё ошибок: ${remainingFailures}` : "");

  if(!validOpenedIds.length){
    showAppNotice("JSON-файлы не загружены.", {
      type:"error",
      detail:detail || 'Ожидается формат { "nodes": [...], "links": [...] }.',
      duration:12000,
    });
  }else if(failures.length){
    showAppNotice(`Загружено файлов: ${validOpenedIds.length} из ${files.length}.`, {
      type:"warning",
      detail,
      duration:12000,
    });
  }else{
    const uniqueTabs = new Set(validOpenedIds).size;
    const detailText = uniqueTabs < validOpenedIds.length
      ? `Открыто или обновлено вкладок: ${uniqueTabs}.`
      : "";
    showAppNotice(`Загружено файлов: ${validOpenedIds.length}.`, {
      type:"success",
      detail:detailText,
      duration:6500,
    });
  }
}

fileInput.addEventListener("change", async (event)=>{
  const files = [...(event.target.files || [])];
  fileInput.value = "";
  if(!files.length || importInProgress) return;

  importInProgress = true;
  setImportBusy(true);
  try{
    await importDatasetFiles(files);
  }catch(err){
    showAppNotice("Не удалось завершить загрузку JSON.", {
      type:"error",
      detail:err.message || "Непредвиденная ошибка импорта.",
      duration:12000,
    });
  }finally{
    importInProgress = false;
    setImportBusy(false);
  }
});

openDatasetList.addEventListener("click", handleDatasetListClick);
recentDatasetList.addEventListener("click", handleDatasetListClick);
datasetTabs.addEventListener("click", handleDatasetListClick);
statsDatasetTabs.addEventListener("click", handleDatasetListClick);

datasetTabShells.forEach(shell=>{
  shell.addEventListener("pointerdown", handleDatasetTabPointerDown);
});
document.addEventListener("pointermove", handleDatasetTabPointerMove, { passive:false });
document.addEventListener("pointerup", handleDatasetTabPointerUp);
document.addEventListener("pointercancel", ()=>finishDatasetTabDrag());

document.querySelectorAll("[data-tabs-scroll]").forEach(button=>{
  button.addEventListener("click", ()=>{
    const container = button.closest(".dataset-tabs-shell").querySelector(".dataset-tabs");
    const direction = Number(button.dataset.tabsScroll) || 1;
    const distance = Math.max(220, container.clientWidth * 0.72);
    container.scrollBy({ left:direction * distance, behavior:"smooth" });
  });
});

datasetTabContainers.forEach(container=>{
  container.addEventListener("scroll", ()=>updateDatasetTabScrollControls(container), { passive:true });
});
window.addEventListener("resize", ()=>{
  datasetTabContainers.forEach(updateDatasetTabScrollControls);
});

function handleDatasetListClick(evt) {
  if(evt.currentTarget.classList.contains("dataset-tabs") && Date.now() < suppressDatasetTabClickUntil){
    evt.preventDefault();
    return;
  }

  const fromStatsTabs = Boolean(evt.currentTarget.closest("#view-stats"));

  const closeBtn = evt.target.closest("[data-close-dataset]");
  if (closeBtn) {
    closeDataset(closeBtn.dataset.closeDataset);
    return;
  }

  const sessionBtn = evt.target.closest("[data-open-dataset]");
  if (sessionBtn) {
    activateDataset(sessionBtn.dataset.openDataset);
    if (!fromStatsTabs) setView("viz");
    return;
  }

  const recentBtn = evt.target.closest("[data-recent-dataset]");
  if (recentBtn) {
    const recent = getRecentDatasets();
    const item = recent.find(d => d.id === recentBtn.dataset.recentDataset);
    
    if (item) {
      // доп страховка на открытие датасета
      const existing = openedDatasets.find(d => 
        d.name === item.name && 
        d.source === (item.source || "history")
      );
      
      if (existing) {
        activateDataset(existing.id);
      } else {
        openDataset(item.data, item.name, { source: item.source || "history" });
      }
      
      if (!fromStatsTabs) setView("viz");
    }
  }
}

function dispatchNetraEvent(name, dataset){
  window.dispatchEvent(new CustomEvent(`netra:topology:${name}`, {
    detail:dataset
      ? { id:dataset.id, name:dataset.name, source:dataset.source }
      : null,
  }));
}

function openDataset(data, name, options = {}) {
  const source = options.source || "file";
  const datasetName = String(name || "Без названия");
  const requestedId = options.id===undefined || options.id===null ? null : String(options.id);
  const shouldReplace = source === "file" || options.replace === true;
  const shouldActivate = options.activate !== false;
  const shouldRemember = options.remember !== false;

  const existing = requestedId
    ? openedDatasets.find(dataset=>dataset.id === requestedId)
    : openedDatasets.find(dataset=>dataset.name === datasetName && dataset.source === source);

  if (existing) {
    if(shouldReplace){
      if(renderedDatasetId === existing.id) captureGraphViewState();
      existing.data = data;
      existing.name = datasetName;
      existing.source = source;
      existing.openedAt = Date.now();
      existing.issues = validateDataset(data);
      if(renderedDatasetId === existing.id) renderedDatasetId = null;
      if(shouldRemember) saveRecentDataset(existing);
      dispatchNetraEvent("dataset-updated", existing);
    }
    if(shouldActivate) activateDataset(existing.id, { force:shouldReplace });
    return existing.id;
  }

  const id = requestedId || createDatasetId();
  const dataset = {
    id,
    name: datasetName,
    source: source,
    openedAt: Date.now(),
    data,
    issues:validateDataset(data),
  };

  openedDatasets.push(dataset);
  if(shouldRemember) saveRecentDataset(dataset);
  dispatchNetraEvent("dataset-opened", dataset);
  if(shouldActivate) activateDataset(id);
  return id;
}

function activateDataset(id, options = {}) {
  const dataset = openedDatasets.find(item => item.id === id);
  if (!dataset) return;
  const force = options.force === true;

  // Активный набор мог измениться в статистике, пока граф ещё не перерисован.
  if (activeDatasetId === id && !force) {
    if(activeViewName === "viz" && renderedDatasetId !== id) renderGraph(dataset);
    return;
  }

  // Фиксируем камеру текущей вкладки до смены активного набора.
  if(renderedDatasetId === activeDatasetId){
    captureGraphViewState();
  }

  activeDatasetId = id;
  currentData = dataset.data;
  currentName = dataset.name;
  currentIssues = getDatasetIssues(dataset);

  document.getElementById("nav-status-text").textContent = currentName.toUpperCase() + (currentIssues.length ? " · ОШИБКИ" : "");
  
  // Сбрасываем фильтры при переключении на новый граф
  if (typeof resetFilters === 'function') {
    resetFilters();
  }

  // Сначала обновляем окружающий интерфейс, чтобы граф получил окончательный размер области.
  renderStats(dataset.data);
  renderIssuesBanner(currentIssues);
  renderIssuesSection(currentIssues);
  renderDatasetLists();

  // На скрытой вкладке граф не пересчитывается: это экономит CPU и не меняет его положение.
  if(activeViewName === "viz") renderGraph(dataset);
  dispatchNetraEvent("dataset-activated", dataset);
}

function closeDataset(id){
  const index = openedDatasets.findIndex(item=>item.id===id);
  if(index < 0) return;

  if(renderedDatasetId === id){
    pauseGraphRendering();
    renderedDatasetId = null;
  }
  const [closedDataset] = openedDatasets.splice(index, 1);
  dispatchNetraEvent("dataset-closed", closedDataset);
  if(activeDatasetId === id){
    const next = openedDatasets[index] || openedDatasets[index - 1] || openedDatasets[0];
    if(next) activateDataset(next.id);
    else clearActiveDataset();
  }else{
    renderDatasetLists();
  }
}

function clearActiveDataset(){
  activeDatasetId = null;
  currentData = null;
  currentName = "—";
  currentIssues = [];
  dispatchNetraEvent("dataset-activated", null);
  
  // Очищаем только заголовок и счетчики визуализации
  document.getElementById("nav-status-text").textContent = "СИСТЕМА АКТИВНА";
  document.getElementById("viz-dataset-name").textContent = "—";
  document.getElementById("viz-node-count").textContent = "0";
  document.getElementById("viz-edge-count").textContent = "0";
  
  // Эта функция очистит KPI, таблицу и поставит SVG-заглушки
  if (typeof clearStatsDashboard === 'function') {
    clearStatsDashboard();
  }

  destroyGraph();
  closePanel();
  renderIssuesBanner([]);
  renderIssuesSection([]);
  renderDatasetLists();
}

/* Списки наборов данных */
function renderDatasetLists(){
  renderOpenedDatasets();
  renderRecentDatasets();
  renderDatasetTabs();
}

function renderOpenedDatasets(){
  if(!openedDatasets.length){
    openDatasetList.innerHTML = `<div class="dataset-empty">Открытых визуализаций пока нет.</div>`;
    return;
  }
  openDatasetList.innerHTML = openedDatasets.map(dataset=>datasetListItem(dataset, "open")).join("");
}

function renderRecentDatasets(){
  const recent = getRecentDatasets();
  if(!recent.length){
    recentDatasetList.innerHTML = `<div class="dataset-empty">История появится после загрузки JSON.</div>`;
    return;
  }
  recentDatasetList.innerHTML = recent.map(dataset=>datasetListItem(dataset, "recent")).join("");
}

function renderDatasetTabs(focusDatasetId = activeDatasetId){
  const markup = buildDatasetTabsMarkup();
  datasetTabs.innerHTML = markup;
  statsDatasetTabs.innerHTML = markup;
  requestAnimationFrame(()=>{
    datasetTabContainers.forEach(container=>{
      updateDatasetTabScrollControls(container);
      scrollDatasetTabIntoView(container, focusDatasetId);
    });
  });
}

function scrollActiveDatasetTabIntoView(container){
  scrollDatasetTabIntoView(container, activeDatasetId);
}

function scrollDatasetTabIntoView(container, datasetId){
  if(!container || !container.clientWidth) return;
  const targetTab = [...container.querySelectorAll(".dataset-tab")]
    .find(tab=>tab.dataset.openDataset === datasetId);
  if(!targetTab) return;

  const left = targetTab.offsetLeft;
  const right = left + targetTab.offsetWidth;
  const visibleLeft = container.scrollLeft;
  const visibleRight = visibleLeft + container.clientWidth;

  if(left < visibleLeft){
    container.scrollLeft = Math.max(0, left - 16);
  }else if(right > visibleRight){
    container.scrollLeft = right - container.clientWidth + 16;
  }

  updateDatasetTabScrollControls(container);
}

function updateDatasetTabScrollControls(container){
  if(!container) return;
  const shell = container.closest(".dataset-tabs-shell");
  if(!shell || !shell.clientWidth) return;

  const hasTabs = Boolean(container.querySelector(".dataset-tab"));
  const hasOverflow = hasTabs && container.scrollWidth > shell.clientWidth + 2;
  shell.classList.toggle("has-overflow", hasOverflow);

  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  const [leftButton, rightButton] = shell.querySelectorAll("[data-tabs-scroll]");
  [leftButton, rightButton].forEach(button=>{
    button.tabIndex = hasOverflow ? 0 : -1;
    button.setAttribute("aria-hidden", hasOverflow ? "false" : "true");
  });
  leftButton.disabled = !hasOverflow || container.scrollLeft <= 2;
  rightButton.disabled = !hasOverflow || container.scrollLeft >= maxScroll - 2;
}

function handleDatasetTabPointerDown(evt){
  if(evt.button !== 0 || evt.target.closest("[data-close-dataset]")) return;
  const tab = evt.target.closest(".dataset-tab");
  if(!tab) return;

  draggedDatasetId = tab.dataset.openDataset;
  draggedDatasetSource = tab;
  draggedDatasetShell = evt.currentTarget;
  draggedDatasetPointerId = evt.pointerId;
  draggedDatasetStart = { x:evt.clientX, y:evt.clientY };
  datasetPointerDragging = false;
  datasetDropTarget = null;
  datasetDropAfter = false;
  tab.setPointerCapture?.(evt.pointerId);
}

function handleDatasetTabPointerMove(evt){
  if(!draggedDatasetId || evt.pointerId !== draggedDatasetPointerId) return;

  const distance = Math.hypot(
    evt.clientX - draggedDatasetStart.x,
    evt.clientY - draggedDatasetStart.y
  );
  if(!datasetPointerDragging && distance < 7) return;

  if(!datasetPointerDragging){
    datasetPointerDragging = true;
    draggedDatasetSource.classList.add("dragging");
    document.body.classList.add("dragging-dataset-tab");
    createDatasetDragGhost();
  }

  evt.preventDefault();
  moveDatasetDragGhost(evt.clientX, evt.clientY);
  updateDatasetDropTarget(draggedDatasetShell, evt.clientX, evt.clientY);
}

function updateDatasetDropTarget(shell, clientX, clientY){
  clearDatasetDropMarker(shell);
  datasetDropTarget = null;
  datasetDropAfter = false;

  const shellBounds = shell.getBoundingClientRect();
  if(clientY < shellBounds.top - 28 || clientY > shellBounds.bottom + 28) return;

  const container = shell.querySelector(".dataset-tabs");
  const bounds = container.getBoundingClientRect();
  const edgeZone = 54;
  if(clientX < bounds.left + edgeZone){
    container.scrollLeft -= 18;
  }else if(clientX > bounds.right - edgeZone){
    container.scrollLeft += 18;
  }

  const candidates = [...container.querySelectorAll(".dataset-tab")]
    .filter(tab=>tab.dataset.openDataset !== draggedDatasetId);
  let target = candidates.find(tab=>{
    const targetBounds = tab.getBoundingClientRect();
    return clientX < targetBounds.left + targetBounds.width / 2;
  });
  if(!target){
    target = candidates[candidates.length - 1] || null;
    datasetDropAfter = Boolean(target);
  }
  if(!target) return;

  datasetDropTarget = target.dataset.openDataset;
  target.classList.add(datasetDropAfter ? "drop-after" : "drop-before");
}

function handleDatasetTabPointerUp(evt){
  if(!draggedDatasetId || evt.pointerId !== draggedDatasetPointerId) return;
  if(datasetPointerDragging && datasetDropTarget) reorderDraggedDataset();
  finishDatasetTabDrag(datasetPointerDragging);
}

function reorderDraggedDataset(){
  const fromIndex = openedDatasets.findIndex(dataset=>dataset.id === draggedDatasetId);
  if(fromIndex < 0) return;

  let insertionIndex = openedDatasets.length;
  if(datasetDropTarget){
    const targetIndex = openedDatasets.findIndex(dataset=>dataset.id === datasetDropTarget);
    if(targetIndex >= 0) insertionIndex = targetIndex + (datasetDropAfter ? 1 : 0);
  }

  if(fromIndex < insertionIndex) insertionIndex--;
  insertionIndex = Math.max(0, Math.min(insertionIndex, openedDatasets.length - 1));
  const movedDatasetId = draggedDatasetId;

  if(insertionIndex !== fromIndex){
    const [movedDataset] = openedDatasets.splice(fromIndex, 1);
    openedDatasets.splice(insertionIndex, 0, movedDataset);
    renderOpenedDatasets();
    renderDatasetTabs(movedDatasetId);
  }
}

function createDatasetDragGhost(){
  const bounds = draggedDatasetSource.getBoundingClientRect();
  datasetDragGhost = draggedDatasetSource.cloneNode(true);
  datasetDragGhost.classList.remove("dragging", "drop-before", "drop-after");
  datasetDragGhost.classList.add("dataset-tab-drag-ghost");
  datasetDragGhost.removeAttribute("data-open-dataset");
  datasetDragGhost.removeAttribute("draggable");
  datasetDragGhost.setAttribute("aria-hidden", "true");
  datasetDragGhost.tabIndex = -1;
  datasetDragGhost.style.width = `${bounds.width}px`;
  datasetDragGhost.querySelector("[data-close-dataset]")?.removeAttribute("data-close-dataset");
  document.body.appendChild(datasetDragGhost);
}

function moveDatasetDragGhost(clientX, clientY){
  if(!datasetDragGhost) return;
  const width = datasetDragGhost.offsetWidth;
  const height = datasetDragGhost.offsetHeight;
  datasetDragGhost.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, clientX + 14))}px`;
  datasetDragGhost.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, clientY + 14))}px`;
}

function clearDatasetDropMarker(scope = document){
  scope.querySelectorAll(".dataset-tab.drop-before, .dataset-tab.drop-after").forEach(tab=>{
    tab.classList.remove("drop-before", "drop-after");
  });
}

function finishDatasetTabDrag(suppressClick = datasetPointerDragging){
  if(!draggedDatasetId) return;
  if(suppressClick) suppressDatasetTabClickUntil = Date.now() + 250;
  draggedDatasetSource?.classList.remove("dragging");
  datasetDragGhost?.remove();
  document.body.classList.remove("dragging-dataset-tab");
  clearDatasetDropMarker();
  draggedDatasetId = null;
  draggedDatasetSource = null;
  draggedDatasetShell = null;
  draggedDatasetPointerId = null;
  draggedDatasetStart = null;
  datasetDragGhost = null;
  datasetPointerDragging = false;
  datasetDropTarget = null;
  datasetDropAfter = false;
}

function buildDatasetTabsMarkup(){
  if(!openedDatasets.length){
    return `<div class="dataset-tabs-empty">Загрузите JSON или выберите демо-набор.</div>`;
  }
  return openedDatasets.map(dataset=>{
    const active = dataset.id === activeDatasetId ? " active" : "";
    const issueCount = datasetIssueCount(dataset);
    const issueClass = issueCount ? " has-issues" : "";
    return `
      <button class="dataset-tab${active}${issueClass}" data-open-dataset="${escapeAttr(dataset.id)}">
        <span class="dataset-tab-state"></span>
        <span class="dataset-tab-content">
          <span class="dataset-tab-name">${escapeHTML(dataset.name)}</span>
          <span class="dataset-tab-meta">${datasetSummary(dataset)}</span>
        </span>
        <span class="dataset-tab-close" data-close-dataset="${escapeAttr(dataset.id)}">×</span>
      </button>
    `;
  }).join("");
}

function datasetListItem(dataset, mode){
  const actionAttr = mode === "recent" ? `data-recent-dataset="${escapeAttr(dataset.id)}"` : `data-open-dataset="${escapeAttr(dataset.id)}"`;
  const actionText = mode === "recent" ? "Открыть" : "Перейти";
  const close = mode === "open" ? `<button class="dataset-remove" data-close-dataset="${escapeAttr(dataset.id)}">×</button>` : "";
  const issueCount = datasetIssueCount(dataset);
  const issueClass = issueCount ? " has-issues" : "";
  return `
    <article class="dataset-item${dataset.id === activeDatasetId ? " active" : ""}${issueClass}">
      <span class="dataset-item-state"></span>
      <div class="dataset-item-main">
        <div class="dataset-item-topline">
          <div class="dataset-item-name">${escapeHTML(dataset.name)}</div>
          <div class="dataset-item-source">${sourceLabel(dataset.source)}</div>
        </div>
        <div class="dataset-item-meta">${datasetSummary(dataset)}</div>
      </div>
      <button class="dataset-action" ${actionAttr}>${actionText}</button>
      ${close}
    </article>
  `;
}

function datasetSummary(dataset){
  const data = dataset.data || {};
  const nodes = Array.isArray(data.nodes) ? data.nodes.length : 0;
  const links = Array.isArray(data.links) ? data.links.length : 0;
  const issues = datasetIssueCount(dataset);
  return `${nodes} узлов · ${links} связей${issues ? ` · ${issues} ошибок` : ""}`;
}

function datasetIssueCount(dataset){
  return getDatasetIssues(dataset).length;
}

function getDatasetIssues(dataset){
  if(!Array.isArray(dataset.issues)){
    dataset.issues = validateDataset(dataset.data || {});
  }
  return dataset.issues;
}

function sourceLabel(source){
  const labels = {
    demo: "Демо",
    file: "Файл",
    history: "История",
    integration: "Интеграция",
    profiler: "Профайлер",
    monitoring: "Мониторинг",
    documentation: "Документация",
  };
  return labels[source] || "JSON";
}

function saveRecentDataset(dataset){
  try{
    const record = {
      id: createDatasetId("recent"),
      name: dataset.name,
      source: dataset.source,
      openedAt: Date.now(),
      data: dataset.data,
    };
    const serialized = JSON.stringify(record);
    if(serialized.length > MAX_STORED_DATASET_CHARS) return;

    const recent = getRecentDatasets()
      .filter(item=>item.name !== record.name || item.source !== record.source)
      .slice(0, MAX_RECENT_DATASETS - 1);
    const records = [record, ...recent];
    while(records.length){
      try{
        localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(records));
        return;
      }catch(err){
        records.pop();
      }
    }
  }catch(err){
    // localStorage может быть недоступен или переполнен; активная рабочая область продолжает работать
  }
}

function getRecentDatasets(){
  try{
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.recent) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(item=>item && isDatasetDocument(item.data))
      : [];
  }catch(err){
    return [];
  }
}

function createDatasetId(prefix = "dataset"){
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHTML(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value){
  return escapeHTML(value).replace(/`/g, "&#096;");
}

function openDatasetFromIntegration(data, options = {}){
  if(!isDatasetDocument(data)){
    throw new TypeError('NETRA.topology.openDataset: expected an object with "nodes" and "links" arrays');
  }
  if(!options || typeof options !== "object") options = {};

  const documentMeta = data.meta && typeof data.meta === "object" ? data.meta : {};
  const id = options.id || data.datasetId || createDatasetId("external");
  const name = options.name || data.name || documentMeta.name || String(id);
  const source = options.source || data.source || "integration";
  const datasetId = openDataset(data, name, {
    id,
    source,
    replace:true,
    remember:options.remember === true,
    activate:options.activate !== false,
  });

  if(options.show !== false && options.activate !== false) setView("viz");
  return datasetId;
}

const netraTopologyApi = Object.freeze({
  apiVersion:"1.0",
  schemaVersion:"1.0",
  openDataset:openDatasetFromIntegration,
  validateDataset:data=>[...validateDataset(data)],
  activateDataset:(id, options = {})=>{
    const dataset = openedDatasets.find(item=>item.id === String(id));
    if(!dataset) return false;
    activateDataset(dataset.id);
    if(options.show !== false) setView("viz");
    return true;
  },
  closeDataset:id=>{
    const datasetId = String(id);
    if(!openedDatasets.some(item=>item.id === datasetId)) return false;
    closeDataset(datasetId);
    return true;
  },
  getOpenDatasets:()=>openedDatasets.map(dataset=>({
    id:dataset.id,
    name:dataset.name,
    source:dataset.source,
    nodes:Array.isArray(dataset.data.nodes) ? dataset.data.nodes.length : 0,
    links:Array.isArray(dataset.data.links) ? dataset.data.links.length : 0,
    issues:getDatasetIssues(dataset).length,
    active:dataset.id === activeDatasetId,
  })),
});
const netraNamespace = window.NETRA && typeof window.NETRA === "object" ? window.NETRA : {};
netraNamespace.topology = netraTopologyApi;
window.NETRA = netraNamespace;
document.documentElement.dataset.netraApiVersion = netraTopologyApi.apiVersion;

// Отрисовываем списки датасетов
renderDatasetLists();

// показываем заглушки в статистике при первом запуске
if (typeof clearStatsDashboard === 'function') {
  clearStatsDashboard();
}
