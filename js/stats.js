// stats

function normalizeStatsId(value) {
  return value===undefined || value===null || value==="" ? null : String(value);
}

// очистка дашборда при отсутствии данных
function clearStatsDashboard() {
  // Сброс KPI
  const kpiNodes = document.getElementById("kpi-nodes");
  const kpiLinks = document.getElementById("kpi-links");
  const kpiDead = document.getElementById("kpi-dead");
  const kpiDeadCount = document.getElementById("kpi-dead-count");
  const kpiLoad = document.getElementById("kpi-load");
  
  if (kpiNodes) kpiNodes.textContent = "—";
  if (kpiLinks) kpiLinks.textContent = "—";
  if (kpiDead) kpiDead.textContent = "—";
  if (kpiDeadCount) kpiDeadCount.textContent = "нет данных";
  if (kpiLoad) kpiLoad.textContent = "—";

  // Сброс таблицы
  const body = document.getElementById("dead-table-body");
  if (body) {
    body.innerHTML = `<tr><td class="empty-row" colspan="3">Нет данных — загрузите набор на вкладке «Главная»</td></tr>`;
  }

  // Заглушка для визуализаций
  const emptyStateHTML = `
    <div class="stats-empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
      <div class="stats-empty-title">Нет активных данных</div>
      <div class="stats-empty-subtitle">Загрузите JSON или выберите демо-набор</div>
    </div>
  `;

  const containers = [
    "stats-status-donut",
    "stats-load-histogram", 
    "stats-top-links",
    "stats-top-nodes",
    "stats-issues-summary"
  ];
  
  containers.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // Прямая вставка заглушки без дополнительной обертки
      el.innerHTML = emptyStateHTML;
    }
  });
}

function renderStats(data) {
  const nodes = Array.isArray(data && data.nodes)
    ? data.nodes.filter(item=>item && typeof item === "object")
    : [];
  const links = Array.isArray(data && data.links)
    ? data.links.filter(item=>item && typeof item === "object")
    : [];
  if (nodes.length === 0 && links.length === 0) {
    clearStatsDashboard();
    return;
  }

  const safeData = { ...data, nodes, links };
  const total = nodes.length;
  const dead = nodes.filter(n => n.status === "dead");
  const deadPct = total ? Math.round((dead.length / total) * 1000) / 10 : 0;
  const normalizedLoads = links.map(l => {
    const load = typeof l.load === "number" && !isNaN(l.load) ? l.load : 0;
    return Math.max(0, Math.min(1, load));
  });
  const avgLoad = normalizedLoads.length ? Math.round((normalizedLoads.reduce((s, l) => s + l, 0) / normalizedLoads.length) * 1000) / 10 : 0;

  // KPI
  document.getElementById("kpi-nodes").textContent = total;
  document.getElementById("kpi-links").textContent = links.length;
  document.getElementById("kpi-dead").textContent = deadPct + "%";
  document.getElementById("kpi-dead-count").textContent = dead.length + " узлов";
  document.getElementById("kpi-load").textContent = avgLoad + "%";

  // Таблица мёртвых узлов
  const body = document.getElementById("dead-table-body");
  if (dead.length === 0) {
    body.innerHTML = `<tr><td class="empty-row" colspan="3">Мёртвых узлов не обнаружено</td></tr>`;
  } else {
    body.innerHTML = dead.map(n => `
      <tr><td>${escapeHTML(n.id)}</td><td>${escapeHTML(n.label || "—")}</td><td>${statusChip(n.status)}</td></tr>
    `).join("");
  }

  // Визуализации
  renderStatusDonut(nodes, links);
  renderLoadHistogram(links);
  renderTopLinks(safeData);
  renderTopNodes(safeData);
  renderIssuesSummary(safeData);
}

