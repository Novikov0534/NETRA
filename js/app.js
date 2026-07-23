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

let currentData = null;
let currentName = "—";
let currentIssues = [];
let cy = null;
let deadPulseRAF = null;
let openedDatasets = [];
let activeDatasetId = null;

const views = {
  home: document.getElementById("view-home"),
  viz: document.getElementById("view-viz"),
  stats: document.getElementById("view-stats"),
};
const fileInput = document.getElementById("file-input");
const openDatasetList = document.getElementById("open-dataset-list");
const recentDatasetList = document.getElementById("recent-dataset-list");
const datasetTabs = document.getElementById("dataset-tabs");
const statsDatasetTabs = document.getElementById("stats-dataset-tabs");

/* ПЕРВЫЙ ВИЗИТ */
const hasVisited = localStorage.getItem(STORAGE_KEYS.visited) === "1";
document.body.classList.toggle("returning-user", hasVisited);
localStorage.setItem(STORAGE_KEYS.visited, "1");

/* Переключение вкладок */
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>setView(btn.dataset.view));
});

function setView(name){
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===name));
  Object.entries(views).forEach(([k,el])=>el.classList.toggle("active", k===name));
  window.scrollTo(0, 0);
  if(name==="viz" && cy){ setTimeout(()=>cy.resize(), 60); }
}

document.getElementById("scroll-demos").addEventListener("click", ()=>{
  document.getElementById("demos-section").scrollIntoView({behavior:"smooth"});
});

document.getElementById("quick-upload-trigger").addEventListener("click", ()=>{
  fileInput.click();
});

document.getElementById("clear-recent").addEventListener("click", ()=>{
  localStorage.removeItem(STORAGE_KEYS.recent);
  renderDatasetLists();
});

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
      alert("Не удалось загрузить демо-набор. Загрузите JSON вручную или запустите проект через start.bat.");
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

fileInput.addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const parsed = JSON.parse(ev.target.result);
      if(!Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) throw new Error("bad format");
      openDataset(parsed, file.name.replace(/\.json$/i,""), { source:"file" });
      setView("viz");
    }catch(err){
      alert("Не удалось разобрать файл. Ожидается формат { nodes:[...], links:[...] }");
    }finally{
      fileInput.value = "";
    }
  };
  reader.readAsText(file);
});

openDatasetList.addEventListener("click", handleDatasetListClick);
recentDatasetList.addEventListener("click", handleDatasetListClick);
datasetTabs.addEventListener("click", handleDatasetListClick);
statsDatasetTabs.addEventListener("click", handleDatasetListClick);

function handleDatasetListClick(evt) {
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

function openDataset(data, name, options = {}) {
  const source = options.source || "file";

  //  ищем уже открытый датасет с таким же именем и источником.
  const existing = openedDatasets.find(d => d.name === name && d.source === source);

  if (existing) {
    activateDataset(existing.id);
    return; // Прерываем выполнение, дубликат не создается, просто переключаемся н него
  }

  // Если это ручная загрузка файла  с тем же именем, мы удаляем старую версию, чтобы показать свежие данные 

  if (source === "file") {
    const oldFileIndex = openedDatasets.findIndex(d => d.name === name);
    if (oldFileIndex !== -1) {
      openedDatasets.splice(oldFileIndex, 1);
    }
  }

  const id = options.id || createDatasetId();
  const dataset = {
    id,
    name: name || "Без названия",
    source: source,
    openedAt: Date.now(),
    data,
  };

  openedDatasets.push(dataset);
  saveRecentDataset(dataset);
  activateDataset(id);
}

function activateDataset(id) {
  // Если этот датасет уже активен - ничего не делаем
  if (activeDatasetId === id) {
    return; 
  }

  const dataset = openedDatasets.find(item => item.id === id);
  if (!dataset) return;

  activeDatasetId = id;
  currentData = dataset.data;
  currentName = dataset.name;
  currentIssues = validateDataset(dataset.data);

  document.getElementById("nav-status-text").textContent = currentName.toUpperCase() + (currentIssues.length ? " · ОШИБКИ" : "");
  
  // Сбрасываем фильтры при переключении на новый граф
  if (typeof resetFilters === 'function') {
    resetFilters();
  }
  
  // Перерисовка происходит  если мы переключились на другой  датасет (не пофиксить так как у нас cy один)
  renderGraph(dataset.data);
  renderStats(dataset.data);
  renderIssuesBanner(currentIssues);
  renderIssuesSection(currentIssues);
  renderDatasetLists();
}

function closeDataset(id){
  const index = openedDatasets.findIndex(item=>item.id===id);
  if(index < 0) return;

  openedDatasets.splice(index, 1);
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
  
  // Очищаем только заголовок и счетчики визуализации
  document.getElementById("nav-status-text").textContent = "СИСТЕМА АКТИВНА";
  document.getElementById("viz-dataset-name").textContent = "—";
  document.getElementById("viz-node-count").textContent = "0";
  document.getElementById("viz-edge-count").textContent = "0";
  
  // Эта функция очистит KPI, таблицу и поставит SVG-заглушки
  if (typeof clearStatsDashboard === 'function') {
    clearStatsDashboard();
  }

  if(cy){ cy.destroy(); cy = null; }
  if(deadPulseRAF) cancelAnimationFrame(deadPulseRAF);
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

function renderDatasetTabs(){
  const markup = buildDatasetTabsMarkup();
  datasetTabs.innerHTML = markup;
  statsDatasetTabs.innerHTML = markup;
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
  return validateDataset(dataset.data || {}).length;
}

function sourceLabel(source){
  const labels = {
    demo: "Демо",
    file: "Файл",
    history: "История",
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
      .filter(item=>item.name !== record.name)
      .slice(0, MAX_RECENT_DATASETS - 1);
    localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify([record, ...recent]));
  }catch(err){
    // localStorage может быть недоступен или переполнен; активная рабочая область продолжает работать
  }
}

function getRecentDatasets(){
  try{
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.recent) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item=>item && item.data) : [];
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

// Отрисовываем списки датасетов
renderDatasetLists();

// показываем заглушки в статистике при первом запуске
if (typeof clearStatsDashboard === 'function') {
  clearStatsDashboard();
}
