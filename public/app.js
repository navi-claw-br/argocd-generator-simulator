/* ─── ArgoCD Generator Simulator — Frontend ──────────────── */

// ─── Load examples ──────────────────────────────────────────
async function loadExamples() {
  try {
    const res = await fetch('/api/examples');
    const examples = await res.json();
    const list = document.getElementById('examplesList');
    list.innerHTML = '';
    Object.entries(examples).forEach(([name, content]) => {
      const el = document.createElement('div');
      el.className = 'example-item';
      el.textContent = name.replace(/-/g, ' ');
      el.onclick = () => {
        document.getElementById('yamlEditor').value = content;
        updateMockDataForExample(name);
        simulate();
      };
      list.appendChild(el);
    });
  } catch (e) {
    document.getElementById('examplesList').innerHTML = '<span class="loading">Erro ao carregar exemplos</span>';
  }
}
loadExamples();

// ─── Update mock data based on example name ────────────────
function updateMockDataForExample(exampleName) {
  if (exampleName.includes('tier') || exampleName.includes('sigla')) {
    document.getElementById('mockClusters').innerHTML = `
      <div class="mock-item"><input type="text" class="cluster-name" value="cluster-a" placeholder="Nome"><input type="text" class="cluster-server" value="https://k8s-cluster-a.local" placeholder="Server URL"><input type="text" class="cluster-labels" value="tier=tier1,sigla=xyz" placeholder="labels"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>
      <div class="mock-item"><input type="text" class="cluster-name" value="cluster-b" placeholder="Nome"><input type="text" class="cluster-server" value="https://k8s-cluster-b.local" placeholder="Server URL"><input type="text" class="cluster-labels" value="tier=tier2" placeholder="labels"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>
      <div class="mock-item"><input type="text" class="cluster-name" value="cluster-c" placeholder="Nome"><input type="text" class="cluster-server" value="https://k8s-cluster-c.local" placeholder="Server URL"><input type="text" class="cluster-labels" value="tier=tier3" placeholder="labels"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>
      <div class="mock-item"><input type="text" class="cluster-name" value="cluster-d" placeholder="Nome"><input type="text" class="cluster-server" value="https://k8s-cluster-d.local" placeholder="Server URL"><input type="text" class="cluster-labels" value="tier=tier1,sigla=abc" placeholder="labels"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>`;
  } else {
    document.getElementById('mockClusters').innerHTML = `
      <div class="mock-item"><input type="text" class="cluster-name" value="staging" placeholder="Nome"><input type="text" class="cluster-server" value="https://1.2.3.4" placeholder="Server URL"><input type="text" class="cluster-labels" value="environment=staging" placeholder="labels"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>
      <div class="mock-item"><input type="text" class="cluster-name" value="production" placeholder="Nome"><input type="text" class="cluster-server" value="https://2.4.6.8" placeholder="Server URL"><input type="text" class="cluster-labels" value="environment=prod" placeholder="labels"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>
      <div class="mock-item"><input type="text" class="cluster-name" value="dev" placeholder="Nome"><input type="text" class="cluster-server" value="https://10.0.0.1" placeholder="Server URL"><input type="text" class="cluster-labels" value="environment=dev" placeholder="labels"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>`;
  }
}

