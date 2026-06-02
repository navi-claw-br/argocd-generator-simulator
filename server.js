const express = require('express');
const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helper: simple Go-template renderer ────────────────────────────
function renderGoTemplate(tmpl, params) {
  // This implements common Go template patterns used by ArgoCD ApplicationSets
  // {{.field}} — simple field access
  // {{index .path.segments n}} — array index
  // {{.path.basename}} / {{.path.path}} / {{.path.basenameNormalized}}
  // {{.name}} {{.server}} {{.metadata.labels.key}} etc.
  // {{.|toJson}} / {{.|mustToPrettyJson}}
  // {{if .field}}...{{end}} — conditionals
  // {{range .list}}...{{end}} — iteration

  try {
    let result = tmpl;

    // Handle conditional blocks {{if ...}}...{{end}}
    // Simple if/not pattern for presence checks
    result = result.replace(/\{\{-?\s*if\s+(\.\S+)\s*\}\}([\s\S]*?)\{\{-?\s*end\s*-?\}\}/g, (match, field, content) => {
      const value = resolveField(field, params);
      if (value && value !== '' && value !== false && value !== 'false') {
        return renderGoTemplate(content.trim(), params);
      }
      return '';
    });

    // Handle range blocks {{range .list}}...{{end}} - pass through for now as parameter will resolve
    // Actually, range requires array context so we just resolve the inner content
    result = result.replace(/\{\{-?\s*range\s+\.(\S+)\s*-?\}\}([\s\S]*?)\{\{-?\s*end\s*-?\}\}/g, (match, field, content) => {
      const items = resolveField('.' + field, params);
      if (Array.isArray(items)) {
        return items.map(item => {
          // For each item, create merged context: params + item fields
          const ctx = { ...params };
          // Map item fields to top-level in the inner context
          Object.keys(item).forEach(k => { ctx[k] = item[k]; });
          return renderGoTemplate(content.trim(), ctx);
        }).join('\n');
      }
      return '';
    });

    // Handle {{index .path.segments n}} — numeric index
    result = result.replace(/\{\{-?\s*index\s+(\.\S+)\s+(\d+)\s*-?\}\}/g, (match, arrExpr, idx) => {
      const arr = resolveField(arrExpr, params);
      if (Array.isArray(arr)) return String(arr[parseInt(idx)] ?? '');
      return '';
    });

    // Handle {{index .obj "key"}} — string key index
    result = result.replace(/\{\{-?\s*index\s+(\.\S+)\s+"([^"]+)"\s*-?\}\}/g, (match, objExpr, key) => {
      const obj = resolveField(objExpr, params);
      if (obj && typeof obj === 'object') {
        const val = obj[key];
        if (val === undefined) return '<no value>';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      }
      return '';
    });

    // Handle {{.field | toJson}} or {{.field | mustToPrettyJson}}
    result = result.replace(/\{\{-?\s*(\.\S+)\s*\|\s*(mustToPrettyJson|toJson)\s*-?\}\}/g, (match, field, filter) => {
      const val = resolveField(field, params);
      if (val === undefined) return '<no value>';
      const jsonStr = JSON.stringify(val, null, filter === 'mustToPrettyJson' ? 2 : 0);
      return jsonStr;
    });

    // Handle piped json from a resolved value
    result = result.replace(/\{\{-?\s*(\.\S+)\s*\|\s*toJson\s*-?\}\}/g, (match, field) => {
      const val = resolveField(field, params);
      if (val === undefined) return '<no value>';
      return JSON.stringify(val);
    });

    // Handle simple field references {{.field}} and nested {{.field.subfield}}
    result = result.replace(/\{\{-?\s*(\.\S+?)\s*-?\}\}/g, (match, field) => {
      const val = resolveField(field, params);
      if (val === undefined) return `<no value>`;
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });

    return result;
  } catch (e) {
    return `<error: ${e.message}>`;
  }
}

