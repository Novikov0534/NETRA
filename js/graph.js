/* Отрисовка графа */
function loadColor(load){
  const stops = [
    {t:0, c:[22,35,59]},
    {t:.5, c:[59,130,246]},
    {t:1, c:[147,197,253]},
  ];
  let a=stops[0], b=stops[1];
  if(load>.5){a=stops[1]; b=stops[2];}
  const localT = a.t===b.t?0:(load-a.t)/(b.t-a.t);
  const c = a.c.map((v,i)=>Math.round(v + (b.c[i]-v)*localT));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function buildElements(data){
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const links = Array.isArray(data.links) ? data.links : [];
  const elements = [];
  const seenIds = new Set();
  const dupCounter = {};

  nodes.forEach(n=>{
    let id = n.id;
    if(id===undefined || id===null || id==="") return;
    if(seenIds.has(id)){
      dupCounter[id] = (dupCounter[id]||1) + 1;
      id = `${id}__dup${dupCounter[id]}`;
    }
    seenIds.add(id);
    let status = n.status==="dead" ? "dead" : n.status==="alive" ? "alive" : "unknown";
    elements.push({group:"nodes", data:{id, label:n.label || String(id), status}});
  });

  const knownIds = new Set(elements.map(e=>e.data.id));
  const statusById = new Map(elements.map(e=>[e.data.id, e.data.status]));
  const ghosted = new Set();

  links.forEach((l,i)=>{
    const src = l.source, tgt = l.target;
    [src, tgt].forEach(refId=>{
      if(refId!==undefined && !knownIds.has(refId) && !ghosted.has(refId)){
        elements.push({group:"nodes", data:{id:refId, label:"⚠ "+refId, status:"missing"}});
        knownIds.add(refId);
        statusById.set(refId, "missing");
        ghosted.add(refId);
      }
    });
    const rawLoad = l.load;
    const validLoad = typeof rawLoad==="number" && !isNaN(rawLoad);
    const load = validLoad ? Math.max(0, Math.min(1, rawLoad)) : 0;
    const broken = !validLoad || rawLoad<0 || rawLoad>1 || ghosted.has(src) || ghosted.has(tgt) || src===tgt;
    const deadLink = statusById.get(src)==="dead" && statusById.get(tgt)==="dead";
    if(src!==undefined && tgt!==undefined){
      elements.push({group:"edges", data:{id:"e"+i, source:src, target:tgt, load, broken, deadLink}});
    }
  });

  return elements;
}

function renderGraph(data){
  document.getElementById("viz-dataset-name").textContent = currentName;
  document.getElementById("viz-node-count").textContent = (data.nodes||[]).length;
  document.getElementById("viz-edge-count").textContent = (data.links||[]).length;

  const elements = buildElements(data);

  if(cy){ cy.destroy(); }
  if(deadPulseRAF) cancelAnimationFrame(deadPulseRAF);

  cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    style: [
      { selector:"node", style:{
        "label":"data(label)",
        "color":"#94a3b8",
        "font-family":"var(--mono)",
        "font-size":10,
        "text-valign":"bottom",
        "text-margin-y":8,
        "background-color": ele => ele.data("status") === "dead" ? "#991b1b" : "#22c55e",
        "border-width": 2,
        "border-color": ele => ele.data("status") === "dead" ? "#ef4444" : "#14532d",
        "border-opacity": 1,
        "transition-property": "width, height, border-opacity, opacity",
        "transition-duration": "0.3s",
        "transition-timing-function": "ease-out",
      }},
      { selector:"node:selected", style:{ "border-color":"#3b82f6", "border-width":3 }},
      { selector:'node[status="unknown"]', style:{
        "background-color":"#64748b", "border-color":"#334155",
      }},
      { selector:'node[status="missing"]', style:{
        "background-color":"#0a0e17", "background-opacity":1,
        "border-color":"#ef4444", "border-style":"dashed", "border-width":3,
        "shape":"diamond", "color":"#fca5a5",
      }},
      { selector:"edge", style:{
        "width": ele=> 1 + ele.data("load")*5,
        "line-color": ele=> loadColor(ele.data("load")),
        "target-arrow-shape":"none",
        "curve-style":"bezier",
        "opacity":0,
        "transition-property":"opacity",
        "transition-duration":700,
      }},
      { selector:"edge[?deadLink]", style:{
        "line-color":"#ef4444", "width": ele=> Math.max(3, 2 + ele.data("load")*5),
      }},
      { selector:"edge[?broken]", style:{
        "line-color":"#ef4444", "line-style":"dashed", "width":2,
      }},
      { selector:"edge:selected", style:{ "line-color":"#93c5fd", "width": ele=> 3 + ele.data("load")*5 }},
    ],
    layout: { name:"cose", animate:true, animationDuration:700, nodeRepulsion: 90000, idealEdgeLength: 90, gravity: 0.35, fit:true, padding:40 },
    wheelSensitivity:.25,
  });

  cy.ready(()=>{
    cy.nodes().forEach(n=>{ n.style({width:34, height:34, opacity:1}); });
    cy.edges().style({opacity:1});
    startDeadPulse();
  });

  // При клике на узел вызываем функцию фокуса
  cy.on("tap", "node", (evt) => {
    focusNode(evt.target);
  });
  
    cy.on("tap", "edge", (evt) => {
    focusEdge(evt.target);
    });
  cy.on("tap", (evt)=>{ 
    if(evt.target===cy) { 
      closePanel(); 
      resetSearchHighlight(); 
    } 
  });
}

