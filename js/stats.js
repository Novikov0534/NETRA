/* ================= STATS ================= */
function renderStats(data){
  const total = data.nodes.length;
  const dead = data.nodes.filter(n=>n.status==="dead");
  const deadPct = total ? Math.round((dead.length/total)*1000)/10 : 0;
  const avgLoad = data.links.length ? Math.round((data.links.reduce((s,l)=>s+l.load,0)/data.links.length)*1000)/10 : 0;

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