function resolveField(expr, params) {
  // expr like ".path.basename" or ".name" or ".metadata.labels.key" or ".path.segments"
  const parts = expr.replace(/^\./, '').split('.');
  let current = params;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    if (part.includes('[')) {
      const [name, rest] = part.split('[');
      current = current[name];
      const idx = parseInt(rest.replace(']', ''));
      if (Array.isArray(current)) current = current[idx];
      else return undefined;
    } else {
      current = current[part];
    }
  }
  return current;
}

// ─── Generator Simulators ──────────────────────────────────────────

function simulateListGenerator(config) {
  const elements = config.elements || [];
  const elementsYaml = config.elementsYaml;
  if (elementsYaml) {
    try {
      // elementsYaml is a YAML/JSON string, possibly a Go template reference
      if (typeof elementsYaml === 'string' && !elementsYaml.startsWith('{{')) {
        const parsed = yaml.load(elementsYaml);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      return [{ error: `Invalid elementsYaml: ${e.message}` }];
    }
  }
  return elements;
}

function simulateClusterGenerator(config, extraContext = {}) {
  const clusters = extraContext._mockClusters || [
    { name: 'staging', nameNormalized: 'staging', server: 'https://1.2.3.4', project: 'default', labels: { environment: 'staging', 'argocd.argoproj.io/secret-type': 'cluster' }, annotations: {} },
    { name: 'production', nameNormalized: 'production', server: 'https://2.4.6.8', project: 'default', labels: { environment: 'prod', 'argocd.argoproj.io/secret-type': 'cluster' }, annotations: {} },
    { name: 'dev', nameNormalized: 'dev', server: 'https://10.0.0.1', project: 'default', labels: { environment: 'dev', 'argocd.argoproj.io/secret-type': 'cluster' }, annotations: {} },
    { name: 'in-cluster', nameNormalized: 'in-cluster', server: 'https://kubernetes.default.svc', project: 'default', labels: {}, annotations: {} },
  ];

  const selector = config.selector || {};
  const values = config.values || {};
  const hasMatchLabels = selector.matchLabels && Object.keys(selector.matchLabels).length > 0;
  const hasMatchExpressions = selector.matchExpressions && selector.matchExpressions.length > 0;

  let filtered = clusters;
  if (hasMatchLabels) {
    filtered = filtered.filter(c => {
      return Object.entries(selector.matchLabels).every(([k, v]) => c.labels[k] === v);
    });
  }
  if (hasMatchExpressions) {
    filtered = filtered.filter(c => {
      return selector.matchExpressions.every(expr => {
        const labelVal = c.labels[expr.key];
        switch (expr.operator) {
          case 'In': return expr.values && expr.values.includes(labelVal);
          case 'NotIn': return expr.values && !expr.values.includes(labelVal);
          case 'Exists': return labelVal !== undefined;
          case 'DoesNotExist': return labelVal === undefined;
          default: return true;
        }
      });
    });
  }

  return filtered.map(c => {
    const params = {
      name: c.name,
      nameNormalized: c.nameNormalized,
      server: c.server,
      project: c.project,
      metadata: {
        labels: { ...c.labels },
        annotations: { ...c.annotations },
      },
    };
    // Add values field overrides with Go template rendering
    Object.entries(values).forEach(([k, v]) => {
      params[`values.${k}`] = renderGoTemplate(v, params);
    });
    return params;
  });
}

function simulateGitDirectoryGenerator(config, extraContext = {}) {
  const directories = config.directories || [{ path: '*' }];
  const values = config.values || {};

  const mockStructure = extraContext._mockDirectories || [
    { path: 'apps/argo-workflows', basename: 'argo-workflows', segments: ['apps', 'argo-workflows'] },
    { path: 'apps/prometheus-operator', basename: 'prometheus-operator', segments: ['apps', 'prometheus-operator'] },
    { path: 'infra/nginx-ingress', basename: 'nginx-ingress', segments: ['infra', 'nginx-ingress'] },
    { path: 'infra/cert-manager', basename: 'cert-manager', segments: ['infra', 'cert-manager'] },
    { path: 'team-a/app1', basename: 'app1', segments: ['team-a', 'app1'] },
    { path: 'team-b/app2', basename: 'app2', segments: ['team-b', 'app2'] },
  ];

  const includePaths = directories.filter(d => !d.exclude).map(d => d.path);
  const excludePaths = directories.filter(d => d.exclude).map(d => d.path);

  // Simple glob matching: * matches any characters, we also handle ? and [abc]
  function matchGlob(pattern, str) {
    // Convert glob pattern to regex
    const regexStr = '^' + pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[/g, '[')
      .replace(/\]/g, ']') + '$';
    return new RegExp(regexStr).test(str);
  }

  let matched = mockStructure.filter(d => {
    return includePaths.some(p => matchGlob(p, d.path)) &&
      !excludePaths.some(p => matchGlob(p, d.path));
  });

  return matched.map(d => {
    const params = {
      'path.path': d.path,
      'path.basename': d.basename,
      'path.basenameNormalized': d.basename.replace(/[^a-zA-Z0-9-]/g, '-'),
      path: {
        path: d.path,
        basename: d.basename,
        basenameNormalized: d.basename.replace(/[^a-zA-Z0-9-]/g, '-'),
        segments: d.segments,
      }
    };
    Object.entries(values).forEach(([k, v]) => {
      params[`values.${k}`] = renderGoTemplate(v, params);
    });
    return params;
  });
}

