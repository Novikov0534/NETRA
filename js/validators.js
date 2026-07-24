/* ВАЛИДАЦИЯ */
function isDatasetDocument(data){
  return Boolean(
    data
    && typeof data === "object"
    && !Array.isArray(data)
    && Array.isArray(data.nodes)
    && Array.isArray(data.links)
  );
}

function validateDataset(data){
  const issues = [];
  if(!data || typeof data !== "object" || Array.isArray(data)){
    return ['Корневое значение JSON должно быть объектом с массивами "nodes" и "links"'];
  }
  if(!Array.isArray(data.nodes)) issues.push('Поле "nodes" должно быть массивом');
  if(!Array.isArray(data.links)) issues.push('Поле "links" должно быть массивом');

  const nodes = Array.isArray(data && data.nodes) ? data.nodes : [];
  const links = Array.isArray(data && data.links) ? data.links : [];

  const idSeen = new Map();
  nodes.forEach((node,i)=>{
    if(!node || typeof node !== "object"){
      issues.push(`Узел #${i}: ожидается объект с полями "id", "label" и "status"`);
      return;
    }
    const n = node;
    if(n.id===undefined || n.id===null || n.id==="") issues.push(`Узел #${i}: отсутствует поле "id"`);
    else{
      const normalizedId = String(n.id);
      idSeen.set(normalizedId, (idSeen.get(normalizedId) || 0) + 1);
      if(typeof n.id !== "string") issues.push(`Узел #${i}: поле "id" должно быть строкой`);
    }
    if(typeof n.label !== "string" || !n.label.trim()) issues.push(`Узел ${n.id ?? '#'+i}: поле "label" должно быть непустой строкой`);
    if(n.status !== "alive" && n.status !== "dead") issues.push(`Узел ${n.id ?? '#'+i}: неизвестный статус "${n.status}"`);
  });
  idSeen.forEach((count,id)=>{
    if(count>1) issues.push(`Дублирующийся id узла "${id}" встречается ${count} раза`);
  });

  const nodeIds = new Set(
    nodes
      .filter(n=>n && typeof n === "object")
      .filter(n=>n.id!==undefined && n.id!==null && n.id!=="")
      .map(n=>String(n.id))
  );
  links.forEach((link,i)=>{
    if(!link || typeof link !== "object"){
      issues.push(`Связь #${i}: ожидается объект с полями "source", "target" и "load"`);
      return;
    }
    const l = link;
    const hasSource = l.source!==undefined && l.source!==null && l.source!=="";
    const hasTarget = l.target!==undefined && l.target!==null && l.target!=="";
    if(!hasSource) issues.push(`Связь #${i}: отсутствует поле "source"`);
    else{
      if(typeof l.source !== "string") issues.push(`Связь #${i}: поле "source" должно быть строкой`);
      if(!nodeIds.has(String(l.source))) issues.push(`Связь #${i}: источник "${l.source}" не найден среди узлов — соединение оборвано`);
    }
    if(!hasTarget) issues.push(`Связь #${i}: отсутствует поле "target"`);
    else{
      if(typeof l.target !== "string") issues.push(`Связь #${i}: поле "target" должно быть строкой`);
      if(!nodeIds.has(String(l.target))) issues.push(`Связь #${i}: назначение "${l.target}" не найдено среди узлов — соединение оборвано`);
    }
    if(hasSource && hasTarget && String(l.source)===String(l.target)) issues.push(`Связь #${i}: узел "${l.source}" замкнут сам на себя`);
    if(typeof l.load!=="number" || isNaN(l.load)) issues.push(`Связь #${i} (${l.source}→${l.target}): нагрузка не является числом ("${l.load}")`);
    else if(l.load<0 || l.load>1) issues.push(`Связь #${i} (${l.source}→${l.target}): нагрузка вне диапазона 0–1 (${l.load})`);
  });

  const connected = new Set();
  links.forEach(l=>{
    if(!l || typeof l !== "object") return;
    if(l.source!==undefined && l.source!==null) connected.add(String(l.source));
    if(l.target!==undefined && l.target!==null) connected.add(String(l.target));
  });
  nodes.forEach(n=>{
    if(!n || typeof n !== "object") return;
    if(n.id!==undefined && n.id!==null && !connected.has(String(n.id))){
      issues.push(`Узел ${n.id} (${n.label||'без метки'}) изолирован — не имеет ни одной связи`);
    }
  });

  return issues;
}

function renderIssuesBanner(issues){
  const banner = document.getElementById("issues-banner");
  const list = document.getElementById("issues-banner-list");
  const title = document.getElementById("issues-banner-title");
  if(!issues.length){ banner.classList.remove("show"); return; }
  title.textContent = `Обнаружено проблем: ${issues.length}`;
  list.innerHTML = issues.map(m=>`<li>${escapeHTML(m)}</li>`).join("");
  banner.classList.add("show");
}
document.getElementById("issues-banner-close").addEventListener("click", ()=>{
  const previousViewState = typeof captureGraphViewState === "function"
    ? captureGraphViewState()
    : null;
  document.getElementById("issues-banner").classList.remove("show");
  requestAnimationFrame(()=>{
    if(typeof resizeGraphPreservingViewport === "function"){
      resizeGraphPreservingViewport(previousViewState);
    }
  });
});

function renderIssuesSection(issues){
  const section = document.getElementById("issues-section");
  const title = document.getElementById("issues-section-title");
  const body = document.getElementById("issues-section-body");
  if(!issues.length){
    section.classList.add("empty");
    title.textContent = "Проверка целостности данных";
    body.textContent = currentData ? "Ошибок не обнаружено — набор данных консистентен." : "Загрузите набор, чтобы увидеть результат проверки.";
    return;
  }
  section.classList.remove("empty");
  title.textContent = `Проверка целостности данных — найдено ${issues.length}`;
  body.innerHTML = `<ul>${issues.map(m=>`<li>${escapeHTML(m)}</li>`).join("")}</ul>`;
}