function startDeadPulse() {
  if (deadPulseRAF) cancelAnimationFrame(deadPulseRAF);

  let startTime = null;
  const duration = 1200;

  function tick(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = ((timestamp - startTime) % duration) / duration;
    const pulseFactor = Math.sin(progress * Math.PI);

    const size = 34 + (pulseFactor * 10);
    const borderWidth = 2 + (pulseFactor * 4);
    const borderOpacity = 0.6 + (pulseFactor * 0.4);

    cy.nodes('[status="dead"]').style({
      "width": size,
      "height": size,
      "border-width": borderWidth,
      "border-opacity": borderOpacity
    });

    deadPulseRAF = requestAnimationFrame(tick);
  }

  deadPulseRAF = requestAnimationFrame(tick);
}

/* Боковая панель */
const panel = document.getElementById("side-panel");
function statusChip(status){
  const map = {
    dead: {color:"var(--dead)", label:"Недоступен"},
    alive: {color:"var(--alive)", label:"Активен"},
    missing: {color:"var(--dead)", label:"Не найден в узлах"},
    unknown: {color:"#64748b", label:"Неизвестный статус"},
  };
  const s = map[status] || map.unknown;
  return `<span class="status-chip"><span class="d" style="background:${s.color}"></span>${s.label}</span>`;
}

function showNodePanel(node){
  const d = node.data();
  const neighbors = node.neighborhood('node').map(n=>n.data('label'));
  document.getElementById("panel-body").innerHTML = `
    <div class="panel-kind">Узел</div>
    <div class="panel-title">${d.label}</div>
    <div class="panel-field"><div class="k">ID</div><div class="v">${d.id}</div></div>
    <div class="panel-field"><div class="k">Статус</div><div class="v">${statusChip(d.status)}</div></div>
    <div class="panel-field"><div class="k">Связанные узлы (${neighbors.length})</div><div class="v">${neighbors.join(", ") || "—"}</div></div>
  `;
  panel.classList.add("open");
}

function showEdgePanel(edge){
  const d = edge.data();
  const src = cy.getElementById(d.source).data("label");
  const tgt = cy.getElementById(d.target).data("label");
  const state = d.deadLink ? "Связь между недоступными узлами" : d.broken ? "Проблемная связь" : "Рабочая связь";
  document.getElementById("panel-body").innerHTML = `
    <div class="panel-kind">Связь</div>
    <div class="panel-title">${src} → ${tgt}</div>
    <div class="panel-field"><div class="k">Источник</div><div class="v">${src}</div></div>
    <div class="panel-field"><div class="k">Назначение</div><div class="v">${tgt}</div></div>
    <div class="panel-field"><div class="k">Состояние</div><div class="v">${state}</div></div>
    <div class="panel-field"><div class="k">Нагрузка</div><div class="v">${Math.round(d.load*100)}%</div></div>
  `;
  panel.classList.add("open");
}

function closePanel(){ 
  panel.classList.remove("open");
  resetSearchHighlight();
  
  if (cy) {
    cy.stop(true, false); 
    cy.animate({
      fit: { eles: cy.elements(), padding: 40 },
      duration: 400,
      easing: 'ease-in-out-cubic'
    });
  }
  
  if (typeof applyFilters === 'function') {
    setTimeout(() => applyFilters(), 50);
  }
}
document.getElementById("panel-close").addEventListener("click", closePanel);

/* Универсальный фокус и поиск */
const searchInput = document.getElementById('graph-search-input');
const searchResults = document.getElementById('graph-search-results');
const searchClear = document.getElementById('graph-search-clear');

let searchMatches = [];

function resetSearchHighlight() {
  if (!cy) return;
  
  cy.elements().style({
    'opacity': 1,
    'z-index': ele => ele.isNode() ? 1 : 0
  });
  
  cy.nodes().style({
    'border-color': ele => ele.data('status') === 'dead' ? '#ef4444' : '#14532d',
    'border-width': 2
  });

    cy.edges().style({
    'width': '',
    'line-color': ''
  });
  
}

// узел
function focusNode(node) {
  // Сбрасываем предыдущие состояния
  resetSearchHighlight();

  // показываем узел и его связи, даже если они были скрыты фильтрами
  node.show();
  node.connectedEdges().show();

  //  Затемняем всё, кроме целевого узла и его соседей
  cy.elements().style('opacity', 0.15);
  node.style('opacity', 1);
  node.neighborhood().style('opacity', 1);

  node.style({
    'border-color': '#fbbf24',
    'border-width': 4
  });

  // Плавный зум и центрирование
  cy.stop(true, false);
  cy.animate({
    center: { eles: node },
    zoom: 1.5,
    duration: 600,
    easing: 'ease-in-out-cubic'
  });

  // Открываем боковую панель с деталями
  showNodePanel(node);
}

