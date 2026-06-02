/* ─── Frontend JS — ArgoCD Generator Simulator ────────────── */

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
        // Also update mock clusters and dirs based on the selected example
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

// ─── Update mock data based on selected example ─────────────
function updateMockDataForExample(exampleName) {
  if (exampleName.includes('tier') || exampleName.includes('sigla')) {
    // Set tier-based clusters
    document.getElementById('mockClusters').innerHTML = `
      <div class="mock-item">
        <input type="text" class="cluster-name" value="cluster-a" placeholder="Nome">
        <input type="text" class="cluster-server" value="https://k8s-cluster-a.local" placeholder="Server URL">
        <input type="text" class="cluster-labels" value="tier=tier1,sigla=xyz" placeholder="labels (k=v,k=v)">
        <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
      </div>
      <div class="mock-item">
        <input type="text" class="cluster-name" value="cluster-b" placeholder="Nome">
        <input type="text" class="cluster-server" value="https://k8s-cluster-b.local" placeholder="Server URL">
        <input type="text" class="cluster-labels" value="tier=tier2" placeholder="labels (k=v,k=v)">
        <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
      </div>
      <div class="mock-item">
        <input type="text" class="cluster-name" value="cluster-c" placeholder="Nome">
        <input type="text" class="cluster-server" value="https://k8s-cluster-c.local" placeholder="Server URL">
        <input type="text" class="cluster-labels" value="tier=tier3" placeholder="labels (k=v,k=v)">
        <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
      </div>
      <div class="mock-item">
        <input type="text" class="cluster-name" value="cluster-d" placeholder="Nome">
        <input type="text" class="cluster-server" value="https://k8s-cluster-d.local" placeholder="Server URL">
        <input type="text" class="cluster-labels" value="tier=tier1,sigla=abc" placeholder="labels (k=v,k=v)">
        <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
      </div>`;
  } else {
    // Default clusters
    document.getElementById('mockClusters').innerHTML = `
      <div class="mock-item">
        <input type="text" class="cluster-name" value="staging" placeholder="Nome">
        <input type="text" class="cluster-server" value="https://1.2.3.4" placeholder="Server URL">
        <input type="text" class="cluster-labels" value="environment=staging" placeholder="labels (k=v,k=v)">
        <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
      </div>
      <div class="mock-item">
        <input type="text" class="cluster-name" value="production" placeholder="Nome">
        <input type="text" class="cluster-server" value="https://2.4.6.8" placeholder="Server URL">
        <input type="text" class="cluster-labels" value="environment=prod" placeholder="labels (k=v,k=v)">
        <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
      </div>
      <div class="mock-item">
        <input type="text" class="cluster-name" value="dev" placeholder="Nome">
        <input type="text" class="cluster-server" value="https://10.0.0.1" placeholder="Server URL">
        <input type="text" class="cluster-labels" value="environment=dev" placeholder="labels (k=v,k=v)">
        <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
      </div>`;
  }
}

