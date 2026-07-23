/* ВАЛИДАЦИЯ */
function validateDataset(data){
  const issues = [];
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const links = Array.isArray(data.links) ? data.links : [];

  const idSeen = {};
  nodes.forEach((n,i)=>{
    if(n.id===undefined || n.id===null || n.id==="") issues.push(`Узел #${i}: отсутствует поле "id"`);
    else idSeen[n.id] = (idSeen[n.id]||0) + 1;
    if(!n.label) issues.push(`Узел ${n.id ?? '#'+i}: отсутствует поле "label"`);
    if(n.status !== "alive" && n.status !== "dead") issues.push(`Узел ${n.id ?? '#'+i}: неизвестный статус "${n.status}"`);
  });
  Object.entries(idSeen).forEach(([id,count])=>{
    if(count>1) issues.push(`Дублирующийся id узла "${id}" встречается ${count} раза`);
  });

  const nodeIds = new Set(nodes.map(n=>n.id));
  links.forEach((l,i)=>{
    if(!nodeIds.has(l.source)) issues.push(`Связь #${i}: источник "${l.source}" не найден среди узлов — соединение оборвано`);
    if(!nodeIds.has(l.target)) issues.push(`Связь #${i}: назначение "${l.target}" не найдено среди узлов — соединение оборвано`);
    if(l.source===l.target && l.source!==undefined) issues.push(`Связь #${i}: узел "${l.source}" замкнут сам на себя`);
    if(typeof l.load!=="number" || isNaN(l.load)) issues.push(`Связь #${i} (${l.source}→${l.target}): нагрузка не является числом ("${l.load}")`);
    else if(l.load<0 || l.load>1) issues.push(`Связь #${i} (${l.source}→${l.target}): нагрузка вне диапазона 0–1 (${l.load})`);
  });

  const connected = new Set();
  links.forEach(l=>{ connected.add(l.source); connected.add(l.target); });
  nodes.forEach(n=>{
    if(n.id!==undefined && !connected.has(n.id)) issues.push(`Узел ${n.id} (${n.label||'без метки'}) изолирован — не имеет ни одной связи`);
  });

  return issues;
}

function renderIssuesBanner(issues){
  const banner = document.getElementById("issues-banner");
  const list = document.getElementById("issues-banner-list");
  const title = document.getElementById("issues-banner-title");
  if(!issues.length){ banner.classList.remove("show"); return; }
  title.textContent = `Обнаружено проблем: ${issues.length}`;
  list.innerHTML = issues.map(m=>`<li>${m}</li>`).join("");
  banner.classList.add("show");
}
document.getElementById("issues-banner-close").addEventListener("click", ()=>{
  document.getElementById("issues-banner").classList.remove("show");
});

function renderIssuesSection(issues){
  const section = document.getElementById("issues-section");
  const title = document.getElementById("issues-section-title");
  const body = document.getElementById("issues-section-body");
  if(!issues.length){
    section.classList.add("empty");
    title.textContent = "Проверка целостности данных";
    body.innerHTML = currentData ? "Ошибок не обнаружено — набор данных консистентен." : "Загрузите набор, чтобы увидеть результат проверки.";
    return;
  }
  section.classList.remove("empty");
  title.textContent = `Проверка целостности данных — найдено ${issues.length}`;
  body.innerHTML = `<ul>${issues.map(m=>`<li>${m}</li>`).join("")}</ul>`;
}