// ─── Gerar Cenário ───────────────────────────────────────────
function gerarCenario() {
  const nClusters   = parseInt(document.getElementById('paramClusterCount').value) || 6;
  const nApps       = parseInt(document.getElementById('paramAppCount').value) || 9;
  const tierStr     = document.getElementById('paramTierList').value;
  const catStr      = document.getElementById('paramCatList').value;
  const siglaPct    = parseInt(document.getElementById('paramSiglaPct').value) || 33;
  const siglaPrefix = document.getElementById('paramSiglaPrefix').value || 'sig-';
  const clPrefix    = document.getElementById('paramClusterPrefix').value || 'cluster-';

  const tiers = tierStr.split(',').map(s => s.trim()).filter(Boolean);
  const cats  = catStr.split(',').map(s => s.trim()).filter(Boolean);
  const nTiers = tiers.length;
  const nCats  = cats.length;

  // ── Generate clusters ──
  const clustersHtml = [];
  const clusterNames = [];
  for (let i = 0; i < nClusters; i++) {
    const name = clPrefix + (i + 1);
    clusterNames.push(name);
    const tier = tiers[i % nTiers];
    const hasSigla = Math.random() * 100 < siglaPct;
    const sigla = hasSigla ? siglaPrefix + (i + 1) : '';
    const labels = [`tier=${tier}`];
    if (hasSigla) labels.push(`sigla=${sigla}`);
    clustersHtml.push(`<div class="mock-item">
      <input type="text" class="cluster-name" value="${name}">
      <input type="text" class="cluster-server" value="https://k8s-${name}.local">
      <input type="text" class="cluster-labels" value="${labels.join(',')}">
      <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
    </div>`);
  }
  document.getElementById('mockClusters').innerHTML = clustersHtml.join('');

  // ── Generate directories ──
  const dirsHtml = [];
  const usedPaths = new Set();
  for (let i = 0; i < nApps; i++) {
    const tier  = tiers[i % nTiers];
    const cat   = cats[Math.floor(i / nTiers) % nCats];
    const appId = Math.floor(i / (nTiers * nCats)) + 1;
    const base  = `app-${String(appId).padStart(2, '0')}`;
    const path  = `apps/${tier}/${cat}/${base}`;
    if (!usedPaths.has(path)) {
      usedPaths.add(path);
      dirsHtml.push(`<div class="mock-item"><input type="text" value="${path}"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button></div>`);
    }
  }
  document.getElementById('mockDirs').innerHTML = dirsHtml.join('');

  // ── Generate a starter YAML for this scenario ──
  const genYaml = generateStarterYaml(clusterNames, tiers, cats);
  document.getElementById('yamlEditor').value = genYaml;

  // Auto-simulate
  simulate();
}

// ── Generate starter YAML ─────────────────────────────────
function generateStarterYaml(clusterNames, tiers, cats) {
  const nClusters = clusterNames.length;
  const nApps = parseInt(document.getElementById('paramAppCount').value) || 9;
  const nTiers = tiers.length;
  const nCats = cats.length;

  // Generate one element per app, cycling through clusters
  const elements = [];
  for (let i = 0; i < nApps; i++) {
    const clName = clusterNames[i % nClusters];
    const tier = tiers[i % nTiers];
    const cat = cats[Math.floor(i / nTiers) % nCats];
    const appId = Math.floor(i / (nTiers * nCats)) + 1;
    const app = `app-${String(appId).padStart(2, '0')}`;
    elements.push(`        - app: ${app}\n          cluster: ${clName}\n          tier: ${tier}\n          categoria: ${cat}\n          url: https://k8s-${clName}.local`);
  }

  return `apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: apps-parametrizado
spec:
  goTemplate: true
  generators:
  - list:
      elements:
${elements.join('\n')}
  template:
    metadata:
      name: '{{.app}}-{{.cluster}}'
      labels:
        app: '{{.app}}'
        tier: '{{.tier}}'
        categoria: '{{.categoria}}'
    spec:
      project: "my-project"
      source:
        repoURL: https://github.com/example/apps.git
        targetRevision: HEAD
        path: apps/{{.tier}}/{{.categoria}}/{{.app}}
      destination:
        server: '{{.url}}'
        namespace: '{{.cluster}}'`;
}

