/* ================= STATS ================= */
function renderStats(data){
  const total = data.nodes.length;
  const dead = data.nodes.filter(n=>n.status==="dead");
  const deadPct = total ? Math.round((dead.length/total)*1000)/10 : 0;
  const normalizedLoads = data.links.map(l=>{
    const load = typeof l.load==="number" && !isNaN(l.load) ? l.load : 0;
    return Math.max(0, Math.min(1, load));
  });
  const avgLoad = normalizedLoads.length ? Math.round((normalizedLoads.reduce((s,l)=>s+l,0)/normalizedLoads.length)*1000)/10 : 0;

  document.getElementById("kpi-nodes").textContent = total;
  document.getElementById("kpi-links").textContent = data.links.length;
  document.getElementById("kpi-dead").textContent = deadPct + "%";
  document.getElementById("kpi-dead-count").textContent = dead.length + " узлов";
  document.getElementById("kpi-load").textContent = avgLoad + "%";

  const body = document.getElementById("dead-table-body");
  if(dead.length===0){
    body.innerHTML = `<tr><td class="empty-row" colspan="3">Мёртвых узлов не обнаружено</td></tr>`;
  } else {
    body.innerHTML = dead.map(n=>`
      <tr><td>${n.id}</td><td>${n.label}</td><td>${statusChip(n.status)}</td></tr>
    `).join("");
  }
}
