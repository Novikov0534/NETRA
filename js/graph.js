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
  const dupCounter = new Map();

  nodes.forEach(n=>{
    if(!n || typeof n !== "object") return;
    let id = n.id;
    if(id===undefined || id===null || id==="") return;
    id = String(id);
    if(seenIds.has(id)){
      const duplicateNumber = (dupCounter.get(id) || 1) + 1;
      dupCounter.set(id, duplicateNumber);
      id = `${id}__dup${duplicateNumber}`;
    }
    seenIds.add(id);
    let status = n.status==="dead" ? "dead" : n.status==="alive" ? "alive" : "unknown";
    const meta = n.meta && typeof n.meta === "object" && !Array.isArray(n.meta) ? n.meta : {};
    elements.push({group:"nodes", data:{id, label:n.label || String(id), status, meta}});
  });

  const knownIds = new Set(elements.map(e=>e.data.id));
  const statusById = new Map(elements.map(e=>[e.data.id, e.data.status]));
  const ghosted = new Set();

  links.forEach((l,i)=>{
    if(!l || typeof l !== "object") return;
    const src = l.source===undefined || l.source===null ? undefined : String(l.source);
    const tgt = l.target===undefined || l.target===null ? undefined : String(l.target);
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
      const meta = l.meta && typeof l.meta === "object" && !Array.isArray(l.meta) ? l.meta : {};
      elements.push({group:"edges", data:{id:"e"+i, source:src, target:tgt, load, broken, deadLink, meta}});
    }
  });

  return elements;
}

const GRAPH_LAYOUT_VERSION = 10;
const GRAPH_LAYOUT_BOUNDS = { x1:0, y1:0, w:1200, h:800 };

