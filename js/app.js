/* ================= HERO VIDEO SPEED ================= */
const heroVideo = document.getElementById("hero-video");

/* ================= DEMO DATA ================= */
const DEMOS = {
  loaded: { name:"Нагруженная сеть", data:(()=>{
    const nodes=[]; const links=[];
    const labels=["core-fw01","core-sw01","core-sw02","edge-rtr01","edge-rtr02","dist-sw01","dist-sw02","dist-sw03","acc-sw01","acc-sw02","acc-sw03","acc-sw04","srv-db01","srv-db02","srv-app01","srv-app02","srv-cache01","mon-probe01"];
    labels.forEach((l,i)=>nodes.push({id:"n"+i, label:l, status: i===13?"dead": "alive"}));
    const pairs=[[0,1],[0,2],[1,3],[1,4],[2,3],[2,4],[3,5],[3,6],[4,6],[4,7],[5,8],[5,9],[6,9],[6,10],[7,10],[7,11],[8,12],[9,12],[9,13],[10,14],[10,15],[11,15],[11,16],[12,17],[14,17],[1,5],[2,7]];
    pairs.forEach(([a,b],i)=>links.push({source:"n"+a, target:"n"+b, load: [88,92,74,81,95,67,73,84,91,62,78,86,69,93,58,71,89,64,55,77,82,90,66,72,85,60,94][i%27]/100 }));
    return {nodes, links};
  })()},
  deadheavy: { name:"Много мёртвых узлов", data:(()=>{
    const labels=["gw-primary","gw-backup","sw-floor1","sw-floor2","sw-floor3","rtr-branch01","rtr-branch02","srv-mail01","srv-file01","srv-print01","ap-lobby","ap-hall","ap-east","cam-entry01","cam-dock02","probe-net01"];
    const deadIdx=new Set([1,3,4,6,8,9,12,13,14]);
    const nodes=labels.map((l,i)=>({id:"n"+i, label:l, status: deadIdx.has(i)?"dead":"alive"}));
    const pairs=[[0,1],[0,2],[2,3],[2,4],[0,5],[0,6],[5,7],[5,8],[6,9],[2,10],[2,11],[4,12],[3,13],[6,14],[0,15]];
    const links=pairs.map(([a,b],i)=>({source:"n"+a,target:"n"+b, load:[45,12,38,8,52,15,29,6,41,18,34,9,22,5,48][i]/100}));
    return {nodes, links};
  })()},
  sparse: { name:"Разреженный граф", data:(()=>{
    const labels=["hub-central","node-a","node-b","node-c","node-d","node-e","node-f","node-g","satellite-01"];
    const nodes=labels.map((l,i)=>({id:"n"+i, label:l, status: i===8?"dead":"alive"}));
    const pairs=[[0,1],[0,2],[0,3],[3,4],[4,5],[1,6],[6,7],[7,8]];
    const links=pairs.map(([a,b],i)=>({source:"n"+a,target:"n"+b, load:[30,42,18,25,55,12,20,7][i]/100}));
    return {nodes, links};
  })()},
  mixed: { name:"Смешанная топология", data:(()=>{
    const labels=["dc-east-core","dc-west-core","rtr-transit01","rtr-transit02","fw-perimeter","lb-front01","lb-front02","srv-web01","srv-web02","srv-web03","srv-api01","srv-api02","db-primary","db-replica","cache-redis01","queue-mq01","cdn-edge01","cdn-edge02","mon-graf01","mon-prom01","dns-primary","dns-secondary"];
    const deadIdx=new Set([9,13,16,20]);
    const nodes=labels.map((l,i)=>({id:"n"+i, label:l, status: deadIdx.has(i)?"dead":"alive"}));
    const pairs=[[0,1],[0,2],[1,3],[2,4],[3,4],[4,5],[4,6],[5,7],[5,8],[6,9],[6,10],[7,12],[8,12],[9,13],[10,11],[11,12],[10,14],[11,15],[5,16],[6,17],[0,18],[1,19],[2,20],[3,21],[7,14],[8,15]];
    const links=pairs.map(([a,b],i)=>({source:"n"+a,target:"n"+b, load:[70,55,80,44,90,63,38,72,29,85,51,67,33,95,58,41,76,22,64,47,88,35,59,26,73,48][i%26]/100}));
    return {nodes, links};
  })()},
};

/* ================= STATE ================= */
let currentData = null;
let currentName = "—";
let currentIssues = [];
let cy = null;
let deadPulseRAF = null;

/* ================= TAB SWITCHING ================= */
const views = { home:document.getElementById("view-home"), viz:document.getElementById("view-viz"), stats:document.getElementById("view-stats") };
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

/* ================= LOAD DATA ================= */
document.querySelectorAll(".demo-card").forEach(card=>{
  card.addEventListener("click", ()=>{
    const key = card.dataset.demo;
    loadDataset(DEMOS[key].data, DEMOS[key].name);
    setView("viz");
  });
});

document.getElementById("file-input").addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const parsed = JSON.parse(ev.target.result);
      if(!Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) throw new Error("bad format");
      loadDataset(parsed, file.name.replace(/\.json$/i,""));
      setView("viz");
    }catch(err){
      alert("Не удалось разобрать файл. Ожидается формат { nodes:[...], links:[...] }");
    }
  };
  reader.readAsText(file);
});

function loadDataset(data, name){
  currentData = data;
  currentName = name;
  currentIssues = validateDataset(data);
  document.getElementById("nav-status-text").textContent = name.toUpperCase() + (currentIssues.length ? " · ОШИБКИ" : "");
  renderGraph(data);
  renderStats(data);
  renderIssuesBanner(currentIssues);
  renderIssuesSection(currentIssues);
}
