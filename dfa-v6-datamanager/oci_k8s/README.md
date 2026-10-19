# DFA v6 Data Manager - Multi-Adaptation Deployment

## Architecture

- **One Docker Image Per Adaptation**: Next.js bakes `NEXT_PUBLIC_*` env vars at build time, so each adaptation gets its own tagged image
- **Multiple Adaptations**: Independent deployments using Kustomize overlays
- **Independent Versioning**: Each adaptation can run different image tags

## Structure

```
oci_k8s/
├── base/                          # Shared K8s resources
│   ├── deployment.yaml            # Deployment + Service
│   ├── ingress.yaml               # Ingress (host/TLS overridden per overlay)
│   └── kustomization.yaml
└── overlays/                      # Per-adaptation customization
    ├── demo/
    │   ├── kustomization.yaml
    │   ├── env-config.yaml
    │   └── ingress.yaml
    ├── guinea/
    │   ├── kustomization.yaml
    │   ├── env-config.yaml
    │   └── ingress.yaml
    └── sisomali/
        ├── kustomization.yaml
        ├── env-config.yaml
        └── ingress.yaml
```

## Current Adaptations

| Adaptation | Host | API Backend |
|------------|------|-------------|
| demo | demo.datamanager.dfa6.dataforall.org | demo.api.dfa6.dataforall.org |
| guinea | datamanager.guinea.dataforall.org | visualizerapi.guinea.dataforall.org |
| sisomali | datamanager.sisomali.dataforall.org | sisomali.api.dataforall.org |

## Adding a New Adaptation

1. **Create overlay**:
```bash
mkdir -p oci_k8s/overlays/new-client
cp oci_k8s/overlays/demo/kustomization.yaml oci_k8s/overlays/new-client/
cp oci_k8s/overlays/demo/env-config.yaml oci_k8s/overlays/new-client/
cp oci_k8s/overlays/demo/ingress.yaml oci_k8s/overlays/new-client/
# Edit both files with new-client values
```

2. **Update build_spec.yaml**:
   - Add to `DEPLOY_ADAPTATIONS`: `"demo,guinea,sisomali,new-client"`
   - Add `outputArtifacts` entries for the new image and manifest

## Deployment

**Deploy specific adaptations** (set in build_spec.yaml or OCI DevOps):
```bash
DEPLOY_ADAPTATIONS="demo,guinea,sisomali"
```

**Deploy all**:
```bash
DEPLOY_ADAPTATIONS="all"
```

## Key Difference from Backend API

The backend API builds **one image** for all adaptations (env vars are read at runtime). The frontend builds **one image per adaptation** because Next.js inlines `NEXT_PUBLIC_*` variables during `next build`.

Image tags follow the pattern: `<adaptation>-<commit-hash>` (e.g. `demo-abc1234`, `sisomali-abc1234`).
