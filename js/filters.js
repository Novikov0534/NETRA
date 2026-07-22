// фильтр
const filterState = {
  hideDead: false,
  hideIsolated: false,
  minLoad: 0 // от 0.0 до 1.0
};

function applyFilters() {
  // Проверяем, что граф инициализирован (cy объявлен глобально в app.js)
  if (typeof cy === 'undefined' || !cy) return;

  // сбрасываем видимость всех элементов
  cy.elements().show();

  const nodesToHide = [];
  const edgesToHide = [];

  // Скрываем мёртвые узлы и ведущие к ним связи (чтобы не висели в воздухе)
  if (filterState.hideDead) {
    cy.nodes('[status="dead"]').forEach(node => {
      nodesToHide.push(node);
      node.connectedEdges().forEach(edge => edgesToHide.push(edge));
    });
  }

  // Скрываем изолированные узлы
  if (filterState.hideIsolated) {
    cy.nodes().forEach(node => {
      if (node.degree() === 0) {
        nodesToHide.push(node);
      }
    });
  }

  // 4. Скрываем связи с нагрузкой ниже порога
  if (filterState.minLoad > 0) {
    cy.edges().forEach(edge => {
      if (edge.data('load') < filterState.minLoad) {
        edgesToHide.push(edge);
      }
    });
  }

  // 5. Применяем скрытие (используем Set для удаления дубликатов)
  const uniqueNodes = [...new Set(nodesToHide)];
  const uniqueEdges = [...new Set(edgesToHide)];

  if (uniqueNodes.length > 0) cy.collection(uniqueNodes).hide();
  if (uniqueEdges.length > 0) cy.collection(uniqueEdges).hide();
}

function initFilters() {
  const toggleBtn = document.getElementById('filter-toggle-btn');
  const panel = document.getElementById('filter-panel');
  const chkDead = document.getElementById('filter-hide-dead');
  const chkIsolated = document.getElementById('filter-hide-isolated');
  const sliderLoad = document.getElementById('filter-min-load');
  const valLoad = document.getElementById('filter-min-load-val');
  const btnReset = document.getElementById('filter-reset');

  if (!toggleBtn || !panel) return;

  // Открытие/закрытие панели
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  // Закрытие при клике вне панели
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // Функция обновления состояния и применения фильтров
  const updateAndApply = () => {
    filterState.hideDead = chkDead.checked;
    filterState.hideIsolated = chkIsolated.checked;
    filterState.minLoad = parseInt(sliderLoad.value, 10) / 100;
    valLoad.textContent = sliderLoad.value + '%';
    applyFilters();
  };

  // Привязка событий
  chkDead.addEventListener('change', updateAndApply);
  chkIsolated.addEventListener('change', updateAndApply);
  sliderLoad.addEventListener('input', updateAndApply);

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      chkDead.checked = false;
      chkIsolated.checked = false;
      sliderLoad.value = 0;
      updateAndApply();
    });
  }
}

// Сброс фильтров в исходное состояние
function resetFilters() {
  // сбрасываем внутреннее состояние
  filterState.hideDead = false;
  filterState.hideIsolated = false;
  filterState.minLoad = 0;

  // UI элементы сбрасываем
  const chkDead = document.getElementById('filter-hide-dead');
  const chkIsolated = document.getElementById('filter-hide-isolated');
  const sliderLoad = document.getElementById('filter-min-load');
  const valLoad = document.getElementById('filter-min-load-val');

  if (chkDead) chkDead.checked = false;
  if (chkIsolated) chkIsolated.checked = false;
  if (sliderLoad) sliderLoad.value = 0;
  if (valLoad) valLoad.textContent = '0%';

}

// Инициализируем обработчики 
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFilters);
} else {
  initFilters();
}