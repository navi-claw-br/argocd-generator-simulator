# 📦 ArgoCD Generator Simulator — Deploy Guide

Este simulador permite testar e visualizar como os **ApplicationSet Generators** do ArgoCD funcionam antes de aplicá-los no cluster.

## 🚀 Acessando

Após deploy, acesse: **https://gen-simulator.awsgenerico.com.br**

## 🧪 Generators Suportados

| Generator | Status |
|-----------|--------|
| **List** | ✅ Completo |
| **Cluster** | ✅ Completo (com selector de labels/mock) |
| **Git (Directory)** | ✅ Completo (globbing, exclude) |
| **Git (File)** | ✅ Completo (YAML/JSON parsing) |
| **Matrix** | ✅ Completo (produto cartesiano) |
| **Merge** | ✅ Completo (merge keys + override) |
| SCM Provider | 🟡 Simulado |
| Pull Request | 🟡 Simulado |
| Plugin | 🟡 Simulado |
| Cluster Decision Resource | 🟡 Simulado |

## 🏗️ Arquitetura

```
Node.js (Express) backend ─► YAML parser + Generator simulators + Go-template renderer
       │
       └── static HTML/JS frontend ─► Monaco-free YAML editor + Tables + Cards + Viz tree
```

## 📁 Estrutura do Projeto

```
argocd-generator-simulator/
├── server.js          # Backend — simula generators + renderiza templates
├── package.json
├── Dockerfile
├── public/
│   ├── index.html     # Frontend — editor YAML + resultados
│   ├── style.css      # Tema escuro ArgoCD-like
│   └── app.js         # Lógica do cliente
├── examples/          # Exemplos pré-carregados
│   ├── list-generator.yaml
│   ├── cluster-generator.yaml
│   ├── git-directory-generator.yaml
│   ├── matrix-generator.yaml
│   ├── merge-generator.yaml
│   └── list-helm-overrides.yaml
└── k8s/
    ├── namespace.yaml
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    ├── hpa.yaml
    └── argocd-application.yaml
```

## 🐳 Deploy Local

```bash
cd argocd-generator-simulator
npm install
npm start
# Acesse http://localhost:3000
```

## ☸️ Deploy no Cluster AWSGENERICO

```bash
# Criar namespace + aplicar recursos
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Ou via ArgoCD
kubectl apply -f k8s/argocd-application.yaml
```

## 🔧 Build da Imagem

```bash
docker build -t nebbie/gen-simulator:latest .
docker push nebbie/gen-simulator:latest
```

## 💡 Como Usar

1. Selecione um exemplo no sidebar ou escreva seu próprio YAML
2. Configure os clusters mock (para Cluster Generator)
3. Configure diretórios mock (para Git Generator)
4. Clique **▶ Simular** (ou Ctrl+Enter)
5. Navegue entre as abas:
   - **Parâmetros**: tabela com todos os parâmetros gerados
   - **Templates**: YAML final renderizado para cada aplicação
   - **Visualização**: árvore visual dos generators