function simulateGitFileGenerator(config, extraContext = {}) {
  const files = config.files || [{ path: '**/config.json' }];
  const values = config.values || {};

  const mockFiles = extraContext._mockFiles || [
    { path: 'config/engineering/dev/config.json', content: '{"app": "guestbook", "replicas": 2, "env": "dev"}' },
    { path: 'config/engineering/prod/config.json', content: '{"app": "guestbook", "replicas": 5, "env": "prod"}' },
    { path: 'global.values.yaml', content: 'cpuRequest: 200m\nmemoryLimit: 256Mi\ndebugEnabled: true' },
    { path: 'staging/stage.values.yaml', content: 'stageName: staging\ncpuRequest: 100m' },
    { path: 'production/stage.values.yaml', content: 'stageName: production\nmemoryLimit: 512Mi\ndebugEnabled: false' },
  ];

  const results = [];
  for (const file of mockFiles) {
    const matched = files.some(f => {
      const glob = f.path.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp('^' + glob + '$').test(file.path);
    });
    if (!matched) continue;

    const parsed = yaml.load(file.content);
    const basename = path.basename(file.path, path.extname(file.path));
    const segments = file.path.split('/');
    const params = {
      'path.path': file.path,
      'path.basename': basename,
      'path.basenameNormalized': basename.replace(/[^a-zA-Z0-9-]/g, '-'),
      'path.filename': path.basename(file.path),
      'path.extension': path.extname(file.path).replace(/^\./, ''),
      path: {
        path: file.path,
        basename: basename,
        basenameNormalized: basename.replace(/[^a-zA-Z0-9-]/g, '-'),
        filename: path.basename(file.path),
        extension: path.extname(file.path).replace(/^\./, ''),
        segments,
      },
    };
    // Spread the file content as parameters
    if (typeof parsed === 'object' && parsed !== null) {
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string') {
          params[k] = v;
        } else {
          params[k] = JSON.stringify(v);
        }
      });
    }
    Object.entries(values).forEach(([k, v]) => {
      params[`values.${k}`] = renderGoTemplate(v, params);
    });
    results.push(params);
  }
  return results;
}