// Круговая диаграмма статусов (с учетом призрачных узлов из связей)
function renderStatusDonut(nodes, links) {
  const container = document.getElementById("stats-status-donut");
  if (!container) return;

  const nodeIds = new Set(nodes.map(n => normalizeStatsId(n.id)).filter(Boolean));
  
  // Считаем узлы, на которые есть ссылки, но которых нет в списке nodes
  const ghostNodes = new Set();
  if (links) {
    links.forEach(l => {
      const sourceId = normalizeStatsId(l.source);
      const targetId = normalizeStatsId(l.target);
      if (sourceId && !nodeIds.has(sourceId)) ghostNodes.add(sourceId);
      if (targetId && !nodeIds.has(targetId)) ghostNodes.add(targetId);
    });
  }

  const counts = {
    alive: nodes.filter(n => n.status === "alive").length,
    dead: nodes.filter(n => n.status === "dead").length,
    unknown: nodes.filter(n => !["alive", "dead", "missing"].includes(n.status)).length,
    missing: nodes.filter(n => n.status === "missing").length + ghostNodes.size
  };
  
  const total = nodes.length + ghostNodes.size || 1;

  const segments = [
    { label: "Активны", count: counts.alive, color: "#22c55e" },
    { label: "Недоступны", count: counts.dead, color: "#ef4444" },
    { label: "Неизвестны", count: counts.unknown, color: "#64748b" },
    { label: "Не найдены", count: counts.missing, color: "#fbbf24" }
  ];

  let svg = `<svg viewBox="0 0 120 120" class="donut-svg">`;
  let offset = 0;
  const circumference = 2 * Math.PI * 50;

  segments.forEach(seg => {
    const percent = seg.count / total;
    const dash = percent * circumference;
    const gap = circumference - dash;
    svg += `<circle cx="60" cy="60" r="50" fill="none" stroke="${seg.color}" 
            stroke-width="20" stroke-dasharray="${dash} ${gap}" 
            stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)" 
            class="donut-segment"/>`;
    offset += dash;
  });

  svg += `<text x="60" y="55" text-anchor="middle" class="donut-center-value">${total}</text>`;
  svg += `<text x="60" y="72" text-anchor="middle" class="donut-center-label">всего</text>`;
  svg += `</svg>`;

  const legend = segments.map(seg => `
    <div class="donut-legend-item">
      <span class="donut-legend-color" style="background:${seg.color}"></span>
      <span class="donut-legend-label">${seg.label}</span>
      <span class="donut-legend-value">${seg.count} (${Math.round(seg.count / total * 100)}%)</span>
    </div>
  `).join("");

  container.innerHTML = svg + `<div class="donut-legend">${legend}</div>`;
}

// Гистограмма нагрузки
function renderLoadHistogram(links) {
  const container = document.getElementById("stats-load-histogram");
  if (!container) return;

  const buckets = [0, 0, 0, 0, 0];
  links.forEach(l => {
    const load = typeof l.load === "number" && !isNaN(l.load) ? Math.max(0, Math.min(1, l.load)) : 0;
    const idx = Math.min(Math.floor(load * 5), 4);
    buckets[idx]++;
  });

  const max = Math.max(...buckets, 1);
  const labels = ["0-20%", "20-40%", "40-60%", "60-80%", "80-100%"];
  const colors = ["#16233b", "#3b82f6", "#60a5fa", "#f59e0b", "#ef4444"];

  container.innerHTML = buckets.map((count, i) => `
    <div class="histogram-bar-wrapper">
      <div class="histogram-bar" style="height:${(count / max) * 100}%; background:${colors[i]}">
        <span class="histogram-value">${count}</span>
      </div>
      <div class="histogram-label">${labels[i]}</div>
    </div>
  `).join("");
}

// Топ-5 нагруженных связей
function renderTopLinks(data) {
  const container = document.getElementById("stats-top-links");
  if (!container) return;

  const sorted = [...data.links]
    .filter(l => typeof l.load === "number" && !isNaN(l.load))
    .sort((a, b) => b.load - a.load)
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-row">Нет данных о нагрузке</div>`;
    return;
  }

  container.innerHTML = sorted.map(l => {
    const pct = Math.round(l.load * 100);
    const normalizedLoad = Math.max(0, Math.min(1, l.load));
    const barWidth = Math.round(normalizedLoad * 100);
    const color = normalizedLoad > 0.8 ? "#ef4444" : normalizedLoad > 0.5 ? "#f59e0b" : "#3b82f6";
    return `
      <div class="top-link-row">
        <div class="top-link-name">${escapeHTML(l.source ?? "—")} → ${escapeHTML(l.target ?? "—")}</div>
        <div class="top-link-bar">
          <div class="top-link-fill" style="width:${barWidth}%; background:${color}"></div>
        </div>
        <div class="top-link-value" style="color:${color}">${pct}%</div>
      </div>
    `;
  }).join("");
}

