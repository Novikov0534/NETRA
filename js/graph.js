/* ================= GRAPH RENDERING ================= */
function loadColor(load){
  // 0 -> deep navy, 1 -> bright blue/white
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
    if(id===undefined || id===null || id==="") return; // unusable, already flagged
    if(seenIds.has(id)){
      dupCounter[id] = (dupCounter[id]||1) + 1;
      id = `${id}__dup${dupCounter[id]}`;
    }
    seenIds.add(id);
    let status = n.status==="dead" ? "dead" : n.status==="alive" ? "alive" : "unknown";
    elements.push({group:"nodes", data:{id, label:n.label || String(id), status}});
  });

  const knownIds = new Set(elements.map(e=>e.data.id));
  const ghosted = new Set();

  links.forEach((l,i)=>{
    const src = l.source, tgt = l.target;
    [src, tgt].forEach(refId=>{
      if(refId!==undefined && !knownIds.has(refId) && !ghosted.has(refId)){
        elements.push({group:"nodes", data:{id:refId, label:"⚠ "+refId, status:"missing"}});
        knownIds.add(refId);
        ghosted.add(refId);
      }
    });
    const rawLoad = l.load;
    const validLoad = typeof rawLoad==="number" && !isNaN(rawLoad);
    const load = validLoad ? Math.max(0, Math.min(1, rawLoad)) : 0;
    const broken = !validLoad || rawLoad<0 || rawLoad>1 || ghosted.has(src) || ghosted.has(tgt) || src===tgt;
    if(src!==undefined && tgt!==undefined){
      elements.push({group:"edges", data:{id:"e"+i, source:src, target:tgt, load, broken}});
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
        "width": 0, "height": 0,
        "background-color": ele=> ele.data("status")==="dead" ? "#ef4444" : "#22c55e",
        "border-width":2,
        "border-color": ele=> ele.data("status")==="dead" ? "#7f1d1d" : "#14532d",
        "transition-property":"width,height,border-opacity,opacity",
        "transition-duration":600,
        "transition-timing-function":"ease-out",
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
      { selector:"edge[?broken]", style:{
        "line-color":"#ef4444", "line-style":"dashed", "width":2,
      }},
      { selector:"edge:selected", style:{ "line-color":"#93c5fd", "width": ele=> 3 + ele.data("load")*5 }},
    ],
    layout: { name:"cose", animate:true, animationDuration:700, nodeRepulsion: 9000, idealEdgeLength: 90, gravity: 0.35, fit:true, padding:40 },
    wheelSensitivity:.25,
  });

  cy.ready(()=>{
    cy.nodes().forEach(n=>{ n.style({width:34, height:34, opacity:1}); });
    cy.edges().style({opacity:1});
    startDeadPulse();
  });

  cy.on("tap", "node", (evt)=> showNodePanel(evt.target));
  cy.on("tap", "edge", (evt)=> showEdgePanel(evt.target));
  cy.on("tap", (evt)=>{ if(evt.target===cy) closePanel(); });
}

function startDeadPulse(){
  let t = 0;
  function tick(){
    t += 0.05;
    const pulse = 0.4 + Math.abs(Math.sin(t)) * 0.6;
    cy.nodes('[status="dead"]').style({ "border-opacity": pulse });
    deadPulseRAF = requestAnimationFrame(tick);
  }
  tick();
}

/* ================= SIDE PANEL ================= */
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
  document.getElementById("panel-body").innerHTML = `
    <div class="panel-kind">Связь</div>
    <div class="panel-title">${src} → ${tgt}</div>
    <div class="panel-field"><div class="k">Источник</div><div class="v">${src}</div></div>
    <div class="panel-field"><div class="k">Назначение</div><div class="v">${tgt}</div></div>
    <div class="panel-field"><div class="k">Нагрузка</div><div class="v">${Math.round(d.load*100)}%</div></div>
  `;
  panel.classList.add("open");
}
function closePanel(){ panel.classList.remove("open"); }
document.getElementById("panel-close").addEventListener("click", closePanel);

/* ================= TOOLBAR ================= */
document.getElementById("btn-reset-view").addEventListener("click", ()=>{ if(cy){ cy.fit(undefined, 40); } });
document.getElementById("btn-export-png").addEventListener("click", ()=>{
  if(!cy) return;
  const png = cy.png({full:true, scale:2, bg:"#0a0e17"});
  const a = document.createElement("a");
  a.href = png; a.download = `netra-${currentName.replace(/\s+/g,'_')}.png`;
  a.click();
});