function simulateSCMProviderGenerator(config, extraContext = {}) {
  // Mock: simulate discovering repos from an org
  const org = config.organization || config.owner || 'my-org';
  const mockRepos = extraContext._mockRepos || [
    { repository: 'frontend-app', url: 'https://github.com/' + org + '/frontend-app.git', branch: 'main' },
    { repository: 'backend-api', url: 'https://github.com/' + org + '/backend-api.git', branch: 'main' },
    { repository: 'infra-tools', url: 'https://github.com/' + org + '/infra-tools.git', branch: 'main' },
  ];
  return mockRepos.map(r => ({
    repository: r.repository,
    repositoryUrl: r.url,
    repository_url: r.url,
    repositoryName: r.repository,
    repository_name: r.repository,
    branch: r.branch,
    sha: 'abc123def456',
  }));
}

function simulatePullRequestGenerator(config, extraContext = {}) {
  const owner = config.owner || 'my-org';
  const repo = config.repo || 'my-repo';
  const mockPRs = extraContext._mockPRs || [
    { number: 42, title: 'feat: add new feature', head_sha: 'abc123', head_branch: 'feat/new-feature', base_branch: 'main', labels: ['enhancement'] },
    { number: 43, title: 'fix: resolve login bug', head_sha: 'def456', head_branch: 'fix/login-bug', base_branch: 'main', labels: ['bug'] },
    { number: 44, title: 'chore: update deps', head_sha: 'ghi789', head_branch: 'chore/update-deps', base_branch: 'main', labels: ['dependencies'] },
  ];
  return mockPRs.map(pr => ({
    number: pr.number,
    title: pr.title,
    head_sha: pr.head_sha,
    head_branch: pr.head_branch,
    base_branch: pr.base_branch,
    labels: pr.labels.join(','),
  }));
}

function simulateMatrixGenerator(config, extraContext) {
  const children = config.generators || [];
  if (children.length < 2) return [{ error: 'Matrix generator requires at least 2 child generators' }];

  const allParams = children.map(child => simulateGenerators([child], extraContext));
  // Cartesian product
  let result = [{}];
  for (const paramSet of allParams) {
    const newResult = [];
    for (const existing of result) {
      for (const params of paramSet) {
        newResult.push({ ...existing, ...params });
      }
    }
    result = newResult;
  }
  return result;
}

function simulateMergeGenerator(config, extraContext) {
  const children = config.generators || [];
  if (children.length < 2) return [{ error: 'Merge generator requires at least 2 generators' }];

  const mergeKeys = config.mergeKeys || ['server'];
  const allParams = children.map(child => simulateGenerators([child], extraContext));

  // Base (first generator's output)
  let merged = [...allParams[0]];

  // For each subsequent generator, merge matching parameter sets
  for (let i = 1; i < allParams.length; i++) {
    const overrides = allParams[i];
    const newMerged = [...merged];

    for (const override of overrides) {
      // Find matching parameter set in merged
      const matchIdx = newMerged.findIndex(m => {
        return mergeKeys.every(key => {
          const val1 = m[key];
          const val2 = override[key];
          // Also try dotted notation
          const val1d = resolveField('.' + key, m);
          const val2d = resolveField('.' + key, override);
          return (val1 !== undefined && val1 === val2) || (val1d !== undefined && val1d === val2d);
        });
      });

      if (matchIdx >= 0) {
        // Override matched entry
        newMerged[matchIdx] = { ...newMerged[matchIdx], ...override };
      }
    }
    merged = newMerged;
  }

  return merged;
}

function simulatePluginGenerator(config) {
  return [{ warning: 'Plugin generator: Simulated. Provide _mockPluginParams for custom results.' }];
}

function simulateClusterDecisionResourceGenerator(config) {
  const decisionResource = config.configMapRef || 'my-decision-configmap';
  const decisionGroups = config._mockDecisionGroups || [
    { name: 'regional-us', clusters: ['staging', 'production'], server: 'https://3.4.5.6', label: 'us' },
    { name: 'regional-eu', clusters: ['dev'], server: 'https://7.8.9.10', label: 'eu' },
  ];
  return decisionGroups.map(g => ({
    name: g.name,
    server: g.server || 'https://kubernetes.default.svc',
    label: g.label || g.name,
  }));
}

// ─── Generator dispatcher ──────────────────────────────────────────