// Топ-5 узлов по связям
function renderTopNodes(data) {
  const container = document.getElementById("stats-top-nodes");
  if (!container) return;

  const degreeMap = new Map();
  data.links.forEach(l => {
    const sourceId = normalizeStatsId(l.source);
    const targetId = normalizeStatsId(l.target);
    if(sourceId) degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
    if(targetId) degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
  });

  const sorted = [...degreeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-row">Нет данных</div>`;
    return;
  }

  const maxDegree = sorted[0][1];
  const nodeById = new Map(
    data.nodes
      .map(node=>[normalizeStatsId(node.id), node])
      .filter(([id])=>Boolean(id))
  );
  container.innerHTML = sorted.map(([id, degree]) => {
    const node = nodeById.get(id);
    const label = node ? node.label : id;
    const width = (degree / maxDegree) * 100;
    return `
      <div class="top-node-row">
        <div class="top-node-name">${escapeHTML(label)}</div>
        <div class="top-node-bar">
          <div class="top-node-fill" style="width:${width}%"></div>
        </div>
        <div class="top-node-value">${degree}</div>
      </div>
    `;
  }).join("");
}

// Сводка по проблемам
function renderIssuesSummary(data) {
  const container = document.getElementById("stats-issues-summary");
  if (!container) return;

  // Вспомогательная функция, которая использует условия, что и валидатор
  function countDashboardIssues(data) {
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const links = Array.isArray(data.links) ? data.links : [];
    const nodeIds = new Set(nodes.map(n => normalizeStatsId(n.id)).filter(Boolean));

    let problematicLinks = 0;
    const missingNodeIds = new Set();

    links.forEach(l => {
      let isProblematic = false;
      const sourceId = normalizeStatsId(l.source);
      const targetId = normalizeStatsId(l.target);

      // 1. Обрыв связи как в валидаторе
      if (!sourceId || !nodeIds.has(sourceId)) {
        isProblematic = true;
        if(sourceId) missingNodeIds.add(sourceId);
      }
      if (!targetId || !nodeIds.has(targetId)) {
        isProblematic = true;
        if(targetId) missingNodeIds.add(targetId);
      }

      // 2. Петля  как в валидаторе
      if (sourceId && sourceId === targetId) {
        isProblematic = true;
      }

      // 3. Некорректная нагрузка как в валидаторе
      if (typeof l.load !== "number" || isNaN(l.load)) {
        isProblematic = true;
      } else if (l.load < 0 || l.load > 1) {
        isProblematic = true;
      }

      if (isProblematic) {
        problematicLinks++;
      }
    });

    const deadNodes = nodes.filter(n => n.status === "dead").length;
    const missingNodes = nodes.filter(n => n.status === "missing").length + missingNodeIds.size;
    const nodeById = new Map(
      nodes
        .map(node=>[normalizeStatsId(node.id), node])
        .filter(([id])=>Boolean(id))
    );
    const deadLinks = links.filter(l => {
      const src = nodeById.get(normalizeStatsId(l.source));
      const tgt = nodeById.get(normalizeStatsId(l.target));
      return src?.status === "dead" && tgt?.status === "dead";
    }).length;

    return { problematicLinks, missingNodes, deadNodes, deadLinks };
  }

  const counts = countDashboardIssues(data);

  const items = [
    { 
      label: "Мёртвые узлы", 
      count: counts.deadNodes, 
      color: "#ef4444", 
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>` 
    },
    { 
      label: "Не найдены / Обрывы", 
      count: counts.missingNodes, 
      color: "#fbbf24", 
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` 
    },
    { 
      label: "Проблемные связи", 
      count: counts.problematicLinks, 
      color: "#f59e0b", 
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>` 
    },
    { 
      label: "Мёртвые связи", 
      count: counts.deadLinks, 
      color: "#ef4444", 
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>` 
    }
  ];

  container.innerHTML = items.map(item => `
    <div class="issue-summary-item">
      <div class="issue-summary-icon" style="color:${item.color}">${item.icon}</div>
      <div class="issue-summary-info">
        <div class="issue-summary-label">${item.label}</div>
        <div class="issue-summary-value" style="color:${item.color}">${item.count}</div>
      </div>
    </div>
  `).join("");
}