// связь
function focusEdge(edge) {

  resetSearchHighlight();

  //показываем связь и её узлы, даже если они были скрыты фильтрами
  edge.show();
  edge.source().show();
  edge.target().show();

  // аналогично узлам
  cy.elements().style('opacity', 0.15);
  edge.style('opacity', 1);
  edge.source().style('opacity', 1);
  edge.target().style('opacity', 1);

  edge.style({
    'line-color': '#fbbf24',
    'width': 4
  });


  cy.stop(true, false);
  cy.animate({
    center: { eles: edge }, // Центрируем камеру на середине связи
    zoom: 1.5,              
    duration: 600,
    easing: 'ease-in-out-cubic'
  });


  showEdgePanel(edge);
}

function performSearch(query) {
  if (!cy || !query) {
    searchResults.classList.remove('open');
    return;
  }

  const q = query.toLowerCase().trim();
  if (q.length < 1) {
    searchResults.classList.remove('open');
    return;
  }

  searchMatches = [];
  cy.nodes().forEach(node => {
    const id = String(node.data('id')).toLowerCase();
    const label = String(node.data('label')).toLowerCase();
    
    // Ищем совпадения в любом месте (как и раньше)
    if (id.includes(q) || label.includes(q)) {
      searchMatches.push({ 
        node, 
        id: node.data('id'), 
        label: node.data('label'),
        idLower: id,
        labelLower: label
      });
    }
  });

  // сортировка
  searchMatches.sort((a, b) => {
    const aLabelStarts = a.labelLower.startsWith(q);
    const bLabelStarts = b.labelLower.startsWith(q);
    const aIdStarts = a.idLower.startsWith(q);
    const bIdStarts = b.idLower.startsWith(q);
    
    const aLabelExact = a.labelLower === q;
    const bLabelExact = b.labelLower === q;
    const aIdExact = a.idLower === q;
    const bIdExact = b.idLower === q;

    // Точное совпадение по имени - самый высокий приоритет
    if (aLabelExact && !bLabelExact) return -1;
    if (!aLabelExact && bLabelExact) return 1;

    // Имя начинается с введённых букв
    if (aLabelStarts && !bLabelStarts) return -1;
    if (!aLabelStarts && bLabelStarts) return 1;

    //Точное совпадение по ID
    if (aIdExact && !bIdExact) return -1;
    if (!aIdExact && bIdExact) return 1;

    // ID начинается с введённых букв
    if (aIdStarts && !bIdStarts) return -1;
    if (!aIdStarts && bIdStarts) return 1;

    //Если всё остальное равно, сортируем по алфавиту
    return a.label.localeCompare(b.label);
  }).slice(0, 10); // Оставляем только топ 10

  if (searchMatches.length === 0) {
    searchResults.innerHTML = `<div class="graph-search-empty">Ничего не найдено</div>`;
  } else {
    searchResults.innerHTML = searchMatches.map((match, index) => `
      <div class="graph-search-item" data-index="${index}">
        <div class="graph-search-item-label">${match.label}</div>
        <div class="graph-search-item-id">${match.id}</div>
      </div>
    `).join('');

    searchResults.querySelectorAll('.graph-search-item').forEach(el => {
      el.addEventListener('click', () => {
        focusNode(searchMatches[parseInt(el.dataset.index, 10)].node);
        closeSearch();
      });
    });
  }

  searchResults.classList.add('open');
}

function selectNode(index) {
  if (index < 0 || index >= searchMatches.length) return;
  
  const targetNode = searchMatches[index].node;


  focusNode(targetNode);
  

  closeSearch();
}

function closeSearch() {
  searchResults.classList.remove('open');
  searchInput.value = '';
  searchClear.classList.remove('visible');
  searchMatches = [];
}

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value;
    searchClear.classList.toggle('visible', query.length > 0);
    performSearch(query);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      resetSearchHighlight();
      searchInput.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchMatches.length > 0) {
        selectNode(0);
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.graph-search')) {
      searchResults.classList.remove('open');
    }
  });
}

if (searchClear) {
  searchClear.addEventListener('click', () => {
    closeSearch();
    resetSearchHighlight();
    searchInput.focus();
  });
}

/* ПАНЕЛЬ ИНСТРУМЕНТОВ */
document.getElementById("btn-reset-view").addEventListener("click", ()=>{ if(cy){ cy.fit(undefined, 40); } });
document.getElementById("btn-export-png").addEventListener("click", ()=>{
  if(!cy) return;
  const png = cy.png({full:true, scale:2, bg:"#0a0e17"});
  const a = document.createElement("a");
  a.href = png; a.download = `netra-${currentName.replace(/\s+/g,'_')}.png`;
  a.click();
});