function simulateGenerators(generators, extraContext = {}) {
  let allParams = [];

  for (const genDef of generators) {
    let params = [];

    if (genDef.list) {
      params = simulateListGenerator(genDef.list, extraContext);
    } else if (genDef.clusters) {
      params = simulateClusterGenerator(genDef.clusters, extraContext);
    } else if (genDef.git) {
      if (genDef.git.directories) {
        params = simulateGitDirectoryGenerator(genDef.git, extraContext);
      } else if (genDef.git.files) {
        params = simulateGitFileGenerator(genDef.git, extraContext);
      }
    } else if (genDef.matrix) {
      params = simulateMatrixGenerator(genDef.matrix, extraContext);
    } else if (genDef.merge) {
      params = simulateMergeGenerator(genDef.merge, extraContext);
    } else if (genDef.scmProvider) {
      params = simulateSCMProviderGenerator(genDef.scmProvider, extraContext);
    } else if (genDef.pullRequest) {
      params = simulatePullRequestGenerator(genDef.pullRequest, extraContext);
    } else if (genDef.plugin) {
      params = simulatePluginGenerator(genDef.plugin, extraContext);
    } else if (genDef.clusterDecisionResource) {
      params = simulateClusterDecisionResourceGenerator(genDef.clusterDecisionResource, extraContext);
    }

    allParams = allParams.concat(params);
  }

  return allParams;
}

// ─── API Routes ────────────────────────────────────────────────────

// Parse ApplicationSet YAML and simulate all generators
app.post('/api/simulate', (req, res) => {
  try {
    const { yaml: yamlContent, mockClusters, mockDirectories, mockFiles } = req.body;

    if (!yamlContent) {
      return res.status(400).json({ error: 'YAML content is required' });
    }

    const doc = yaml.load(yamlContent);
    if (!doc || !doc.spec || !doc.spec.generators) {
      return res.status(400).json({ error: 'Invalid ApplicationSet YAML: must contain spec.generators' });
    }

    const extraContext = {
      _mockClusters: mockClusters,
      _mockDirectories: mockDirectories,
      _mockFiles: mockFiles,
    };

    const params = simulateGenerators(doc.spec.generators, extraContext);

    // Render template for each parameter set if template exists
    const template = doc.spec.template || {};
    const rendered = params.map(p => {
      const renderedApp = deepRenderObject(template, p);
      return { params: p, rendered: renderedApp };
    });

    // Detect generator types used
    const types = doc.spec.generators.map(g => Object.keys(g)[0]).filter(Boolean);

    res.json({
      types: [...new Set(types)],
      count: params.length,
      parameters: params,
      renderedTemplates: rendered,
    });

  } catch (e) {
    res.status(400).json({ error: e.message, stack: e.stack });
  }
});

function deepRenderObject(obj, params) {
  if (typeof obj === 'string') {
    return renderGoTemplate(obj, params);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepRenderObject(item, params));
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deepRenderObject(v, params);
    }
    return result;
  }
  return obj;
}

// Get built-in examples
app.get('/api/examples', (req, res) => {
  const examplesDir = path.join(__dirname, 'examples');
  const examples = {};
  if (fs.existsSync(examplesDir)) {
    const files = fs.readdirSync(examplesDir).filter(f => f.endsWith('.yaml'));
    for (const file of files) {
      const name = path.basename(file, '.yaml');
      examples[name] = fs.readFileSync(path.join(examplesDir, file), 'utf-8');
    }
  }
  res.json(examples);
});

// Save a user's YAML as a new example
app.post('/api/examples', (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });
  const examplesDir = path.join(__dirname, 'examples');
  if (!fs.existsSync(examplesDir)) fs.mkdirSync(examplesDir, { recursive: true });
  fs.writeFileSync(path.join(examplesDir, `${name.replace(/[^a-zA-Z0-9_-]/g, '')}.yaml`), content);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ArgoCD Generator Simulator running on http://0.0.0.0:${PORT}`);
});