// ─── Simulate ───────────────────────────────────────────────
async function simulate() {
  const yamlContent = document.getElementById('yamlEditor').value;
  if (!yamlContent.trim()) return;

  const loading = document.getElementById('loading');
  loading.style.display = 'flex';

  try {
    // Gather mock clusters
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
          name,
          nameNormalized: name.replace(/[^a-zA-Z0-9-]/g, '-'),
          server: server || 'https://kubernetes.default.svc',
          project: 'default',
          labels: { 'argocd.argoproj.io/secret-type': 'cluster', ...labels },
          annotations: {},
        });
      }
    });

    // Gather mock directories
    const mockDirectories = [];
    document.querySelectorAll('#mockDirs .mock-item input').forEach(input => {
      const pathVal = input.value.trim();
      if (pathVal) {
        const segments = pathVal.split('/');
        mockDirectories.push({
          path: pathVal,
          basename: segments[segments.length - 1],
          segments,
        });
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
    showResults(data);
  } catch (e) {
    showError(e.message);
  } finally {
    loading.style.display = 'none';
  }
}

// ─── Show Results ───────────────────────────────────────────
function showResults(data) {
  const results = document.getElementById('results');
  const resultsInner = document.getElementById('resultsInner');
  if (!resultsInner) return;

  // Ensure resultsInner has the tab structure
  resultsInner.innerHTML = `
    <div class="results-header">
      <h3>📊 Resultados da Simulação</h3>
      <div class="results-meta" id="resultsMeta"></div>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="parameters" onclick="switchTab('parameters')">Parâmetros Gerados</button>
      <button class="tab" data-tab="rendered" onclick="switchTab('rendered')">Templates Renderizados</button>
      <button class="tab" data-tab="visual" onclick="switchTab('visual')">Visualização</button>
    </div>
    <div id="tab-parameters" class="tab-content active">
      <div class="table-wrapper"><table id="paramsTable"><tbody></tbody></table></div>
    </div>
    <div id="tab-rendered" class="tab-content">
      <div id="renderedContent"></div>
    </div>
    <div id="tab-visual" class="tab-content">
      <div id="visualContent"></div>
    </div>
  `;

  results.style.display = 'block';

  // Meta
  const meta = document.getElementById('resultsMeta');
  const badges = data.types.map(t => `<span class="gen-badge ${t}">${t}</span>`).join(' ');
  meta.innerHTML = `${badges} <span style="margin-left:0.5rem">${data.count} aplicações geradas</span>`;

  // Parameters tab
  renderParamsTable(data.parameters);

  // Rendered Templates tab
  renderRenderedTemplates(data.renderedTemplates);

  // Visual tab
  renderVisualization(data);

  // Auto-show first tab
  switchTab('parameters');

  // Scroll
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderParamsTable(params) {
  const container = document.getElementById('paramsTable');
  if (!container) return;

  if (!params.length) {
    container.innerHTML = '<p class="text-muted">Nenhum parâmetro gerado.</p>';
    return;
  }

  // Collect keys, prioritize important ones
  const allKeys = new Set();
  const priorityKeys = ['name', 'server', 'tier', 'cluster', 'url', 'path.basename', 'path.path',
    'values.tier', 'values.categoria', 'values.sigla', 'sigla',
    'metadata.labels.tier', 'metadata.labels.sigla'];

  // Add priority keys first if they exist
  priorityKeys.forEach(k => {
    if (params.some(p => p[k] !== undefined)) allKeys.add(k);
  });
  // Then add remaining keys
  params.forEach(p => Object.keys(p).forEach(k => {
    if (!allKeys.has(k) && !k.startsWith('_')) allKeys.add(k);
  }));
  const keys = Array.from(allKeys);

  let html = '<div style="overflow-x:auto"><table><thead><tr>';
  keys.forEach(k => { html += `<th>${escapeHtml(k)}</th>`; });
  html += '</tr></thead><tbody>';
  params.forEach((p, i) => {
    html += '<tr>';
    keys.forEach(k => {
      const val = p[k];
      const display = val === undefined ? '' :
        typeof val === 'object' ? JSON.stringify(val) : String(val);
      // Highlight sigla/tier columns
      const cls = (k === 'sigla' || k.includes('tier') || k === 'metadata.labels.sigla' || k === 'metadata.labels.tier') ? ' class="hl-cell"' : '';
      html += `<td${cls} title="${escapeHtml(k)}"><code>${escapeHtml(display)}</code></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function renderRenderedTemplates(rendered) {
  const container = document.getElementById('renderedContent');
  if (!container) return;

  if (!rendered || !rendered.length) {
    container.innerHTML = '<p class="text-muted">Nenhum template para renderizar.</p>';
    return;
  }

  let html = '';
  rendered.forEach((item, i) => {
    const appName = item.rendered?.metadata?.name || `App #${i + 1}`;
    html += `<div class="rendered-card">
      <div class="card-header">
        <span class="card-title">${escapeHtml(appName)}</span>
        <span class="card-meta">#${i + 1}</span>
      </div>
      <pre>${escapeHtml(yaml.dump(item.rendered))}</pre>
    </div>`;
  });
  container.innerHTML = html;
}

function renderVisualization(data) {
  const container = document.getElementById('visualContent');
  if (!container) return;

  container.innerHTML = '<div class="generator-tree"></div>';
  const tree = container.querySelector('.generator-tree');

  try {
    const doc = yaml.load(document.getElementById('yamlEditor').value);
    const generators = doc.spec.generators || [];

    let html = '<div style="text-align:center;margin-bottom:1rem;font-size:0.8rem;color:var(--text-muted)">';
    html += `🔄 <strong>${data.count}</strong> aplicações geradas via <strong>${data.types.join(', ')}</strong>`;
    html += '</div>';

    html += renderGeneratorTree(generators, data.parameters);
    tree.innerHTML = html;
  } catch (e) {
    tree.innerHTML = `<p style="color:var(--text-muted)">Erro ao gerar visualização: ${e.message}</p>`;
  }
}

function renderGeneratorTree(generators, allParams, depth = 0) {
  let html = '';
  generators.forEach((gen, idx) => {
    const type = Object.keys(gen)[0];
    const config = gen[type];

    html += `<div class="generator-node" style="margin-left:${depth * 1.5}rem">`;
    html += `<div class="node-header">
      <span class="gen-badge ${type}">${type}</span>
      ${type === 'list' ? `<span>${(config.elements || []).length} elementos</span>` : ''}
      ${type === 'clusters' ? `<span>${allParams.length} clusters match</span>` : ''}
      ${type === 'git' && config.directories ? `<span>${config.directories.filter(d => !d.exclude).length} includes, ${config.directories.filter(d => d.exclude).length} excludes</span>` : ''}
      ${type === 'matrix' || type === 'merge' ? `<span>${(config.generators || []).length} child generators</span>` : ''}
    </div>`;

    if (type === 'matrix' || type === 'merge') {
      html += renderGeneratorTree(config.generators || [], allParams, depth + 1);
    }

    if (type === 'list' && config.elements) {
      html += `<div class="node-body"><table><thead><tr>`;
      const keys = Object.keys(config.elements[0] || {});
      keys.forEach(k => { html += `<th>${escapeHtml(k)}</th>`; });
      html += '</tr></thead><tbody>';
      config.elements.forEach(el => {
        html += '<tr>';
        keys.forEach(k => { html += `<td><code>${escapeHtml(String(el[k] || ''))}</code></td>`; });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    if (type === 'clusters') {
      const selector = config.selector || {};
      html += '<div class="node-body">';
      if (selector.matchLabels) {
        html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem">Selector: ';
        html += Object.entries(selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(', ') || '(todos os clusters)';
        html += '</div>';
      }
      html += '</div>';
    }

    if (type === 'git' && config.directories) {
      html += '<div class="node-body">';
      html += '<div style="font-size:0.75rem">';
      config.directories.forEach(d => {
        const icon = d.exclude ? '🚫' : '📂';
        html += `<div>${icon} ${escapeHtml(d.path)} ${d.exclude ? '<span style="color:var(--danger)">(excluído)</span>' : ''}</div>`;
      });
      html += '</div></div>';
    }

    html += '</div>';
  });
  return html;
}

// ─── Tab switching ───────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
  const tabContent = document.getElementById(`tab-${tabName}`);
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');
}

// ─── Helpers ─────────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  const results = document.getElementById('results');
  const resultsInner = document.getElementById('resultsInner');
  results.style.display = 'block';

  if (resultsInner) {
    // Keep the tab structure intact, just fill params tab with error
    resultsInner.innerHTML = `
      <div class="results-header">
        <h3>📊 Resultados da Simulação</h3>
        <div class="results-meta"><span class="gen-badge list" style="background:rgba(248,81,73,0.2);color:var(--danger)">erro</span></div>
      </div>
      <div style="background:rgba(248,81,73,0.1);border:1px solid var(--danger);border-radius:8px;padding:1rem;margin:0.5rem 0">
        <h3 style="color:var(--danger);margin-bottom:0.5rem">❌ Erro na Simulação</h3>
        <pre style="font-family:var(--font-mono);font-size:0.8rem;white-space:pre-wrap">${escapeHtml(msg)}</pre>
      </div>`;
  } else {
    results.innerHTML = `
      <div style="background:rgba(248,81,73,0.1);border:1px solid var(--danger);border-radius:8px;padding:1rem;margin:1rem 0">
        <h3 style="color:var(--danger);margin-bottom:0.5rem">❌ Erro na Simulação</h3>
        <pre style="font-family:var(--font-mono);font-size:0.8rem;white-space:pre-wrap">${escapeHtml(msg)}</pre>
      </div>`;
  }

  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Format YAML ─────────────────────────────────────────────
function formatYaml() {
  try {
    const doc = yaml.load(document.getElementById('yamlEditor').value);
    document.getElementById('yamlEditor').value = yaml.dump(doc, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false });
  } catch (e) {
    alert('Erro ao formatar YAML: ' + e.message);
  }
}

// ─── Save example ────────────────────────────────────────────
async function saveCurrentExample() {
  const name = prompt('Nome do exemplo:');
  if (!name) return;
  try {
    const res = await fetch('/api/examples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: document.getElementById('yamlEditor').value }),
    });
    if (res.ok) {
      alert('Exemplo salvo!');
      loadExamples();
    } else {
      alert('Erro ao salvar');
    }
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

// ─── Mock data management ────────────────────────────────────
function addMockCluster() {
  const container = document.getElementById('mockClusters');
  const div = document.createElement('div');
  div.className = 'mock-item';
  div.innerHTML = `
    <input type="text" class="cluster-name" value="cluster-${container.children.length + 1}" placeholder="Nome">
    <input type="text" class="cluster-server" value="https://kubernetes.default.svc" placeholder="Server URL">
    <input type="text" class="cluster-labels" value="" placeholder="labels (k=v,k=v)">
    <button class="btn-icon" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(div);
}

function addMockDir() {
  const container = document.getElementById('mockDirs');
  const div = document.createElement('div');
  div.className = 'mock-item';
  div.innerHTML = `<input type="text" value="new-dir/app" placeholder="path"><button class="btn-icon" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(div);
}

// ─── Keyboard shortcut ───────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    simulate();
  }
});
