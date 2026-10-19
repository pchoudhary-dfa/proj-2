# DFA V6 API - Multi-Adaptation Deployment

## Architecture

- **Single Docker Image**: One image built per commit, tagged with commit hash
- **Multiple Adaptations**: 20+ independent deployments using the same image
- **Independent Versioning**: Each adaptation can run different image tags

## Structure

```
oci_k8s/
├── environments.yaml          # Central config for all adaptations
├── base/                      # Shared K8s resources
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── secret-provider-class.yaml
│   └── namespace.yaml
└── overlays/                  # Per-adaptation customization
    ├── demo/
    │   └── kustomization.yaml
    └── datanett/
        └── kustomization.yaml
```

## Adding New Adaptation

1. **Add to environments.yaml**:
```yaml
adaptations:
  new-client:
    enabled: true
    imageTag: "latest"
    namespace: apps-dfa-v6-demo
    replicas: 1
    host: api.newclient.com
    resources:
      requests:
        memory: "512Mi"
        cpu: "200m"
      limits:
        memory: "1Gi"
        cpu: "500m"
    env:
      LOG_LEVEL: "INFO"
      CORS_ORIGINS: '["https://newclient.com"]'
      DB_HOST: "10.0.1.234"
      DB_NAME: "newclient_db"
    vaultId: "ocid1.vault..."
    secrets:
      - newclient-mysql-password
```

2. **Create overlay**:
```bash
mkdir -p oci_k8s/overlays/new-client
cp oci_k8s/overlays/demo/kustomization.yaml oci_k8s/overlays/new-client/
# Edit values in kustomization.yaml
```

3. **Update build_spec.yaml outputArtifacts**:

Add the new manifest to the `outputArtifacts` section:
```yaml
outputArtifacts:
  - name: container_image
    type: DOCKER_IMAGE
    location: ${REPOSITORY_URI}:${IMAGE_TAG}
  - name: k8s_manifest_dfa_dataforall
    type: BINARY
    location: k8s-manifest-demo.yaml
  - name: k8s_manifest_datanett
    type: BINARY
    location: k8s-manifest-datanett.yaml
  - name: k8s_manifest_new_client  # Add this
    type: BINARY
    location: k8s-manifest-new-client.yaml
```

**Note**: OCI DevOps requires static artifact declarations. The manifest is auto-generated during build, but must be declared here for deployment pipelines to reference it.

## Deployment

**Deploy specific adaptations**:
```bash
# Set in OCI DevOps build pipeline
DEPLOY_ADAPTATIONS="demo,datanett"
```

**Deploy all adaptations**:
```bash
DEPLOY_ADAPTATIONS="all"
```

**Deploy to specific version**:
Each adaptation's kustomization.yaml can specify different `newTag` values to run different versions independently.

### Limitation: Static Artifact Declaration

OCI DevOps requires all output artifacts to be statically declared in `build_spec.yaml`. While the build process dynamically generates manifests for any adaptation in `DEPLOY_ADAPTATIONS`, you must manually add each new adaptation to the `outputArtifacts` section.

**Workaround**: If you frequently add adaptations, consider:
- Pre-declaring artifacts for planned adaptations (even if not yet deployed)
- Using a single combined manifest artifact (requires deployment pipeline changes)
- Using OCI CLI in deployment stage to fetch generated artifacts from build run

## Build Output

- 1 Docker image: `me-dubai-1.ocir.io/axrfhwznxtja/dfa-v6-api:<commit-hash>`
- N manifest files: `k8s-manifest-<adaptation>.yaml`

## Summary

Single Build, Multiple Adaptations - One Docker image per commit, deployed to 20+ independent adaptations with 
different configurations.

### Key Files Created/Updated:

1. oci_k8s/environments.yaml - Central configuration for all adaptations (currently 2, easily scales to 20+)

2. build_spec.yaml - Builds ONE image, generates manifests for selected adaptations via DEPLOY_ADAPTATIONS variable

3. oci_k8s/overlays/ - Per-adaptation Kustomize overlays:
   - demo/ - Your current setup
   - datanett/ - For visualizer.datanett.info
   - guinea/ - For visualizer.guinea.dataforall.org
   - sisomali/ - For visualizer.sisomali.dataforall.org

4. Base resources - Simplified to be adaptation-agnostic

### How It Works:

- **Build**: Creates 1 image tagged with commit hash
- **Deploy**: Set DEPLOY_ADAPTATIONS="demo,datanett" or "all"
- **Version Control**: Each adaptation can independently specify which image tag to use in their kustomization.yaml

### To Add More Adaptations:

1. Add entry to environments.yaml
2. Copy an overlay folder and customize
3. Add to DEPLOY_ADAPTATIONS or use "all"