function hashTopology(value){
  let hash = 2166136261;
  for(let i = 0; i < value.length; i++){
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createTopologyKey(elements){
  const nodes = elements
    .filter(element=>element.group === "nodes")
    .map(element=>String(element.data.id))
    .sort();
  const edges = elements
    .filter(element=>element.group === "edges")
    .map(element=>`${element.data.source}>${element.data.target}`)
    .sort();
  return `v${GRAPH_LAYOUT_VERSION}-${hashTopology(`${nodes.join("|")}::${edges.join("|")}`)}`;
}

function sortGraphElements(elements){
  return [...elements].sort((a,b)=>{
    if(a.group !== b.group) return a.group === "nodes" ? -1 : 1;
    const firstId = String(a.data.id);
    const secondId = String(b.data.id);
    return firstId < secondId ? -1 : firstId > secondId ? 1 : 0;
  });
}

function getDeclaredPositions(data, elements){
  const declared = data && data.layout && data.layout.positions;
  if(!declared || typeof declared !== "object") return null;

  const positions = {};
  const nodes = elements.filter(element=>element.group === "nodes");
  for(const node of nodes){
    const position = declared[node.data.id];
    if(!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
    positions[node.data.id] = { x:position.x, y:position.y };
  }
  return positions;
}

function hasCompletePositions(positions, elements){
  if(!positions) return false;
  return elements
    .filter(element=>element.group === "nodes")
    .every(element=>{
      const position = positions[element.data.id];
      return position && Number.isFinite(position.x) && Number.isFinite(position.y);
    });
}

function createCanonicalSeedPositions(elements){
  const nodes = elements.filter(element=>element.group === "nodes");
  const positions = {};
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radiusStep = Math.min(72, 360 / Math.sqrt(Math.max(nodes.length, 1)));
  const centerX = GRAPH_LAYOUT_BOUNDS.x1 + GRAPH_LAYOUT_BOUNDS.w / 2;
  const centerY = GRAPH_LAYOUT_BOUNDS.y1 + GRAPH_LAYOUT_BOUNDS.h / 2;

  nodes.forEach((node, index)=>{
    const radius = radiusStep * Math.sqrt(index);
    const angle = -Math.PI / 2 + index * goldenAngle;
    positions[node.data.id] = {
      x:centerX + Math.cos(angle) * radius * 1.45,
      y:centerY + Math.sin(angle) * radius * 0.72,
    };
  });

  return positions;
}

function canonicalLayoutOptions(nodeCount){
  const compactGraph = nodeCount <= 60;
  const mediumGraph = nodeCount <= 300;
  return {
    name:"cose",
    animate:false,
    randomize:false,
    fit:false,
    componentSpacing:compactGraph ? 140 : 110,
    nodeRepulsion:compactGraph ? 120000 : mediumGraph ? 90000 : 70000,
    nodeOverlap:20,
    idealEdgeLength:compactGraph ? 110 : mediumGraph ? 90 : 72,
    edgeElasticity:100,
    nestingFactor:1.2,
    gravity:compactGraph ? 0.28 : 0.35,
    numIter:nodeCount <= 60 ? 1000 : nodeCount <= 150 ? 120 : nodeCount <= 300 ? 80 : 40,
    initialTemp:160,
    coolingFactor:0.96,
    minTemp:1,
  };
}

function normalizeCanonicalLayout(){
  const nodes = cy.nodes();
  if(nodes.length < 2) return;

  const bounds = ()=>{
    const positions = nodes.map(node=>node.position());
    const xs = positions.map(position=>position.x);
    const ys = positions.map(position=>position.y);
    return {
      minX:Math.min(...xs),
      maxX:Math.max(...xs),
      minY:Math.min(...ys),
      maxY:Math.max(...ys),
    };
  };

  let box = bounds();
  let width = box.maxX - box.minX;
  let height = box.maxY - box.minY;
  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;

  if(height > width){
    nodes.positions(node=>{
      const position = node.position();
      return {
        x:centerX + (position.y - centerY),
        y:centerY - (position.x - centerX),
      };
    });
    box = bounds();
    width = box.maxX - box.minX;
    height = box.maxY - box.minY;
  }

  if(!width || !height) return;

  const targetAspect = 1.8;
  const currentAspect = width / height;
  if(currentAspect < targetAspect){
    const verticalScale = currentAspect / targetAspect;
    const normalizedCenterY = (box.minY + box.maxY) / 2;
    nodes.positions(node=>{
      const position = node.position();
      return {
        x:position.x,
        y:normalizedCenterY + (position.y - normalizedCenterY) * verticalScale,
      };
    });
  }
}

function pointToSegment(point, start, end){
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if(lengthSquared < 0.0001){
    const offsetX = point.x - start.x;
    const offsetY = point.y - start.y;
    return {
      distance:Math.hypot(offsetX, offsetY),
      offsetX,
      offsetY,
      t:0,
    };
  }

  const rawT = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const nearestX = start.x + segmentX * t;
  const nearestY = start.y + segmentY * t;
  const offsetX = point.x - nearestX;
  const offsetY = point.y - nearestY;
  return {
    distance:Math.hypot(offsetX, offsetY),
    offsetX,
    offsetY,
    segmentX,
    segmentY,
    t,
  };
}

function deterministicDirection(key){
  const hash = hashTopology(key);
  const seed = parseInt(hash.slice(-4), 36);
  const angle = (seed % 360) * Math.PI / 180;
  return { x:Math.cos(angle), y:Math.sin(angle) };
}

function graphNodesCenter(nodes){
  if(!nodes.length) return { x:0, y:0 };
  const sum = nodes.reduce((accumulator, node)=>{
    const position = node.position();
    accumulator.x += position.x;
    accumulator.y += position.y;
    return accumulator;
  }, { x:0, y:0 });
  return { x:sum.x / nodes.length, y:sum.y / nodes.length };
}

function improveCanonicalReadability(){
  const nodes = cy.nodes().toArray().sort((a,b)=>a.id().localeCompare(b.id()));
  const edges = cy.edges().toArray().sort((a,b)=>a.id().localeCompare(b.id()));
  if(nodes.length < 3 || !edges.length) return;

  const originalCenter = graphNodesCenter(nodes);
  const edgeClearance = nodes.length <= 60 ? 44 : nodes.length <= 300 ? 38 : 32;
  const nodeClearance = nodes.length <= 60 ? 68 : nodes.length <= 300 ? 58 : 48;
  const iterations = nodes.length <= 100 ? 24 : nodes.length <= 300 ? 14 : 8;

  for(let iteration = 0; iteration < iterations; iteration++){
    let totalMovement = 0;

    nodes.forEach(node=>{
      const nodeId = node.id();
      const position = node.position();
      let strongestConflict = null;

      edges.forEach(edge=>{
        const source = edge.source();
        const target = edge.target();
        if(source.id() === nodeId || target.id() === nodeId) return;

        const proximity = pointToSegment(position, source.position(), target.position());
        if(proximity.t <= 0.06 || proximity.t >= 0.94 || proximity.distance >= edgeClearance) return;

        const penetration = edgeClearance - proximity.distance;
        if(strongestConflict && strongestConflict.penetration >= penetration) return;

        let direction;
        if(proximity.distance > 0.001){
          direction = {
            x:proximity.offsetX / proximity.distance,
            y:proximity.offsetY / proximity.distance,
          };
        }else{
          const segmentLength = Math.hypot(proximity.segmentX, proximity.segmentY) || 1;
          const side = deterministicDirection(`${nodeId}|${edge.id()}`).x >= 0 ? 1 : -1;
          direction = {
            x:(-proximity.segmentY / segmentLength) * side,
            y:(proximity.segmentX / segmentLength) * side,
          };
        }

        strongestConflict = { direction, penetration };
      });

      if(!strongestConflict) return;
      const step = Math.min(28, strongestConflict.penetration + 5);
      node.position({
        x:position.x + strongestConflict.direction.x * step,
        y:position.y + strongestConflict.direction.y * step,
      });
      totalMovement += step;
    });

    for(let firstIndex = 0; firstIndex < nodes.length; firstIndex++){
      for(let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex++){
        const first = nodes[firstIndex];
        const second = nodes[secondIndex];
        const firstPosition = first.position();
        const secondPosition = second.position();
        const deltaX = secondPosition.x - firstPosition.x;
        const deltaY = secondPosition.y - firstPosition.y;
        const distance = Math.hypot(deltaX, deltaY);
        if(distance >= nodeClearance) continue;

        const direction = distance > 0.001
          ? { x:deltaX / distance, y:deltaY / distance }
          : deterministicDirection(`${first.id()}|${second.id()}`);
        const step = Math.min(14, (nodeClearance - distance) / 2 + 1);
        first.position({
          x:firstPosition.x - direction.x * step,
          y:firstPosition.y - direction.y * step,
        });
        second.position({
          x:secondPosition.x + direction.x * step,
          y:secondPosition.y + direction.y * step,
        });
        totalMovement += step * 2;
      }
    }

    if(totalMovement < 0.5) break;
  }

  const improvedCenter = graphNodesCenter(nodes);
  const centerOffset = {
    x:originalCenter.x - improvedCenter.x,
    y:originalCenter.y - improvedCenter.y,
  };
  nodes.forEach(node=>{
    const position = node.position();
    node.position({
      x:position.x + centerOffset.x,
      y:position.y + centerOffset.y,
    });
  });
}

function findNodeEdgeConflicts(clearance = 30){
  const nodes = cy.nodes().toArray();
  const edges = cy.edges().toArray();
  const conflicts = [];

  nodes.forEach(node=>{
    edges.forEach(edge=>{
      if(edge.source().id() === node.id() || edge.target().id() === node.id()) return;
      const proximity = pointToSegment(node.position(), edge.source().position(), edge.target().position());
      if(proximity.t > 0.06 && proximity.t < 0.94 && proximity.distance < clearance){
        conflicts.push({ node, edge, proximity });
      }
    });
  });

  return conflicts;
}

function countNodeEdgeConflicts(clearance = 30){
  return findNodeEdgeConflicts(clearance).length;
}

function segmentsCrossStrict(firstStart, firstEnd, secondStart, secondEnd){
  const orientation = (start, end, point)=>
    (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  const epsilon = 0.001;
  const firstSideA = orientation(firstStart, firstEnd, secondStart);
  const firstSideB = orientation(firstStart, firstEnd, secondEnd);
  const secondSideA = orientation(secondStart, secondEnd, firstStart);
  const secondSideB = orientation(secondStart, secondEnd, firstEnd);

  return ((firstSideA > epsilon && firstSideB < -epsilon) || (firstSideA < -epsilon && firstSideB > epsilon))
    && ((secondSideA > epsilon && secondSideB < -epsilon) || (secondSideA < -epsilon && secondSideB > epsilon));
}

function findEdgeCrossings(edges = cy.edges().toArray()){
  const crossings = [];
  for(let firstIndex = 0; firstIndex < edges.length; firstIndex++){
    const firstEdge = edges[firstIndex];
    const firstSource = firstEdge.source();
    const firstTarget = firstEdge.target();
    if(firstSource.id() === firstTarget.id()) continue;

    for(let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex++){
      const secondEdge = edges[secondIndex];
      const secondSource = secondEdge.source();
      const secondTarget = secondEdge.target();
      if(secondSource.id() === secondTarget.id()) continue;

      const firstIds = new Set([firstSource.id(), firstTarget.id()]);
      if(firstIds.has(secondSource.id()) || firstIds.has(secondTarget.id())) continue;

      if(segmentsCrossStrict(
        firstSource.position(),
        firstTarget.position(),
        secondSource.position(),
        secondTarget.position()
      )){
        crossings.push({ firstEdge, secondEdge });
      }
    }
  }
  return crossings;
}

function graphEdgeLengthMetrics(edges){
  return edges.reduce((metrics, edge)=>{
    const source = edge.source().position();
    const target = edge.target().position();
    const length = Math.hypot(target.x - source.x, target.y - source.y);
    metrics.total += length;
    metrics.maximum = Math.max(metrics.maximum, length);
    return metrics;
  }, { total:0, maximum:0 });
}

function swapNodePositions(firstNode, secondNode){
  const firstCurrentPosition = firstNode.position();
  const secondCurrentPosition = secondNode.position();
  const firstPosition = { x:firstCurrentPosition.x, y:firstCurrentPosition.y };
  const secondPosition = { x:secondCurrentPosition.x, y:secondCurrentPosition.y };
  firstNode.position({ x:secondPosition.x, y:secondPosition.y });
  secondNode.position({ x:firstPosition.x, y:firstPosition.y });
}

function reduceEdgeCrossingsConservatively(){
  const nodes = cy.nodes().toArray().sort((a,b)=>a.id().localeCompare(b.id()));
  const edges = cy.edges().toArray().sort((a,b)=>a.id().localeCompare(b.id()));
  if(nodes.length < 4 || nodes.length > 80 || edges.length < 2 || edges.length > 180) return null;

  let crossings = findEdgeCrossings(edges);
  const initialCrossingCount = crossings.length;
  if(!crossings.length) return { before:0, after:0 };

  const baselineLengths = graphEdgeLengthMetrics(edges);
  const baselineConflicts = countNodeEdgeConflicts(30);
  const maxIterations = nodes.length <= 40 ? 10 : 6;

  for(let iteration = 0; iteration < maxIterations && crossings.length; iteration++){
    const candidatePairs = new Map();

    crossings.slice(0, 24).forEach(({ firstEdge, secondEdge })=>{
      const firstEndpoints = [firstEdge.source(), firstEdge.target()];
      const secondEndpoints = [secondEdge.source(), secondEdge.target()];
      firstEndpoints.forEach(firstNode=>{
        secondEndpoints.forEach(secondNode=>{
          const orderedNodes = [firstNode, secondNode].sort((a,b)=>a.id().localeCompare(b.id()));
          candidatePairs.set(`${orderedNodes[0].id()}|${orderedNodes[1].id()}`, orderedNodes);
        });
      });
    });

    let bestCandidate = null;
    [...candidatePairs.entries()]
      .sort(([firstKey], [secondKey])=>firstKey.localeCompare(secondKey))
      .slice(0, 64)
      .forEach(([key, [firstNode, secondNode]])=>{
        swapNodePositions(firstNode, secondNode);
        const candidateCrossings = findEdgeCrossings(edges);
        const candidateLengths = graphEdgeLengthMetrics(edges);
        const candidateConflicts = countNodeEdgeConflicts(30);
        swapNodePositions(firstNode, secondNode);

        const improvesCrossings = candidateCrossings.length < crossings.length;
        const preservesLength = candidateLengths.total <= baselineLengths.total * 1.1
          && candidateLengths.maximum <= baselineLengths.maximum * 1.18;
        const preservesClearance = candidateConflicts <= baselineConflicts;
        if(!improvesCrossings || !preservesLength || !preservesClearance) return;

        const candidate = {
          key,
          firstNode,
          secondNode,
          crossings:candidateCrossings,
          lengths:candidateLengths,
        };
        if(!bestCandidate
          || candidate.crossings.length < bestCandidate.crossings.length
          || (candidate.crossings.length === bestCandidate.crossings.length
            && candidate.lengths.total < bestCandidate.lengths.total)
          || (candidate.crossings.length === bestCandidate.crossings.length
            && candidate.lengths.total === bestCandidate.lengths.total
            && candidate.key < bestCandidate.key)){
          bestCandidate = candidate;
        }
      });

    if(!bestCandidate) break;
    swapNodePositions(bestCandidate.firstNode, bestCandidate.secondNode);
    crossings = bestCandidate.crossings;
  }

  return { before:initialCrossingCount, after:crossings.length };
}

function countEdgeCrossings(){
  const edges = cy.edges().toArray();
  return edges.length > 400 ? null : findEdgeCrossings(edges).length;
}

function countNodeOverlaps(clearance = 48){
  const nodes = cy.nodes().toArray();
  let overlaps = 0;
  for(let firstIndex = 0; firstIndex < nodes.length; firstIndex++){
    for(let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex++){
      const first = nodes[firstIndex].position();
      const second = nodes[secondIndex].position();
      if(Math.hypot(second.x - first.x, second.y - first.y) < clearance) overlaps++;
    }
  }
  return overlaps;
}

function resolveRemainingNodeEdgeConflicts(){
  const nodes = cy.nodes().toArray();
  const edges = cy.edges().toArray();
  if(nodes.length > 120 || edges.length > 240) return false;

  const baselineLengths = graphEdgeLengthMetrics(edges);
  let changed = false;

  const maxIterations = nodes.length <= 60 ? 4 : 8;
  for(let iteration = 0; iteration < maxIterations; iteration++){
    const conflicts = findNodeEdgeConflicts(30);
    if(!conflicts.length) break;

    const currentCrossings = findEdgeCrossings(edges).length;
    let bestCandidate = null;

    conflicts.slice(0, 6).forEach(({ node, proximity })=>{
      const currentPosition = node.position();
      const originalPosition = { x:currentPosition.x, y:currentPosition.y };
      const fallback = deterministicDirection(`${node.id()}|clearance`);
      const baseAngle = proximity.distance > 0.001
        ? Math.atan2(proximity.offsetY, proximity.offsetX)
        : Math.atan2(fallback.y, fallback.x);
      const angleOffsets = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];

      angleOffsets.forEach((angleOffset, angleIndex)=>{
        [18, 32, 46].forEach(distance=>{
          const angle = baseAngle + angleOffset;
          node.position({
            x:originalPosition.x + Math.cos(angle) * distance,
            y:originalPosition.y + Math.sin(angle) * distance,
          });

          const candidateConflicts = findNodeEdgeConflicts(30).length;
          const candidateCrossings = findEdgeCrossings(edges).length;
          const candidateLengths = graphEdgeLengthMetrics(edges);
          const candidateOverlaps = countNodeOverlaps(48);
          node.position(originalPosition);

          const improvesClearance = candidateConflicts < conflicts.length;
          const preservesCrossings = candidateCrossings <= currentCrossings + 1;
          const preservesLength = candidateLengths.total <= baselineLengths.total * 1.12
            && candidateLengths.maximum <= baselineLengths.maximum * 1.18;
          if(!improvesClearance || !preservesCrossings || !preservesLength || candidateOverlaps > 0) return;

          const candidate = {
            node,
            position:{
              x:originalPosition.x + Math.cos(angle) * distance,
              y:originalPosition.y + Math.sin(angle) * distance,
            },
            conflicts:candidateConflicts,
            crossings:candidateCrossings,
            length:candidateLengths.total,
            key:`${node.id()}|${angleIndex}|${distance}`,
          };
          if(!bestCandidate
            || candidate.conflicts < bestCandidate.conflicts
            || (candidate.conflicts === bestCandidate.conflicts && candidate.crossings < bestCandidate.crossings)
            || (candidate.conflicts === bestCandidate.conflicts
              && candidate.crossings === bestCandidate.crossings
              && candidate.length < bestCandidate.length)
            || (candidate.conflicts === bestCandidate.conflicts
              && candidate.crossings === bestCandidate.crossings
              && candidate.length === bestCandidate.length
              && candidate.key < bestCandidate.key)){
            bestCandidate = candidate;
          }
        });
      });
    });

    if(!bestCandidate) break;
    bestCandidate.node.position(bestCandidate.position);
    changed = true;
  }

  return changed;
}

function graphStyles(){
  return [
    { selector:"node", style:{
      "label":"data(label)",
      "color":"#94a3b8",
      "font-family":"JetBrains Mono, IBM Plex Mono, Consolas, monospace",
      "font-size":10,
      "text-valign":"bottom",
      "text-margin-y":8,
      "text-background-color":"#0a0e17",
      "text-background-opacity":0.82,
      "text-background-padding":2,
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
      "transition-duration":350,
    }},
    { selector:"edge[?deadLink]", style:{
      "line-color":"#ef4444", "width": ele=> Math.max(3, 2 + ele.data("load")*5),
    }},
    { selector:"edge[?broken]", style:{
      "line-color":"#ef4444", "line-style":"dashed", "width":2,
    }},
    { selector:"edge:selected", style:{ "line-color":"#93c5fd", "width": ele=> 3 + ele.data("load")*5 }},
  ];
}

function ensureGraphInstance(){
  if(cy && !cy.destroyed()) return;

  cy = cytoscape({
    container:document.getElementById("cy"),
    elements:[],
    style:graphStyles(),
    layout:{ name:"preset", fit:false },
    wheelSensitivity:.25,
  });

  cy.on("tap", "node", evt=>focusNode(evt.target));
  cy.on("tap", "edge", evt=>focusEdge(evt.target));
  cy.on("tap", evt=>{
    if(evt.target === cy){
      closePanel();
      resetSearchHighlight();
    }
  });
}

function captureGraphViewState(){
  if(!cy || cy.destroyed() || !renderedDatasetId) return null;

  const dataset = openedDatasets.find(item=>item.id === renderedDatasetId);
  if(!dataset) return null;

  const positions = {};
  cy.nodes().forEach(node=>{
    const position = node.position();
    positions[node.id()] = { x:position.x, y:position.y };
  });

  const container = cy.container();
  const pan = cy.pan();
  dataset.viewState = {
    layoutVersion:GRAPH_LAYOUT_VERSION,
    topologyKey:dataset.topologyKey,
    positions,
    zoom:cy.zoom(),
    pan:{ x:pan.x, y:pan.y },
    viewport:{
      width:container ? container.clientWidth : 0,
      height:container ? container.clientHeight : 0,
    },
  };
  return dataset.viewState;
}

function applyPresetPositions(positions){
  cy.layout({
    name:"preset",
    positions:node=>positions[node.id()],
    animate:false,
    fit:false,
  }).run();
}

function restoreViewport(viewState){
  const container = cy.container();
  const previous = viewState && viewState.viewport;
  const width = container ? container.clientWidth : 0;
  const height = container ? container.clientHeight : 0;
  const zoom = viewState && viewState.zoom;
  const pan = viewState && viewState.pan;

  if(!Number.isFinite(zoom) || !pan || !Number.isFinite(pan.x) || !Number.isFinite(pan.y)){
    cy.fit(cy.elements(), 50);
    return;
  }

  let restoredPan = { x:pan.x, y:pan.y };
  if(previous && previous.width > 0 && previous.height > 0 && width > 0 && height > 0){
    const modelCenter = {
      x:(previous.width / 2 - pan.x) / zoom,
      y:(previous.height / 2 - pan.y) / zoom,
    };
    restoredPan = {
      x:width / 2 - modelCenter.x * zoom,
      y:height / 2 - modelCenter.y * zoom,
    };
  }

  cy.viewport({ zoom, pan:restoredPan });
}

function resizeGraphPreservingViewport(previousViewState){
  if(!cy || cy.destroyed()) return;

  const viewState = previousViewState || captureGraphViewState();

  cy.resize();
  if(viewState) restoreViewport(viewState);
  captureGraphViewState();
}

function renderGraph(dataset){
  const layoutStartedAt = performance.now();
  const data = dataset.data || {};
  const nodes = Array.isArray(data.nodes)
    ? data.nodes.filter(item=>item && typeof item === "object")
    : [];
  const links = Array.isArray(data.links)
    ? data.links.filter(item=>item && typeof item === "object")
    : [];
  document.getElementById("viz-dataset-name").textContent = currentName;
  document.getElementById("viz-node-count").textContent = nodes.length;
  document.getElementById("viz-edge-count").textContent = links.length;

  captureGraphViewState();
  pauseGraphRendering();
  ensureGraphInstance();
  cy.resize();

  const elements = sortGraphElements(buildElements(data));
  const topologyKey = createTopologyKey(elements);
  const savedState = dataset.viewState;
  const savedPositions = savedState
    && savedState.layoutVersion === GRAPH_LAYOUT_VERSION
    && savedState.topologyKey === topologyKey
    && hasCompletePositions(savedState.positions, elements)
    ? savedState.positions
    : null;
  const declaredPositions = getDeclaredPositions(data, elements);
  let crossingOptimization = null;

  dataset.topologyKey = topologyKey;
  renderedDatasetId = dataset.id;

  cy.stop(true, false);
  panel.classList.remove("open");
  closeSearch();
  cy.batch(()=>{
    cy.elements().remove();
    cy.add(elements);
  });

  if(savedPositions){
    applyPresetPositions(savedPositions);
    restoreViewport(savedState);
  }else if(hasCompletePositions(declaredPositions, elements)){
    applyPresetPositions(declaredPositions);
    cy.fit(cy.elements(), 50);
  }else{
    applyPresetPositions(createCanonicalSeedPositions(elements));
    cy.layout(canonicalLayoutOptions(cy.nodes().length)).run();
    normalizeCanonicalLayout();
    improveCanonicalReadability();
    crossingOptimization = reduceEdgeCrossingsConservatively();
    if(resolveRemainingNodeEdgeConflicts()){
      const retryOptimization = reduceEdgeCrossingsConservatively();
      if(retryOptimization){
        crossingOptimization = {
          before:crossingOptimization ? crossingOptimization.before : retryOptimization.before,
          after:retryOptimization.after,
        };
      }
    }
    cy.fit(cy.elements(), 50);
  }

  document.getElementById("cy").dataset.layoutConflicts = String(countNodeEdgeConflicts());
  const layoutCrossings = countEdgeCrossings();
  document.getElementById("cy").dataset.layoutCrossings = layoutCrossings === null ? "skipped" : String(layoutCrossings);
  document.getElementById("cy").dataset.layoutCrossingsBefore = crossingOptimization
    ? String(crossingOptimization.before)
    : "unchanged";
  document.getElementById("cy").dataset.layoutNodeOverlaps = String(countNodeOverlaps());
  document.getElementById("cy").dataset.layoutDurationMs = String(Math.round(performance.now() - layoutStartedAt));
  cy.nodes().style({ width:34, height:34, opacity:1 });
  cy.edges().style({ opacity:1 });
  captureGraphViewState();
  if(typeof applyFilters === "function") applyFilters();
  startDeadPulse();
}

function pauseGraphRendering(){
  if(deadPulseRAF) cancelAnimationFrame(deadPulseRAF);
  deadPulseRAF = null;
}

function resumeGraphRendering(){
  if(!cy || cy.destroyed() || !renderedDatasetId) return;
  cy.resize();
  startDeadPulse();
}

function destroyGraph(){
  pauseGraphRendering();
  if(cy && !cy.destroyed()) cy.destroy();
  cy = null;
  renderedDatasetId = null;
}

function startDeadPulse() {
  pauseGraphRendering();
  if(!cy || cy.destroyed() || activeViewName !== "viz") return;

  let startTime = null;
  let lastFrame = 0;
  const duration = 1200;
  const frameInterval = 1000 / 30;

  function tick(timestamp) {
    if(!cy || cy.destroyed() || activeViewName !== "viz" || !renderedDatasetId){
      deadPulseRAF = null;
      return;
    }

    if (!startTime) startTime = timestamp;
    if(timestamp - lastFrame >= frameInterval){
      lastFrame = timestamp;
      const progress = ((timestamp - startTime) % duration) / duration;
      const pulseFactor = Math.sin(progress * Math.PI);

      cy.nodes('[status="dead"]').style({
        "width": 34 + (pulseFactor * 10),
        "height": 34 + (pulseFactor * 10),
        "border-width": 2 + (pulseFactor * 4),
        "border-opacity": 0.6 + (pulseFactor * 0.4)
      });
    }

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
    <div class="panel-title">${escapeHTML(d.label)}</div>
    <div class="panel-field"><div class="k">ID</div><div class="v">${escapeHTML(d.id)}</div></div>
    <div class="panel-field"><div class="k">Статус</div><div class="v">${statusChip(d.status)}</div></div>
    <div class="panel-field"><div class="k">Связанные узлы (${neighbors.length})</div><div class="v">${neighbors.length ? neighbors.map(escapeHTML).join(", ") : "—"}</div></div>
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
    <div class="panel-title">${escapeHTML(src)} → ${escapeHTML(tgt)}</div>
    <div class="panel-field"><div class="k">Источник</div><div class="v">${escapeHTML(src)}</div></div>
    <div class="panel-field"><div class="k">Назначение</div><div class="v">${escapeHTML(tgt)}</div></div>
    <div class="panel-field"><div class="k">Состояние</div><div class="v">${escapeHTML(state)}</div></div>
    <div class="panel-field"><div class="k">Нагрузка</div><div class="v">${Math.round(d.load*100)}%</div></div>
  `;
  panel.classList.add("open");
}

function closePanel(){ 
  panel.classList.remove("open");
  resetSearchHighlight();

  if(cy) cy.stop(true, false);
  if(typeof applyFilters === "function") applyFilters();
  captureGraphViewState();
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
    'border-color': '',
    'border-width': ''
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
        <div class="graph-search-item-label">${escapeHTML(match.label)}</div>
        <div class="graph-search-item-id">${escapeHTML(match.id)}</div>
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
document.getElementById("btn-reset-view").addEventListener("click", ()=>{
  if(!cy) return;
  cy.fit(undefined, 40);
  captureGraphViewState();
});
document.getElementById("btn-export-png").addEventListener("click", ()=>{
  if(!cy) return;
  const png = cy.png({full:true, scale:2, bg:"#0a0e17"});
  const a = document.createElement("a");
  const safeName = currentName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_");
  a.href = png; a.download = `netra-${safeName}.png`;
  a.click();
});