// ─── Simulate ───────────────────────────────────────────────
async function simulate() {
  const yamlContent = document.getElementById('yamlEditor').value;
  if (!yamlContent.trim()) return;

  const loading = document.getElementById('loading');
  loading.style.display = 'flex';

  try {
    const mockClusters = [];
    document.querySelectorAll('#mockClusters .mock-item').forEach(item => {
      const name = item.querySelector('.cluster-name')?.value;
      const server = item.querySelector('.cluster-server')?.value;
      const labelsStr = item.querySelector('.cluster-labels')?.value || '';
      const labels = {};
      labelsStr.split(',').filter(Boolean).forEach(kv => {
        const [k, v] = kv.split('=');
        if (k) labels[k.trim()] = (v || 'true').trim();
      });
      if (name) {
        mockClusters.push({
          name, nameNormalized: name.replace(/[^a-zA-Z0-9-]/g, '-'),
          server: server || 'https://kubernetes.default.svc',
          project: 'default',
          labels: { 'argocd.argoproj.io/secret-type': 'cluster', ...labels },
          annotations: {},
        });
      }
    });

    const mockDirectories = [];
    document.querySelectorAll('#mockDirs .mock-item input').forEach(input => {
      const pathVal = input.value.trim();
      if (pathVal) {
        const segments = pathVal.split('/');
        mockDirectories.push({ path: pathVal, basename: segments[segments.length - 1], segments });
      }
    });

    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yaml: yamlContent,
        mockClusters: mockClusters.length ? mockClusters : undefined,
        mockDirectories: mockDirectories.length ? mockDirectories : undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      showError(err.error || `HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    showResults(data, mockClusters);
  } catch (e) {
    showError(e.message);
  } finally {
    loading.style.display = 'none';
  }
}

// ─── Show Results ───────────────────────────────────────────
function showResults(data, clusters) {
  const results = document.getElementById('results');
  const ri = document.getElementById('resultsInner');
  if (!ri) return;

  ri.innerHTML = `
    <div class="results-header">
      <h3>📊 Resultados</h3>
      <div class="results-meta" id="resultsMeta"></div>
    </div>
    <div class="tabs">
      <button class="tab" data-tab="distribution" onclick="switchTab('distribution')">📈 Distribuição</button>
      <button class="tab active" data-tab="parameters" onclick="switchTab('parameters')">📋 Parâmetros</button>
      <button class="tab" data-tab="rendered" onclick="switchTab('rendered')">📄 Templates</button>
      <button class="tab" data-tab="visual" onclick="switchTab('visual')">🌳 Árvore</button>
    </div>
    <div id="tab-distribution" class="tab-content"><div id="distContent"></div></div>
    <div id="tab-parameters" class="tab-content active"><div class="table-wrapper"><table id="paramsTable"><tbody></tbody></table></div></div>
    <div id="tab-rendered" class="tab-content"><div id="renderedContent"></div></div>
    <div id="tab-visual" class="tab-content"><div id="visualContent"></div></div>
  `;

  results.style.display = 'block';
  const meta = document.getElementById('resultsMeta');
  const badges = data.types.map(t => `<span class="gen-badge ${t}">${t}</span>`).join(' ');
  meta.innerHTML = `${badges} <span style="margin-left:0.5rem">${data.count} apps geradas</span>`;

  renderParamsTable(data.parameters);
  renderRenderedTemplates(data.renderedTemplates || data.renderedYaml);
  renderVisualization(data);

  // Distribution viz
  renderDistribution(data, clusters);

  // Make "Distribuição" the default tab
  switchTab('distribution');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Render Distribution ──────────────────────────────────
function renderDistribution(data, clusters) {
  const container = document.getElementById('distContent');
  if (!container) return;

  const params = data.parameters;
  if (!params || !params.length) {
    container.innerHTML = '<p class="text-muted">Sem dados para visualizar.</p>';
    return;
  }

  // Group apps by cluster
  const clusterKey = params[0].name !== undefined ? 'name' :
                     params[0].cluster !== undefined ? 'cluster' :
                     params[0].server !== undefined ? 'server' : null;
  if (!clusterKey) {
    container.innerHTML = '<p class="text-muted">Dados não têm identificador de cluster.</p>';
    return;
  }

  const groups = {};
  params.forEach(p => {
    const key = p[clusterKey] || 'unknown';
    if (!groups[key]) groups[key] = { apps: [], params: p };
    groups[key].apps.push(p);
  });

  const clusterEntries = Object.entries(groups);

  // Build SVG visualization
  const svgW = 780, svgH = 420;
  const padX = 60, padY = 40;
  const bubbleAreaW = svgW - padX * 2;
  const bubbleAreaH = svgH - padY * 2;

  // Calculate bubble sizes
  const maxApps = Math.max(...clusterEntries.map(([, g]) => g.apps.length), 1);
  const minR = 25, maxR = 90;
  const clusterRadii = {};
  clusterEntries.forEach(([name]) => {
    const count = groups[name].apps.length;
    clusterRadii[name] = minR + (count / maxApps) * (maxR - minR);
  });

  // Simple circular layout
  const totalR = clusterEntries.reduce((s, [n]) => s + clusterRadii[n] * 2, 0);
  const spacing = Math.max(20, (bubbleAreaW - totalR) / (clusterEntries.length + 1));
  let cx = padX + spacing;

  // Tier colors
  const tierColors = { tier1: '#58a6ff', tier2: '#3fb950', tier3: '#d29922', tier4: '#a371f7' };
  const catColors = { des: '#8b949e', dev: '#8b949e', hom: '#58a6ff', stg: '#d29922', prd: '#f85149' };

  let svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="background:var(--surface2);border-radius:8px">
    <text x="${svgW/2}" y="20" text-anchor="middle" fill="var(--text-muted)" font-size="11">Distribuição de Aplicações por Cluster</text>`;

  clusterEntries.forEach(([name, group]) => {
    const r = clusterRadii[name];
    svg += `<circle cx="${cx}" cy="${bubbleAreaH/2 + padY}" r="${r}" fill="rgba(88,166,255,0.08)" stroke="rgba(88,166,255,0.3)" stroke-width="1.5"/>`;

    // Draw apps as dots
    const apps = group.apps;
    const count = apps.length;
    const angleStep = (2 * Math.PI) / Math.max(count, 1);
    const dotR = Math.min(6, r * 0.25);

    apps.forEach((app, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const dist = r * 0.55;
      const dx = cx + Math.cos(angle) * dist;
      const dy = (bubbleAreaH/2 + padY) + Math.sin(angle) * dist;

      // Color by tier if available
      const tier = app.tier || app['values.tier'] || app['metadata.labels.tier'] || '';
      const color = tierColors[tier] || '#58a6ff';

      svg += `<circle cx="${dx}" cy="${dy}" r="${dotR}" fill="${color}" opacity="0.85">
        <title>${app.cluster || app.name || ''}: ${app['path.basename'] || app.app || 'app'}</title>
      </circle>`;
    });

    // Cluster label
    svg += `<text x="${cx}" y="${bubbleAreaH/2 + padY + r + 14}" text-anchor="middle" fill="var(--text)" font-size="10" font-weight="600">${name}</text>`;
    svg += `<text x="${cx}" y="${bubbleAreaH/2 + padY + r + 26}" text-anchor="middle" fill="var(--text-muted)" font-size="9">${count} apps</text>`;

    cx += r * 2 + spacing;
  });

  // Legend
  const legendX = 10, legendY = svgH - 30;
  const legendColors = Object.entries(tierColors).filter(([k]) => tiersForLegend.includes(k));
  // Just show any 3 tiers
  let li = 0;
  Object.entries(tierColors).slice(0, 3).forEach(([tier, color]) => {
    svg += `<circle cx="${legendX + li * 80}" cy="${legendY}" r="4" fill="${color}"/>`;
    svg += `<text x="${legendX + li * 80 + 8}" y="${legendY + 3}" fill="var(--text-muted)" font-size="9">${tier}</text>`;
    li++;
  });
  if (Object.entries(catColors).length > 0 && false) {} // keep cats for later

  svg += '</svg>';

  // Detail table below viz
  let tableHtml = '<div style="overflow-x:auto;margin-top:0.75rem"><table><thead><tr><th>Cluster</th><th>Apps</th><th>Tier</th><th>Sigla</th><th>Apps</th></tr></thead><tbody>';
  clusterEntries.forEach(([name, group]) => {
    const p = group.params;
    const tier = p['metadata.labels.tier'] || p.tier || p['values.tier'] || '-';
    const sigla = p['metadata.labels.sigla'] || p.sigla || '-';
    const appNames = group.apps.map(a => a['path.basename'] || a.app || a.cluster || a.name).filter(Boolean).join(', ');
    tableHtml += `<tr><td><code>${name}</code></td><td>${group.apps.length}</td><td>${tier}</td><td>${sigla}</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${appNames}</td></tr>`;
  });
  tableHtml += '</tbody></table></div>';

  container.innerHTML = svg + tableHtml;
}
const tiersForLegend = ['tier1', 'tier2', 'tier3'];

// ─── Render Parameters Table ──────────────────────────────
function renderParamsTable(params) {
  const container = document.getElementById('paramsTable');
  if (!container) return;
  if (!params.length) { container.innerHTML = '<p class="text-muted">Nenhum parâmetro.</p>'; return; }

  const allKeys = new Set();
  const prio = ['name','cluster','server','tier','url','path.basename','path.path','values.tier','values.categoria','values.sigla','sigla','metadata.labels.tier','metadata.labels.sigla'];
  prio.forEach(k => { if (params.some(p => p[k] !== undefined)) allKeys.add(k); });
  params.forEach(p => Object.keys(p).forEach(k => { if (!allKeys.has(k) && !k.startsWith('_')) allKeys.add(k); }));
  const keys = Array.from(allKeys);

  let html = '<div style="overflow-x:auto"><table><thead><tr>';
  keys.forEach(k => { html += `<th>${esc(k)}</th>`; });
  html += '</tr></thead><tbody>';
  params.forEach((p, i) => {
    html += '<tr>';
    keys.forEach(k => {
      const v = p[k];
      const d = v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const hl = (k === 'sigla' || k.includes('tier') || k === 'metadata.labels.sigla' || k === 'metadata.labels.tier') ? ' class="hl-cell"' : '';
      html += `<td${hl}><code>${esc(d)}</code></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ─── Render Templates ────────────────────────────────────
function renderRenderedTemplates(rendered) {
  const container = document.getElementById('renderedContent');
  if (!container) return;
  if (!rendered || !rendered.length) { container.innerHTML = '<p class="text-muted">Nenhum template.</p>'; return; }

  let html = '';
  rendered.forEach((item, i) => {
    const appName = item.rendered?.metadata?.name || item.params?.cluster || item.params?.name || `App #${i+1}`;
    const yamlStr = item.renderedYaml || (() => {
      try { return typeof yaml !== 'undefined' && yaml.dump ? yaml.dump(item.rendered) : JSON.stringify(item.rendered, null, 2); }
      catch(e) { return JSON.stringify(item.rendered, null, 2); }
    })();
    html += `<div class="rendered-card">
      <div class="card-header"><span class="card-title">${esc(appName)}</span><span class="card-meta">#${i+1}</span></div>
      <pre>${esc(yamlStr)}</pre>
    </div>`;
  });
  container.innerHTML = html;
}

// ─── Render Visualization Tree ───────────────────────────
async function renderVisualization(data) {
  const container = document.getElementById('visualContent');
  if (!container) return;
  container.innerHTML = '<div class="generator-tree"></div>';
  const tree = container.querySelector('.generator-tree');
  try {
    // Parse YAML server-side to avoid CDN dependency
    const res = await fetch('/api/parse-yaml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: document.getElementById('yamlEditor').value })
    });
    if (!res.ok) { tree.innerHTML = '<p style="color:var(--text-muted)">Erro ao processar YAML.</p>'; return; }
    const parsed = await res.json();
    const gens = parsed.generators || [];
    let html = '<div style="text-align:center;margin-bottom:1rem;font-size:0.8rem;color:var(--text-muted)">'
      + `🔄 <strong>${data.count}</strong> apps via <strong>${data.types.join(', ')}</strong></div>`;
    html += genTree(gens, data.parameters);
    tree.innerHTML = html;
  } catch(e) { tree.innerHTML = `<p style="color:var(--text-muted)">Erro: ${esc(e.message)}</p>`; }
}

function genTree(gens, params, depth = 0) {
  let html = '';
  gens.forEach(gen => {
    const type = Object.keys(gen)[0], cfg = gen[type];
    html += `<div class="generator-node" style="margin-left:${depth*1.5}rem"><div class="node-header">
      <span class="gen-badge ${type}">${type}</span>
      ${type==='list' ? `<span>${(cfg.elements||[]).length} elementos</span>` : ''}
      ${type==='clusters' ? `<span>${params.length} clusters</span>` : ''}
      ${type==='git' && cfg.directories ? `<span>${cfg.directories.filter(d=>!d.exclude).length} includes</span>` : ''}
      ${type==='matrix'||type==='merge' ? `<span>${(cfg.generators||[]).length} child</span>` : ''}
    </div>`;
    if (type === 'matrix' || type === 'merge') html += genTree(cfg.generators||[], params, depth+1);
    if (type === 'list' && cfg.elements) {
      html += '<div class="node-body"><table><thead><tr>';
      const ks = Object.keys(cfg.elements[0]||{});
      ks.forEach(k => html += `<th>${esc(k)}</th>`); html += '</tr></thead><tbody>';
      cfg.elements.forEach(el => { html += '<tr>'; ks.forEach(k => html += `<td><code>${esc(String(el[k]||''))}</code></td>`); html += '</tr>'; });
      html += '</tbody></table></div>';
    }
    if (type === 'clusters') {
      const sel = cfg.selector||{};
      html += '<div class="node-body">';
      if (sel.matchLabels) html += `<div style="font-size:0.75rem;color:var(--text-muted)">Selector: ${Object.entries(sel.matchLabels).map(([k,v])=>`${k}=${v}`).join(', ')||'(todos)'}</div>`;
      html += '</div>';
    }
    if (type === 'git' && cfg.directories) {
      html += '<div class="node-body"><div style="font-size:0.75rem">';
      cfg.directories.forEach(d => html += `<div>${d.exclude?'🚫':'📂'} ${esc(d.path)}${d.exclude?' <span style="color:var(--danger)">(excluído)</span>':''}</div>`);
      html += '</div></div>';
    }
    html += '</div>';
  });
  return html;
}

// ─── Tab switching ──────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const btn = document.querySelector(`[data-tab="${tabName}"]`);
  const pane = document.getElementById(`tab-${tabName}`);
  if (btn) btn.classList.add('active');
  if (pane) pane.classList.add('active');
}

// ─── Helpers ─────────────────────────────────────────────────
function esc(str) { if (str==null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showError(msg) {
  const results = document.getElementById('results');
  const ri = document.getElementById('resultsInner');
  results.style.display = 'block';
  const content = `<div style="background:rgba(248,81,73,0.1);border:1px solid var(--danger);border-radius:8px;padding:1rem">
    <h3 style="color:var(--danger);margin-bottom:0.5rem">❌ Erro</h3>
    <pre style="font-family:var(--font-mono);font-size:0.8rem;white-space:pre-wrap">${esc(msg)}</pre></div>`;
  if (ri) ri.innerHTML = content; else results.innerHTML = content;
  results.scrollIntoView({ behavior:'smooth', block:'start' });
}

function formatYaml() {
  try {
    if (typeof yaml === 'undefined') { alert('Biblioteca YAML não carregada.'); return; }
    document.getElementById('yamlEditor').value = yaml.dump(yaml.load(document.getElementById('yamlEditor').value), { indent:2, lineWidth:-1, noRefs:true, sortKeys:false });
  } catch(e) { alert('Erro: '+e.message); }
}

async function saveCurrentExample() {
  const name = prompt('Nome do exemplo:');
  if (!name) return;
  try {
    const res = await fetch('/api/examples', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, content:document.getElementById('yamlEditor').value}) });
    if (res.ok) { alert('Salvo!'); loadExamples(); } else alert('Erro ao salvar');
  } catch(e) { alert('Erro: '+e.message); }
}

function addMockCluster() {
  const c = document.getElementById('mockClusters');
  const d = document.createElement('div'); d.className = 'mock-item';
  d.innerHTML = `<input type="text" class="cluster-name" value="cluster-${c.children.length+1}"><input type="text" class="cluster-server" value="https://kubernetes.default.svc"><input type="text" class="cluster-labels" value=""><button class="btn-icon" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(d);
}

function addMockDir() {
  const c = document.getElementById('mockDirs');
  const d = document.createElement('div'); d.className = 'mock-item';
  d.innerHTML = `<input type="text" value="new-dir/app"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(d);
}

document.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey) && e.key==='Enter') simulate(); });

// Init: load a tier example on startup
updateMockDataForExample('tier');
gerarCenario();
