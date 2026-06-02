/* ─── Frontend JS ───────────────────────────────────────────── */

// Load examples
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
        simulate();
      };
      list.appendChild(el);
    });
  } catch (e) {
    document.getElementById('examplesList').innerHTML = '<span class="loading">Erro ao carregar exemplos</span>';
  }
}
loadExamples();

// Simulate
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

// Results display
function showResults(data) {
  const results = document.getElementById('results');
  results.style.display = 'block';

  // Meta
  const meta = document.getElementById('resultsMeta');
  meta.innerHTML = `
    <span class="gen-badge ${data.types[0]}">${data.types.join(', ')}</span>
    <span style="margin-left:0.5rem">${data.count} aplicações geradas</span>
  `;

  // Parameters tab
  renderParamsTable(data.parameters);

  // Rendered Templates tab
  renderRenderedTemplates(data.renderedTemplates);

  // Visual tab
  renderVisualization(data);

  // Auto-show first tab
  switchTab('parameters');

  // Scroll to results
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderParamsTable(params) {
  const container = document.getElementById('paramsTable');

  if (!params.length) {
    container.innerHTML = '<p class="text-muted">Nenhum parâmetro gerado.</p>';
    return;
  }

  // Collect all unique keys
  const allKeys = new Set();
  params.forEach(p => Object.keys(p).forEach(k => allKeys.add(k)));
  const keys = Array.from(allKeys).filter(k => !k.startsWith('_'));

  let html = '<table><thead><tr>';
  keys.forEach(k => { html += `<th>${escapeHtml(k)}</th>`; });
  html += '</tr></thead><tbody>';
  params.forEach((p, i) => {
    html += '<tr>';
    keys.forEach(k => {
      const val = p[k];
      const display = val === undefined ? '' :
        typeof val === 'object' ? JSON.stringify(val) : String(val);
      html += `<td title="${escapeHtml(k)}"><code>${escapeHtml(display)}</code></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderRenderedTemplates(rendered) {
  const container = document.getElementById('renderedContent');

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
  container.innerHTML = '<div class="generator-tree"></div>';
  const tree = container.querySelector('.generator-tree');

  // Re-parse the YAML to get generator structure
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
    const indent = '  '.repeat(depth);

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

// Tab switching
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// Helpers
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
  results.style.display = 'block';
  results.innerHTML = `
    <div style="background:rgba(248,81,73,0.1);border:1px solid var(--danger);border-radius:8px;padding:1rem;margin:1rem 0">
      <h3 style="color:var(--danger);margin-bottom:0.5rem">❌ Erro na Simulação</h3>
      <pre style="font-family:var(--font-mono);font-size:0.8rem;white-space:pre-wrap">${escapeHtml(msg)}</pre>
    </div>`;
}

// Format YAML
function formatYaml() {
  try {
    const doc = yaml.load(document.getElementById('yamlEditor').value);
    document.getElementById('yamlEditor').value = yaml.dump(doc, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false });
  } catch (e) {
    alert('Erro ao formatar YAML: ' + e.message);
  }
}

// Save current as example
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

// Mock cluster management
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

// Keyboard shortcut: Ctrl+Enter to simulate
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    simulate();
  }
});

// Auto-load on startup
setTimeout(simulate, 500);
