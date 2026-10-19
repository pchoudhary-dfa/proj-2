# Commit History — Pulkit Choudhary

Generated 2026-10-19 from all branches of the repos in `dfa/`. Matched authors: "Pulkit Choudhary", pchoudhary@dataforall.org (commits were made as pchaudhary@avaloninfosys.com).

| Repo | My commits | First | Last |
|---|---:|---|---|
| dfa-toolkit-api-core | 175 | 2026-01-22 | 2026-07-03 |
| dfa-toolkit-visualizer | 240 | 2026-01-16 | 2026-07-22 |
| dfa-v6-dashboard | 0 | - | - |
| dfa-v6-datamanager | 59 | 2026-05-08 | 2026-07-03 |
| dfa-v6-styleguide | 4 | 2026-06-12 | 2026-06-22 |

---

## dfa-toolkit-api-core

### 2026-07-03 17:38 · `731188f` · Add database commit after user logout to ensure changes are saved

 apps/app_db/router/auth.py | 1 +
 1 file changed, 1 insertion(+)

### 2026-07-03 17:00 · `a475be9` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/dash-viz

### 2026-07-03 17:00 · `8fbcced` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/dash-viz

### 2026-07-03 16:58 · `fc6fcc5` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/dash-viz

### 2026-07-02 17:46 · `6d87c66` · Created visualization CRUD APIs: Introduced new schemas and service logic for managing dashboard visualizations, updated database schema to support new fields, and improved API routes for better functionality and clarity.

 apps/app_dashboard/constants.py                          |  12 +++
 apps/app_dashboard/models/dashboard.py                   |  52 +++---------
 apps/app_dashboard/router/visualizations.py              | 181 +++++++++++++++++++++++++++++++++++------
 apps/app_dashboard/schemas/visualization.py              |  93 ++++++++++++++++++++++
 apps/app_dashboard/services/visualization_service.py     | 239 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/migrations/versions/124_viz_crud_refactor.py | 211 ++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 721 insertions(+), 67 deletions(-)

### 2026-07-02 16:15 · `dfca0c0` · Merge branch 'feature/dfa-dashboard-crud' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/dfa-dashboard-crud

### 2026-07-02 12:16 · `8a40f33` · Merge branches 'feature/ssov2' and 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/ssov2

### 2026-07-01 17:01 · `b864c21` · Add back-channel logout endpoint for IdP-initiated session revocation

- Implemented POST /auth/sso/back-channel-logout to handle logout requests from external Identity Providers.
- Added BackChannelLogoutRequest schema for request validation.
- Updated auth.py to include logic for revoking refresh tokens and deactivating SSO sessions.
- Created tests for the new endpoint, covering success, not found, and validation scenarios.
- Updated seed_iam.py to include the new endpoint in the API resource list.

 apps/app_db/router/auth.py                             |  83 ++++++++++++++++++++++++-
 apps/app_db/schemas/auth.py                            |   7 +++
 apps/app_db/scripts/app_db/seed_iam.py                 |   1 +
 apps/app_db/tests/test_api/test_back_channel_logout.py | 189 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 278 insertions(+), 2 deletions(-)

### 2026-06-29 09:49 · `c84a509` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/ssov2

### 2026-06-29 09:46 · `6cc702b` · Update access token expiration to 10 minutes across configuration files and implement session status endpoint for cross-app SLO detection. Adjust related models and responses to include access token lifetime in seconds.

 .env.example                                  |  2 +-
 Dockerfile                                    |  2 +-
 apps/app_db/router/auth.py                    | 34 ++++++++++++++++++++++++++++++++++
 apps/app_db/schemas/auth.py                   |  6 ++++++
 apps/app_db/scripts/app_db/seed_iam.py        |  1 +
 apps/app_db/services/refresh_token_service.py | 13 +++++++++++++
 apps/shared/config/config.py                  |  2 +-
 oci_k8s/overlays/datanett/env-config.yaml     |  2 +-
 oci_k8s/overlays/demo/env-config.yaml         |  2 +-
 oci_k8s/overlays/guinea/env-config.yaml       |  2 +-
 oci_k8s/overlays/sisomali/env-config.yaml     |  2 +-
 oci_k8s_test/env-config.yaml                  |  2 +-
 12 files changed, 62 insertions(+), 8 deletions(-)

### 2026-06-26 14:49 · `df7145f` · Consolidate SSO_ENABLED and IUS_GID_SEPARATOR into platform-wide DFA_CORE configuration. Update related migrations, service logic, and caching mechanisms to support global configuration access. Adjust tests to validate new behavior and ensure proper integration with existing application keys.

 apps/app_db/constants/system_config.py                       |  13 +++
 apps/app_db/data/config.json                                 |  16 ++--
 apps/app_db/migrations/versions/120_sso_enabled_dfa_core.py  | 112 +++++++++++++++++++++++++
 apps/app_db/migrations/versions/121_ius_sep_dfa_core.py      | 105 +++++++++++++++++++++++
 apps/app_db/router/app_config.py                             |   7 +-
 apps/app_db/scripts/app_db/seed_applications.py              |   8 +-
 apps/app_db/scripts/app_db/seed_configuration.py             |   1 +
 apps/app_db/services/app_config.py                           |  54 +++++++++---
 apps/app_db/tests/test_services/test_app_config_service.py   | 229 +++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/tests/test_unit/test_ius_gid_separator_config.py |  53 ++++++++++++
 apps/app_db/tests/test_unit/test_sso_config.py               |  58 +++++++++++++
 apps/datawarehouse/constants.py                              |   2 +-
 apps/shared/config/config.py                                 |   1 +
 apps/shared/packages/dfa_sso_service/core/config.py          |  16 +++-
 apps/shared/utils/ius_utils.py                               |  85 ++++++++++++-------
 docs/SSO_TECHNICAL_DESIGN.md                                 |  22 ++---
 16 files changed, 714 insertions(+), 68 deletions(-)

### 2026-06-25 17:31 · `286b1cc` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/ssov2

### 2026-06-25 17:14 · `6e4f263` · Enhance documentation and logic for default subgroup filtering in reports. Updated descriptions for auto-filter behavior and modified fallback logic to ensure data is returned instead of an empty set when no matching IUS is found. Adjusted test cases to reflect changes in expected outcomes.

 apps/datawarehouse/router/dw_reports.py                        | 3 ++-
 apps/datawarehouse/services/dw_published_data_service.py       | 6 ++++--
 apps/datawarehouse/tests/test_api/test_dw_reports_published.py | 8 ++++----
 3 files changed, 10 insertions(+), 7 deletions(-)

### 2026-06-25 12:47 · `b0d7d9d` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/ssov2

### 2026-06-25 12:47 · `842bab7` · Update SSO technical design documentation to include details on the `login_redirect_per_role` module and its impact on OAuth flow, along with configuration steps to resolve related issues.

 docs/SSO_TECHNICAL_DESIGN.md | 41 +++++++++++++++++++++++++++++++++--------
 1 file changed, 33 insertions(+), 8 deletions(-)

### 2026-06-24 10:37 · `9cf7ac8` · httpx timeout fix

 apps/shared/packages/dfa_sso_service/__init__.py         | 2 +-
 apps/shared/packages/dfa_sso_service/adapters/fastapi.py | 8 ++++++--
 apps/shared/packages/dfa_sso_service/core/discovery.py   | 9 +++++++++
 3 files changed, 16 insertions(+), 3 deletions(-)

### 2026-06-15 18:12 · `45d4066` · Add Sisomali adaptation support: update build spec, add environment config, ingress, and kustomization files

 build_spec.yaml                              |   7 ++-
 oci_k8s/README.md                            |   2 +
 oci_k8s/overlays/sisomali/env-config.yaml    | 171 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 oci_k8s/overlays/sisomali/ingress.yaml       |  27 +++++++++++
 oci_k8s/overlays/sisomali/kustomization.yaml |  48 +++++++++++++++++++
 5 files changed, 253 insertions(+), 2 deletions(-)

### 2026-06-10 18:11 · `4ced4aa` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-updates

### 2026-06-10 18:10 · `72cd7f2` · Implement SSO provisioning enhancements and role assignment logic

Added a new utility for extracting warehouse IDs from return paths to support SSO provisioning. Updated the SsoService to conditionally assign default roles based on the presence of a warehouse ID during the SSO exchange process. Enhanced the DfaUserProvider with methods to check user roles scoped to specific warehouses. Introduced tests for the new provisioning logic and role assignment behavior, ensuring proper functionality across various scenarios.

 apps/app_db/router/auth.py                                      |  18 ++++++
 apps/app_db/schemas/auth.py                                     |   4 ++
 apps/app_db/services/sso_user_provider.py                       | 119 +++++++++++++++++++++++++---------
 apps/app_db/tests/test_unit/test_sso_provisioning.py            |  77 ++++++++++++++++++++++
 apps/app_db/tests/test_unit/test_sso_service_provision_roles.py | 166 ++++++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/tests/test_unit/test_sso_user_provider.py           | 129 +++++++++++++++++++++++++++++++++++++
 apps/app_db/utils/sso_provisioning.py                           | 100 +++++++++++++++++++++++++++++
 apps/shared/packages/dfa_sso_service/adapters/fastapi.py        |  44 +++++++++++--
 apps/shared/packages/dfa_sso_service/core/config.py             |   5 ++
 apps/shared/packages/dfa_sso_service/core/security.py           |  87 +++++++++++++++++++++++++
 apps/shared/packages/dfa_sso_service/core/service.py            |  88 +++++++++++++++++++++++--
 apps/shared/packages/dfa_sso_service/providers/base.py          |  19 +++++-
 apps/shared/packages/dfa_sso_service/tests/test_security.py     |  42 ++++++++++++
 main.py                                                         |   8 +++
 14 files changed, 866 insertions(+), 40 deletions(-)

### 2026-06-09 17:12 · `540e28b` · Add search sync job endpoints and status service

Implemented new endpoints for managing search sync jobs, including the ability to start a sync job, check its status, and retrieve active jobs. Introduced a background job status service to handle status queries for both DB and Celery job types. Added tests to ensure proper functionality of the new endpoints and status checks.

 apps/app_db/scripts/app_db/seed_iam.py                |   2 +
 apps/datawarehouse/router/search.py                   | 109 +++++++++++++++++++++++++++++++++++-
 apps/datawarehouse/tests/test_api/test_search_sync.py | 174 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/shared/services/bg_job_status_service.py         | 174 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 458 insertions(+), 1 deletion(-)

### 2026-06-09 15:22 · `024155a` · Add ar_id field to PublishedDataRow and PublishedDataAggregateRow models

Updated the data models to include the ar_id field. Adjusted relevant column definitions and data transformation functions to accommodate this new field. Updated tests to verify the inclusion of ar_id in the published data response.

 apps/datawarehouse/schemas/dw_reports.py                       | 2 ++
 apps/datawarehouse/services/dw_published_data_service.py       | 6 +++++-
 apps/datawarehouse/tests/test_api/test_dw_reports_published.py | 2 ++
 3 files changed, 9 insertions(+), 1 deletion(-)

### 2026-06-05 11:18 · `a67beda` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-updates

### 2026-06-05 11:17 · `e73573c` · Refactor SSO role assignment logic and enhance IAM API documentation. Updated seed_iam.py to support both DM and VIZ for SSO authentication endpoints. Improved DfaUserProvider to log role assignments and handle multiple app_key assignments for SSO users. Added SSO_FEDERATED_APPS configuration to enable single sign-on across applications.

 apps/app_db/scripts/app_db/seed_iam.py                   |  8 +++---
 apps/app_db/services/sso_user_provider.py                | 77 +++++++++++++++++++++++++++++++++++---------------------
 apps/shared/config/config.py                             | 31 +++++++++++++++++++++++
 apps/shared/packages/dfa_sso_service/adapters/fastapi.py | 15 ++++++++---
 4 files changed, 96 insertions(+), 35 deletions(-)

### 2026-06-04 17:23 · `2b5cbd5` · notification

 apps/app_db/migrations/versions/110_notification_module.py   | 204 +++++++++++++++++++++++
 apps/app_db/models/core.py                                   |  79 +++++++++
 apps/app_db/router/api.py                                    |   6 +-
 apps/app_db/router/notification.py                           | 155 +++++++++++++++++
 apps/app_db/schemas/notification.py                          |  30 ++++
 apps/app_db/scripts/app_db/seed_iam.py                       |  16 ++
 apps/app_db/services/dataset_service.py                      | 233 ++++++++++++++++----------
 apps/app_db/services/notification_service.py                 | 457 +++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/tests/conftest.py                                |   9 +
 apps/app_db/tests/test_api/test_notification_api.py          | 124 ++++++++++++++
 apps/app_db/tests/test_services/test_notification_service.py | 281 +++++++++++++++++++++++++++++++
 11 files changed, 1507 insertions(+), 87 deletions(-)

### 2026-06-04 10:26 · `90511d5` · Merge pull request #511 in DFAV6/dfa-v6-api from fix/help-keys to develop

* commit '11ba44e97cadf1a036c0d299c0205893fc1bdc16':
  Remove obsolete help keys from the seed_help_keys.py script to streamline the help documentation.
  fix
  updated help key seeder and api response

### 2026-06-04 13:58 · `11ba44e` · Remove obsolete help keys from the seed_help_keys.py script to streamline the help documentation.

 apps/app_db/scripts/app_db/seed_help_keys.py | 12 ------------
 1 file changed, 12 deletions(-)

### 2026-06-04 11:59 · `3c3e293` · fix

 apps/app_db/scripts/app_db/seed_help_keys.py | 13 -------------
 1 file changed, 13 deletions(-)

### 2026-06-04 11:56 · `fa7c61f` · updated help key seeder and api response

 apps/app_db/scripts/app_db/seed_help_keys.py                         | 123 ++++++++++++++++++++++++++-----------------
 apps/shared/packages/dfa-help-service/dfa_help_service/api/routes.py |  22 ++++++--
 2 files changed, 91 insertions(+), 54 deletions(-)

### 2026-06-03 18:28 · `c49bebc` · Refactor isdefaultenabled to isdefaultsubgroup in data warehouse reports

- Replaced occurrences of the isdefaultenabled parameter with isdefaultsubgroup across relevant files to enhance clarity and functionality.
- Updated documentation to reflect the new parameter and its behavior.
- Adjusted tests to validate the changes in parameter usage and ensure expected outcomes.

 apps/datawarehouse/constants.py                                |  1 +
 apps/datawarehouse/router/dw_reports.py                        | 10 +++++-----
 apps/datawarehouse/services/dw_published_data_service.py       |  4 ++--
 apps/datawarehouse/tests/test_api/test_dw_reports_published.py | 20 ++++++++++----------
 docs/DW_QUALITY_REPORTS.md                                     |  2 +-
 5 files changed, 19 insertions(+), 18 deletions(-)

### 2026-06-03 18:19 · `a4faf27` · Enhance report data retrieval with isdefaultenabled parameter

- Added isdefaultenabled query parameter to the report data endpoints, allowing users to control the inclusion of default-subgroup IUS rows.
- Updated documentation to reflect the new parameter and its behavior.
- Enhanced tests to validate the functionality of isdefaultenabled in various scenarios.

 apps/datawarehouse/router/dw_reports.py                        |  15 ++++-
 apps/datawarehouse/services/dw_published_data_service.py       |  24 ++++++++
 apps/datawarehouse/tests/test_api/test_dw_reports_published.py | 152 ++++++++++++++++++++++++++++++++++++++++++-------
 docs/DW_QUALITY_REPORTS.md                                     |   1 +
 4 files changed, 170 insertions(+), 22 deletions(-)

### 2026-06-03 17:40 · `da24b35` · fixing the blocking of server actions if the jwt secret key and secret key is default strings

 apps/shared/config/config.py | 21 +++++++++++++--------
 docs/SSO_TECHNICAL_DESIGN.md | 29 +++++++++++++++++++++--------
 2 files changed, 34 insertions(+), 16 deletions(-)

### 2026-06-03 12:09 · `f722d06` · Update environment configuration and enhance search table management

- Updated .env.example to provide clearer instructions for generating SECRET_KEY and JWT_SECRET_KEY for local development.
- Improved error handling in the logout function by logging exceptions during SSO session cleanup.
- Added support for creating search tables in the data warehouse optimization process, including new options in the OptimizeOptionsSchema.
- Implemented ensure_search_tables service to check and create necessary search tables if they do not exist.
- Updated related tests to cover new functionality for search table management.

 .env.example                                              |   6 ++-
 apps/app_db/router/auth.py                                |   9 ++++-
 apps/app_db/router/datawarehouse.py                       |   6 ++-
 apps/app_db/schemas/core.py                               |  10 +++++
 apps/app_db/services/dw_optimizer.py                      |  33 +++++++++++++++++
 apps/app_db/tests/test_api/test_datawarehouse.py          |  54 +++++++++++++++++++++++++--
 apps/datawarehouse/scripts/create_search_tables.py        |  64 ++++++++++++++++++--------------
 apps/datawarehouse/services/search_index/search_tables.py | 108 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/datawarehouse/tasks/bg_search_index_tasks.py         |  42 ++++-----------------
 apps/shared/config/config.py                              |  14 ++++++-
 tests/test_services/test_search/test_search_tables.py     |  95 +++++++++++++++++++++++++++++++++++++++++++++++
 11 files changed, 369 insertions(+), 72 deletions(-)

### 2026-06-03 10:53 · `62dd5c3` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sprint9

### 2026-06-03 09:48 · `e61a461` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sprint9

### 2026-06-02 18:09 · `e21355a` · Refactor SSO error handling and validation. Introduced custom exceptions for SSO claims and configuration errors, enhancing error responses with detailed information. Implemented URL validation for OIDC discovery and redirect URLs to mitigate SSRF risks. Added unit tests for new validation logic.

 apps/shared/packages/dfa_sso_service/core/claims.py         | 11 ++++++
 apps/shared/packages/dfa_sso_service/core/discovery.py      | 22 +++++++++---
 apps/shared/packages/dfa_sso_service/core/errors.py         | 16 +++++++++
 apps/shared/packages/dfa_sso_service/core/security.py       | 96 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/shared/packages/dfa_sso_service/core/service.py        | 10 ++++--
 apps/shared/packages/dfa_sso_service/tests/test_security.py | 62 ++++++++++++++++++++++++++++++++++
 docs/SSO_TECHNICAL_DESIGN.md                                |  6 ++--
 main.py                                                     | 48 +++++++++++++++++++++------
 8 files changed, 251 insertions(+), 20 deletions(-)

### 2026-06-02 17:27 · `f73d2ab` · Maps configuration - Updated app-config patch api for updating db configuration variables

 apps/app_db/router/app_config.py                           |   7 +++-
 apps/app_db/services/app_config.py                         | 110 ++++++++++++++++++++++++++++++++++++++++++-----------
 apps/app_db/services/ut_dw_config_writer.py                |  62 ++++++++++++++++++++++++++++++
 apps/app_db/tests/test_services/test_app_config_service.py |  88 ++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 244 insertions(+), 23 deletions(-)

### 2026-06-02 16:02 · `836f758` · Update requirements.txt to include itsdangerous==2.2.0 for authlib compatibility, ensuring proper handling of signed session and state tokens.

 requirements.txt | 1 +
 1 file changed, 1 insertion(+)

### 2026-06-02 14:39 · `d5d73ca` · Enhance SSO technical documentation: Add detailed backend environment variable requirements, clarify FED callback URL configuration, and update local development setup instructions. Adjust seeding scripts to reflect changes in origin URL handling for FED clients.

 docs/SSO_TECHNICAL_DESIGN.md | 189 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------------
 1 file changed, 153 insertions(+), 36 deletions(-)

### 2026-06-02 14:14 · `d8dbf60` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-module

### 2026-06-02 12:40 · `84e1d71` · Refactor SSO configuration: remove SSO frontend callback URL from environment and config files, transitioning to a runtime resolution from the database. Update SSO service to utilize a callback URL resolver and enable per-application SSO checks. Adjust related documentation and seed scripts accordingly.

 .env.example                                             |  10 ------
 apps/app_db/data/config.json                             |   9 ++---
 apps/app_db/scripts/app_db/seed_application_clients.py   |   2 +-
 apps/shared/config/config.py                             |   1 -
 apps/shared/packages/dfa_sso_service/README.md           |  38 ++++++++++++++-------
 apps/shared/packages/dfa_sso_service/__init__.py         |   3 +-
 apps/shared/packages/dfa_sso_service/adapters/fastapi.py |  21 +++++++++---
 apps/shared/packages/dfa_sso_service/core/config.py      |  35 +++++++++----------
 apps/shared/packages/dfa_sso_service/core/service.py     |  37 +++++++++++++++++---
 docs/SSO_TECHNICAL_DESIGN.md                             | 102 ++++++++++++++++++++++++++++++++++++++++++++++++-------
 main.py                                                  |  42 ++++++++++++++++++-----
 11 files changed, 222 insertions(+), 78 deletions(-)

### 2026-06-01 18:43 · `41b7f4d` · Update IAM role seeding script to grant read-only GET access on all DW-scoped resources for the Authenticated User role. Removed template-specific API handling and streamlined the collection of active GET APIs. Improved warning messages for missing roles and APIs.

 apps/app_db/scripts/app_db/seed_dm_iam_roles.py | 62 +++++++++++++++++++++++++-------------------------------------
 1 file changed, 25 insertions(+), 37 deletions(-)

### 2026-06-01 18:30 · `5085830` · raw claims bug fix

 apps/shared/packages/dfa_sso_service/adapters/fastapi.py | 16 ++++++++++++----
 apps/shared/packages/dfa_sso_service/core/claims.py      |  5 +++++
 docs/SSO_TECHNICAL_DESIGN.md                             |  2 +-
 3 files changed, 18 insertions(+), 5 deletions(-)

### 2026-06-01 17:19 · `2ca971c` · Refactor SSO token handling: rename id_token_raw to id_token_enc across service, storage, and database schema. Update related documentation and migration scripts for clarity and consistency.

 apps/shared/packages/dfa_sso_service/core/config.py                           |  2 +-
 apps/shared/packages/dfa_sso_service/core/service.py                          | 11 ++++-------
 apps/shared/packages/dfa_sso_service/migrations/create_tables.sql             |  3 +--
 apps/shared/packages/dfa_sso_service/migrations/sso_token_columns_cleanup.sql | 18 ++++++++++++++++++
 apps/shared/packages/dfa_sso_service/storage/base.py                          |  4 ++--
 apps/shared/packages/dfa_sso_service/storage/sqlalchemy_storage.py            | 12 ++++--------
 docs/SSO_TECHNICAL_DESIGN.md                                                  |  9 ++++-----
 7 files changed, 34 insertions(+), 25 deletions(-)

### 2026-06-01 15:44 · `22ef17d` · updates

 apps/shared/middleware/auth_middleware.py | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)

### 2026-06-01 15:41 · `e8cbb45` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-module

### 2026-06-01 15:40 · `58a2f05` · Feedback points on sso after review

 .env.example                                                        |  11 +-
 apps/app_db/data/config.json                                        |  12 +-
 apps/app_db/dependencies.py                                         |  14 +-
 apps/app_db/migrations/versions/107_sso_package_tables.py           | 159 --------------------
 apps/app_db/models/core.py                                          |   2 -
 apps/app_db/router/auth.py                                          | 163 ++++++++++++--------
 apps/app_db/router/sso.py                                           | 144 ------------------
 apps/app_db/schemas/auth.py                                         |  19 ++-
 apps/app_db/scripts/app_db/seed_dm_iam_roles.py                     | 142 ++++++++++++++++--
 apps/app_db/scripts/app_db/seed_iam.py                              |   2 -
 apps/app_db/scripts/seed_all.py                                     |   2 -
 apps/app_db/scripts/seed_identity_provider.py                       | 101 -------------
 apps/app_db/scripts/set_sso_provider_secret.py                      |  21 +--
 apps/app_db/services/auth_token_payload.py                          |  56 ++++++-
 apps/app_db/services/iam_role_service.py                            |   5 +-
 apps/app_db/services/sso_user_provider.py                           |   8 +-
 apps/shared/packages/dfa_sso_service/README.md                      |  65 ++++----
 apps/shared/packages/dfa_sso_service/__init__.py                    |  80 +++++++++-
 apps/shared/packages/dfa_sso_service/adapters/fastapi.py            |  45 +++---
 apps/shared/packages/dfa_sso_service/core/claims.py                 |   8 +-
 apps/shared/packages/dfa_sso_service/core/config.py                 |  99 ++++++++++++-
 apps/shared/packages/dfa_sso_service/core/discovery.py              |   2 +-
 apps/shared/packages/dfa_sso_service/core/logout.py                 |   2 +-
 apps/shared/packages/dfa_sso_service/core/models.py                 |  24 ++-
 apps/shared/packages/dfa_sso_service/core/service.py                |  69 +++------
 apps/shared/packages/dfa_sso_service/migrations/create_tables.sql   |  64 +++++---
 apps/shared/packages/dfa_sso_service/migrations/migrate_from_v1.sql |  63 ++++++++
 apps/shared/packages/dfa_sso_service/providers/base.py              |   6 +-
 apps/shared/packages/dfa_sso_service/storage/base.py                |  18 +--
 apps/shared/packages/dfa_sso_service/storage/sqlalchemy_storage.py  | 121 ++++++---------
 docs/SSO_TECHNICAL_DESIGN.md                                        | 352 ++++++++++++++++++--------------------------
 main.py                                                             | 111 ++++++++------
 32 files changed, 975 insertions(+), 1015 deletions(-)

### 2026-05-29 12:32 · `26f3863` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-module

### 2026-05-29 10:18 · `49d09ca` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into fix/Unit

### 2026-05-28 18:36 · `30eee06` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-module

### 2026-05-28 18:17 · `b3827e9` · fixed dfa help keys api structure

 apps/app_db/scripts/app_db/seed_help_adaptations.py                     |  74 ++++++++++++++++-------------
 apps/shared/packages/dfa-help-service/dfa_help_service/api/routes.py    | 101 +++++++++++++++++++++-------------------
 apps/shared/packages/dfa-help-service/dfa_help_service/core/services.py |   6 ++-
 3 files changed, 99 insertions(+), 82 deletions(-)

### 2026-05-28 18:17 · `2be4225` · fixed dfa help keys api structure

 apps/app_db/scripts/app_db/seed_help_adaptations.py                     |  74 ++++++++++++++++-------------
 apps/shared/packages/dfa-help-service/dfa_help_service/api/routes.py    | 101 +++++++++++++++++++++-------------------
 apps/shared/packages/dfa-help-service/dfa_help_service/core/services.py |   6 ++-
 3 files changed, 99 insertions(+), 82 deletions(-)

### 2026-05-28 13:53 · `8a6f4c3` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-module

### 2026-05-28 11:47 · `f475076` · Add background task for syncing search index and update related configurations

- Introduced a new background task for syncing search index in `bg_search_index_tasks.py`.
- Added a new endpoint in `search.py` to trigger the sync operation.
- Updated Celery configuration to include the new task and its queue.
- Enhanced job dispatching logic to handle the new sync search index job type.
- Refactored imports and adjusted existing scripts to accommodate these changes.

 apps/app_db/scripts/app_db/seed_iam.py            |  1 +
 apps/app_db/scripts/seed_role_i18n_utils.py       |  2 +-
 apps/datawarehouse/router/search.py               | 43 +++++++++++++++++++++++++++++++
 apps/datawarehouse/tasks/bg_search_index_tasks.py | 88 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/shared/config/celery_config.py               |  4 +++
 apps/shared/config/config.py                      |  2 ++
 apps/shared/services/bg_job_dispatch.py           | 19 ++++++++++++++
 7 files changed, 158 insertions(+), 1 deletion(-)

### 2026-05-28 09:22 · `88ebeb0` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso-module

### 2026-05-26 18:32 · `ff85cea` · Updated doc

 docs/SSO_TECHNICAL_DESIGN.md | 175 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 1 file changed, 140 insertions(+), 35 deletions(-)

### 2026-05-26 18:30 · `abf186a` · Implement SSO package restructuring and enhance SSO functionality. This includes the addition of new SSO session management, error handling for SSO claims, and the migration of SSO-related database tables. Removed deprecated SSO service code and updated the SSO router to utilize the new package structure. Adjusted refresh token service to track SSO context in the new session table instead of the refresh token row.

 apps/app_db/migrations/versions/098_iam_sso_tables.py                       | 145 ----------
 apps/app_db/migrations/versions/099_sso_logout_cols.py                      | 111 -------
 apps/app_db/migrations/versions/107_sso_package_tables.py                   | 159 ++++++++++
 apps/app_db/models/core.py                                                  | 128 --------
 apps/app_db/router/sso.py                                                   | 303 ++-----------------
 apps/app_db/scripts/seed_all.py                                             |   2 +-
 apps/app_db/scripts/seed_identity_provider.py                               |   4 +-
 apps/app_db/scripts/set_sso_provider_secret.py                              |   5 +-
 apps/app_db/services/refresh_token_service.py                               |  15 +-
 apps/app_db/services/sso_service.py                                         | 561 ------------------------------------
 apps/app_db/services/sso_user_provider.py                                   |  66 +++++
 apps/shared/packages/dfa_sso_service/README.md                              |  94 ++++++
 apps/shared/packages/dfa_sso_service/__init__.py                            |  23 ++
 apps/shared/packages/dfa_sso_service/adapters/__init__.py                   |   0
 apps/shared/packages/dfa_sso_service/adapters/fastapi.py                    | 229 +++++++++++++++
 apps/shared/packages/dfa_sso_service/core/__init__.py                       |   0
 apps/shared/packages/dfa_sso_service/core/claims.py                         |  59 ++++
 apps/shared/packages/dfa_sso_service/core/config.py                         |  30 ++
 apps/shared/packages/dfa_sso_service/core/crypto.py                         |  56 ++++
 apps/shared/packages/dfa_sso_service/core/discovery.py                      |  94 ++++++
 apps/shared/packages/dfa_sso_service/core/logout.py                         |  31 ++
 .../schemas/sso.py => shared/packages/dfa_sso_service/core/models.py}       |  45 ++-
 apps/shared/packages/dfa_sso_service/core/service.py                        | 364 +++++++++++++++++++++++
 apps/shared/packages/dfa_sso_service/migrations/create_tables.sql           | 101 +++++++
 apps/shared/packages/dfa_sso_service/providers/__init__.py                  |   0
 apps/shared/packages/dfa_sso_service/providers/base.py                      |  43 +++
 apps/shared/packages/dfa_sso_service/storage/__init__.py                    |   0
 apps/shared/packages/dfa_sso_service/storage/base.py                        | 101 +++++++
 apps/shared/packages/dfa_sso_service/storage/sqlalchemy_storage.py          | 408 ++++++++++++++++++++++++++
 docs/SSO_TECHNICAL_DESIGN.md                                                |  84 ++++--
 main.py                                                                     |  59 +++-
 31 files changed, 2041 insertions(+), 1279 deletions(-)

### 2026-05-26 14:50 · `7e84fe1` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/helpupdate

### 2026-05-26 14:49 · `0a03eaa` · Add seed_help_keys.py for hierarchical help keys and update seed_all.py

 apps/app_db/scripts/app_db/seed_help_keys.py | 413 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/scripts/seed_all.py              |   2 +
 2 files changed, 415 insertions(+)

### 2026-05-26 10:00 · `d2be960` · Refactor seed_all.py script to improve structure and maintainability. Updated docstring for clarity and organized seeder execution order. Added error handling for seeder execution failures.

 apps/app_db/scripts/seed_all.py | 216 ++++++++++++++++++++++++++++++++++++++++----------------------------------------
 1 file changed, 108 insertions(+), 108 deletions(-)

### 2026-05-26 09:54 · `c3c3bd3` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso

### 2026-05-25 18:13 · `cd7e4b8` · Remove SSO_OIDC_CLIENT documentation file, consolidating information into other resources.

 docs/SSO_OIDC_CLIENT.md | 1060 ---------------------------------------------------------------------------------------
 1 file changed, 1060 deletions(-)

### 2026-05-25 15:45 · `a36d013` · Addressed and worked on the feedback points

 .env.example                                  | 12 +++++-------
 apps/app_db/router/auth.py                    | 14 +++++++-------
 apps/app_db/router/sso.py                     | 17 +++++++++++++++++
 apps/app_db/services/refresh_token_service.py |  5 +++++
 apps/app_db/services/sso_service.py           | 25 +++++++++++++++++++++++--
 apps/shared/config/config.py                  | 12 ++----------
 docs/SSO_TECHNICAL_DESIGN.md                  | 49 ++++++++++++++++++++++---------------------------
 7 files changed, 81 insertions(+), 53 deletions(-)

### 2026-05-25 11:23 · `80d7b82` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso

### 2026-05-25 09:22 · `3657590` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso

### 2026-05-25 09:22 · `75f8acd` · Updated doc

 docs/SSO_TECHNICAL_DESIGN.md | 787 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 787 insertions(+)

### 2026-05-22 12:09 · `78037b7` · Updated migration files for fault tolerance

 apps/app_db/migrations/versions/098_iam_sso_tables.py  | 213 ++++++++++++++++++++++++++++++++-------------------------
 apps/app_db/migrations/versions/099_sso_logout_cols.py | 136 +++++++++++++++++++++++-------------
 2 files changed, 209 insertions(+), 140 deletions(-)

### 2026-05-22 11:42 · `3bdc93c` · adjusted migration sequence

 apps/app_db/migrations/versions/{095_iam_sso_tables.py => 098_iam_sso_tables.py}   | 11 ++++++-----
 apps/app_db/migrations/versions/{096_sso_logout_cols.py => 099_sso_logout_cols.py} |  8 ++++----
 docs/SSO_OIDC_CLIENT.md                                                            | 10 ++++------
 3 files changed, 14 insertions(+), 15 deletions(-)

### 2026-05-22 11:32 · `c89e877` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso

### 2026-05-22 09:17 · `0c01bc8` · Enhance SSO functionality with logout support and schema updates

- Added `sso_provider_id` and `id_token_raw` columns to `IamUserRefreshToken` and `IamSsoLoginCode` models to store SSO session data.
- Implemented `sso_logout` endpoint to revoke refresh tokens and generate IdP logout URLs.
- Updated `create_login_code` and `exchange_login_code` functions to handle SSO session data.
- Enhanced SSO provider schema to include `end_session_endpoint` and `logout_uri` for improved logout handling.
- Updated documentation to reflect new logout flow and SSO session management.

 apps/app_db/migrations/versions/096_sso_logout_cols.py |  67 ++++++++++++++++++++++++
 apps/app_db/models/core.py                             |  11 ++++
 apps/app_db/router/sso.py                              |  52 ++++++++++++++++--
 apps/app_db/schemas/auth.py                            |   1 +
 apps/app_db/schemas/sso.py                             |   7 +++
 apps/app_db/scripts/seed_iam.py                        |   1 +
 apps/app_db/services/refresh_token_service.py          |  14 ++++-
 apps/app_db/services/sso_service.py                    |  94 +++++++++++++++++++++++++++++++--
 docs/SSO_OIDC_CLIENT.md                                | 163 +++++++++++++++++++++++++++++++++------------------------
 9 files changed, 333 insertions(+), 77 deletions(-)

### 2026-05-20 18:28 · `54e1c34` · Refactor SSO migration and schema

- Removed outdated SSO migration files (095-099) and consolidated them into a single migration (095_iam_sso_tables) for better management.
- Introduced new tables: `iam_identity_provider`, `iam_user_sso_identity`, and `iam_sso_login_code` to streamline SSO functionality.
- Updated the `iam_sso_provider` schema to include a foreign key reference to `iam_identity_provider` and renamed columns for clarity.
- Enhanced the `iam_user` table by adding `auth_provider` and `external_id` columns.
- Adjusted related service and schema files to reflect the new structure and relationships.

 apps/app_db/migrations/versions/095_iam_sso_provider.py      |  49 ---------------------
 apps/app_db/migrations/versions/095_iam_sso_tables.py        | 119 +++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/migrations/versions/096_iam_user_sso_identity.py |  34 ---------------
 apps/app_db/migrations/versions/097_iam_sso_login_code.py    |  29 -------------
 apps/app_db/migrations/versions/098_iam_user_sso_cols.py     |  29 -------------
 apps/app_db/migrations/versions/099_iam_identity_provider.py |  53 -----------------------
 apps/app_db/models/core.py                                   |  36 ++++++++++++----
 apps/app_db/router/sso.py                                    |  23 ++++------
 apps/app_db/schemas/sso.py                                   |  23 ++++------
 apps/app_db/scripts/seed_identity_provider.py                |  28 +-----------
 apps/app_db/scripts/set_sso_provider_secret.py               |  18 +++++---
 apps/app_db/services/sso_service.py                          |  81 ++++++++++++++++++++++++++++-------
 12 files changed, 243 insertions(+), 279 deletions(-)

### 2026-05-20 17:57 · `25db4d4` · Add iam_identity_provider table and update SSO provider schema

- Created a new lookup table `iam_identity_provider` to manage identity providers (e.g., Drupal, Google, Azure AD).
- Added a foreign key `provider_id` in the `iam_sso_provider` table to link to the new identity provider table.
- Updated the authentication router to conditionally reject local login requests based on the `LOCAL_LOGIN_ENABLED` setting.
- Enhanced SSO provider listing to include display names from the new identity provider table.
- Introduced seeding scripts for populating identity provider data and backfilling SSO provider IDs.

 .env.example                                                 |   9 ++--
 apps/app_db/migrations/versions/099_iam_identity_provider.py |  53 ++++++++++++++++++++++
 apps/app_db/models/core.py                                   |  20 ++++++++-
 apps/app_db/router/auth.py                                   |  10 +++++
 apps/app_db/router/sso.py                                    |  14 +++++-
 apps/app_db/schemas/sso.py                                   |   3 ++
 apps/app_db/scripts/seed_all.py                              |   6 ++-
 apps/app_db/scripts/seed_dm_iam_roles.py                     |  83 +++++++++++++++++++++++++++++++---
 apps/app_db/scripts/seed_identity_provider.py                | 125 +++++++++++++++++++++++++++++++++++++++++++++++++++
 9 files changed, 309 insertions(+), 14 deletions(-)

### 2026-05-19 16:40 · `4fe97b0` · doc updated

 docs/SSO_IMPLEMENTATION_PLAN.md | 995 --------------------------------------------------------------------------------
 docs/SSO_OIDC_CLIENT.md         | 778 ++++++++++++++++++++++++++++++++++++++++++++------------------
 2 files changed, 553 insertions(+), 1220 deletions(-)

### 2026-05-19 11:42 · `5bf04e0` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/sso

### 2026-05-19 11:42 · `eb4b78d` · SSO IMPLEMENTATION

 .env.example                                                 |  12 +
 apps/app_db/migrations/versions/095_iam_sso_provider.py      |  49 +++
 apps/app_db/migrations/versions/096_iam_user_sso_identity.py |  34 ++
 apps/app_db/migrations/versions/097_iam_sso_login_code.py    |  29 ++
 apps/app_db/migrations/versions/098_iam_user_sso_cols.py     |  29 ++
 apps/app_db/models/core.py                                   |  88 +++++
 apps/app_db/router/sso.py                                    | 321 +++++++++++++++++
 apps/app_db/schemas/sso.py                                   | 118 ++++++
 apps/app_db/scripts/seed_iam.py                              |  18 +
 apps/app_db/scripts/set_sso_provider_secret.py               |  58 +++
 apps/app_db/services/sso_service.py                          | 405 +++++++++++++++++++++
 apps/shared/config/config.py                                 |  25 ++
 apps/shared/utils/encryption.py                              |  16 +
 docs/SSO_IMPLEMENTATION_PLAN.md                              | 995 +++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/SSO_OIDC_CLIENT.md                                      | 705 ++++++++++++++++++++++++++++++++++++
 main.py                                                      |  10 +
 requirements.txt                                             |   1 +
 17 files changed, 2913 insertions(+)

### 2026-05-15 15:23 · `4971e51` · Enhance translation export functionality and update documentation

- Updated the translation export endpoint to generate a multi-sheet XLSX file, with separate sheets for 'Default', 'Data Manager', and 'Visualizer'.
- Revised the import functionality to handle multi-sheet XLSX files, ensuring only recognized sheets are processed.
- Improved API documentation for clarity on export and import features, including detailed descriptions of parameters and expected behaviors.

 apps/app_db/router/translations.py          |  55 ++-----
 apps/app_db/services/translation_service.py | 584 +++++++++++++++++++++++++++++++++++++++-----------------------------
 2 files changed, 350 insertions(+), 289 deletions(-)

### 2026-05-15 12:32 · `758af09` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-15 12:31 · `a16b687` · App config seed iam inconsistency fixed and translations updated

 apps/app_db/data/translations.json |  9 +++++++--
 apps/app_db/scripts/seed_iam.py    | 16 ++++++++++------
 2 files changed, 17 insertions(+), 8 deletions(-)

### 2026-05-14 18:29 · `f89fb15` · Add "ABOUT_US" and "ABOUT_US_DESCRIPTION" keys to translations.json

- Introduced new translation keys for "About Us" and its description in English, French, and Arabic to enhance user understanding of the DFA Visualizer platform.

 apps/app_db/data/translations.json | 6 ++++++
 1 file changed, 6 insertions(+)

### 2026-05-14 17:40 · `d74b683` · Update translations.json to add new keys for asset management

- Added "SETTINGS_CLEAR_ASSET" and "SETTINGS_ASSET_SET" keys in English, French, and Arabic for improved user interface clarity regarding file management.

 apps/app_db/data/translations.json | 6 ++++++
 1 file changed, 6 insertions(+)

### 2026-05-14 15:55 · `e0ce72f` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-14 15:55 · `849388b` · Enhance application configuration and insights features

- Added new configuration options for enabling insights and specifying AI provider details in config.json.
- Updated translations.json to include new keys for insights features in multiple languages.
- Introduced a new super admin role for the DFA Visualizer in seed_iam.py and updated role assignments accordingly.
- Implemented redaction for sensitive values in app_config.py, ensuring AI API keys are not exposed in GET responses.
- Added base64 decoding for sensitive values in app_config.py to handle encoded API keys.

 apps/app_db/data/config.json       |  5 ++++-
 apps/app_db/data/translations.json | 30 ++++++++++++++++++++++++++++++
 apps/app_db/scripts/seed_iam.py    | 37 +++++++++++++++++++++++++++----------
 apps/app_db/services/app_config.py | 32 ++++++++++++++++++++++++++++++--
 4 files changed, 91 insertions(+), 13 deletions(-)

### 2026-05-14 11:04 · `857fd17` · Updated migration

 apps/app_db/migrations/versions/{089_help_service_tables.py => 090_help_service_tables.py} | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)

### 2026-05-14 11:03 · `2b8f9fc` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-14 11:00 · `66ffb2a` · Create DFA Help Service tables

- Added migration script to create three new tables for hierarchical, multi-locale help content: dfahelp_adaptation, dfahelp_adaptation_key, and dfahelp_adaptation_key_i18n.
- Implemented soft-delete functionality and unique constraints for adaptation codes and locale keys.
- Included methods for table existence checks and defined upgrade/downgrade functions for database schema management.

 apps/app_db/migrations/versions/{088_help_service_tables.py => 089_help_service_tables.py} | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)

### 2026-05-14 10:58 · `2dc55ec` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-14 10:57 · `7fb8a52` · Add seed_help_adaptations script and update seeders list

- Introduced a new script, seed_help_adaptations.py, to seed default help adaptations for DFA applications.
- Updated the seeders list in seed_all.py to include the new help adaptations script.
- Enhanced the AdaptationBase model to allow for longer unique adaptation codes (max_length increased from 4 to 10).

 apps/app_db/scripts/seed_all.py                                       |   1 +
 apps/app_db/scripts/seed_help_adaptations.py                          | 214 ++++++++++++++++++++++++++++++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/core/models.py |   4 +-
 3 files changed, 217 insertions(+), 2 deletions(-)

### 2026-05-13 18:22 · `8856d32` · Refactor DFA Help Service imports to accommodate package directory structure

- Updated import paths for the DFA Help Service to use hyphens in the package directory.
- Added dynamic path adjustment to include the help service package in sys.path for both main.py and help_storage.py.
- Ensured compatibility with existing services by maintaining the structure of API routes and storage models.

 apps/app_db/services/help_storage.py | 10 ++++++++--
 main.py                              | 12 +++++++++---
 2 files changed, 17 insertions(+), 5 deletions(-)

### 2026-05-13 17:20 · `b361d16` · Add DFA Help Service integration with SQLAlchemy storage and API routes

- Introduced the DFA Help Service with SQLAlchemy storage for help content management.
- Updated main application to include help service router at /help.
- Added new API endpoints for help content retrieval and management in seed_iam.
- Enhanced memory storage to support key retrieval by string identifier.
- Updated models to include help-related adaptations.

 apps/app_db/migrations/versions/088_help_service_tables.py               |  89 +++++++++++++
 apps/app_db/models/__init__.py                                           |   8 ++
 apps/app_db/models/help.py                                               |  84 ++++++++++++
 apps/app_db/scripts/seed_iam.py                                          |  13 ++
 apps/app_db/services/help_storage.py                                     | 269 +++++++++++++++++++++++++++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/api/routes.py     |  35 +++--
 apps/shared/packages/dfa-help-service/dfa_help_service/storage/base.py   |   4 +
 apps/shared/packages/dfa-help-service/dfa_help_service/storage/memory.py |   9 ++
 main.py                                                                  |  20 ++-
 9 files changed, 521 insertions(+), 10 deletions(-)

### 2026-05-13 16:23 · `dbe2e66` · fixes

 apps/shared/packages/dfa-help-service/MANIFEST.in                           |  20 ++
 apps/shared/packages/dfa-help-service/README.md                             | 484 +++++++++++++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/__init__.py          |  24 ++
 apps/shared/packages/dfa-help-service/dfa_help_service/adapters/__init__.py |  15 +
 apps/shared/packages/dfa-help-service/dfa_help_service/adapters/base.py     |  58 +++
 .../packages/dfa-help-service/dfa_help_service/adapters/django/__init__.py  |   8 +
 .../packages/dfa-help-service/dfa_help_service/adapters/django/models.py    | 133 +++++++
 .../packages/dfa-help-service/dfa_help_service/adapters/django/urls.py      |   7 +
 .../packages/dfa-help-service/dfa_help_service/adapters/django_adapter.py   | 603 ++++++++++++++++++++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/adapters/fastapi.py  | 148 ++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/adapters/flask.py    | 417 ++++++++++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/api/__init__.py      |  18 +
 apps/shared/packages/dfa-help-service/dfa_help_service/api/routes.py        | 358 +++++++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/api/schemas.py       | 166 +++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/core/__init__.py     |  13 +
 apps/shared/packages/dfa-help-service/dfa_help_service/core/models.py       | 144 ++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/core/services.py     | 284 +++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/core/utils.py        | 172 +++++++++
 .../packages/dfa-help-service/dfa_help_service/migrations/0001_initial.py   |  90 +++++
 .../packages/dfa-help-service/dfa_help_service/migrations/__init__.py       |   3 +
 .../packages/dfa-help-service/dfa_help_service/migrations/create_tables.sql |  63 ++++
 apps/shared/packages/dfa-help-service/dfa_help_service/storage/__init__.py  |  15 +
 apps/shared/packages/dfa-help-service/dfa_help_service/storage/base.py      | 109 ++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/storage/cache.py     | 157 +++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/storage/database.py  | 166 +++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/storage/memory.py    | 327 +++++++++++++++++
 apps/shared/packages/dfa-help-service/dfa_help_service/tests/__init__.py    |   3 +
 apps/shared/packages/dfa-help-service/dfa_help_service/tests/test_core.py   | 204 +++++++++++
 apps/shared/packages/dfa-help-service/docs/database-setup.md                | 173 +++++++++
 apps/shared/packages/dfa-help-service/docs/dfa-help-service.md              | 679 ++++++++++++++++++++++++++++++++++++
 apps/shared/packages/dfa-help-service/examples/basic_usage.py               |  94 +++++
 apps/shared/packages/dfa-help-service/requirements-dev.txt                  |  31 ++
 apps/shared/packages/dfa-help-service/requirements.txt                      |  62 ++++
 apps/shared/packages/dfa-help-service/setup.py                              |  78 +++++
 34 files changed, 5326 insertions(+)

### 2026-05-13 15:11 · `065f0bb` · updated

 apps/datawarehouse/router/language.py | 11 +++++------
 1 file changed, 5 insertions(+), 6 deletions(-)

### 2026-05-13 12:09 · `a71a6ca` · removes try except blocks in favour of global exceptional handling implementation

 apps/datawarehouse/router/language.py          |  96 ++++++++++++++--------------------------
 apps/datawarehouse/services/language_export.py | 156 +++++++++++++++++++++++++++++------------------------------------
 apps/datawarehouse/services/language_import.py |  15 ++++---
 3 files changed, 112 insertions(+), 155 deletions(-)

### 2026-05-13 11:45 · `3b6468d` · Merge branches 'feature/map' and 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-13 11:34 · `e38f7c8` · seed_iam updated for export and import

 apps/app_db/scripts/seed_iam.py | 2 ++
 1 file changed, 2 insertions(+)

### 2026-05-13 09:21 · `9bed997` · Implement language import and export endpoints in the data warehouse router. Added functionality to export language translations as XLSX files and import translations from XLSX files. Updated the language export service to handle optional source language inclusion. Introduced a new service for processing language imports from XLSX files.

 apps/datawarehouse/router/language.py          | 127 ++++++++++++++++++++++++-
 apps/datawarehouse/services/language_export.py |  11 ++-
 apps/datawarehouse/services/language_import.py | 328 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 461 insertions(+), 5 deletions(-)

### 2026-05-11 14:02 · `2a1997a` · Renamed migration file

 apps/app_db/migrations/versions/{075_create_sys_share_link.py => 076_create_sys_share_link.py} | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)

### 2026-05-11 14:01 · `7512d42` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-11 12:42 · `7022ade` · Fix: Updated the migration file to seed iam for the new endpoints

 apps/app_db/migrations/versions/075_create_sys_share_link.py | 97 ++++++++++++++++++++++++++++++++++++++++++----------
 1 file changed, 79 insertions(+), 18 deletions(-)

### 2026-05-11 12:17 · `a77f7c3` · Updated the sequence in the public export list

 apps/app_db/models/core.py | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-05-11 12:09 · `db8da8b` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-11 12:09 · `971a137` · Feature: Implementation of share url

 apps/app_db/migrations/versions/075_create_sys_share_link.py | 41 +++++++++++++++++++++++++
 apps/app_db/models/core.py                                   | 22 ++++++++++++++
 apps/app_db/router/api.py                                    |  7 ++++-
 apps/app_db/router/share_links.py                            | 86 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/schemas/share_link.py                            | 20 ++++++++++++
 apps/app_db/scripts/seed_iam.py                              |  7 +++++
 apps/app_db/services/share_link_service.py                   | 60 ++++++++++++++++++++++++++++++++++++
 7 files changed, 242 insertions(+), 1 deletion(-)

### 2026-05-08 18:40 · `dbb65da` · Updated configuration and translations: enhanced description for LANGUAGE_ENABLED in config.json and added numerous new translation keys in translations.json. Modified seed_iam.py to include system language access for visualization.

 apps/app_db/data/config.json       |    2 +-
 apps/app_db/data/translations.json | 1010 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 apps/app_db/scripts/seed_iam.py    |    3 +-
 3 files changed, 1008 insertions(+), 7 deletions(-)

### 2026-05-08 12:31 · `df10853` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-07 13:52 · `24a4141` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-05-07 10:06 · `7d773f3` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-04-29 15:02 · `daf5cba` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/map

### 2026-04-29 14:50 · `904557f` · Enhance IUS handling and configuration management

- Added "DW_MAPS" key to system configuration and JSON config files for choropleth basemap paths.
- Implemented logic to resolve DW_MAPS for data warehouse synchronization.
- Updated IUS_GID_SEPARATOR handling to read from system configuration, ensuring consistent GID formatting across the application.
- Enhanced indicator service to include IUS NIDs in the response when requested.
- Added unit tests for IUS-related functionality to ensure correct behavior of new features.

 apps/app_db/constants/system_config.py                  |  1 +
 apps/app_db/data/config.json                            | 11 ++++++---
 apps/app_db/router/app_config.py                        |  3 +++
 apps/app_db/services/dw_optimizer.py                    | 66 ++++++++++++++++++++++++++++++++++++++-----------
 apps/datawarehouse/constants.py                         |  6 +++--
 apps/datawarehouse/router/indicator.py                  | 11 ++++++---
 apps/datawarehouse/schemas/indicator.py                 |  2 +-
 apps/datawarehouse/services/data_service.py             |  9 ++++---
 apps/datawarehouse/services/indicator.py                | 77 ++++++++++++++++++++++++++++++++++++++++++++++++---------
 apps/datawarehouse/services/indicator_classification.py |  3 ++-
 apps/datawarehouse/services/ius.py                      |  5 ++--
 apps/datawarehouse/tests/test_api/test_indicator.py     | 16 +++++++++++-
 apps/datawarehouse/tests/test_indicator_ius_helpers.py  | 21 ++++++++++++++++
 apps/shared/config/config.py                            | 11 ++-------
 apps/shared/middleware/auth_middleware.py               |  2 ++
 apps/shared/utils/ius_utils.py                          | 56 ++++++++++++++++++++++++++++++++++++-----
 16 files changed, 242 insertions(+), 58 deletions(-)

### 2026-04-29 14:45 · `75b78ab` · Implement DW_MAPS resolution logic in dw_optimizer.py

- Added a new function `_resolve_dw_maps_for_warehouse` to handle the retrieval of DW_MAPS configuration, prioritizing core DB values over settings.
- Updated the `perform_sync_ut_dw_configs` function to utilize the new resolution logic for DW_MAPS, ensuring proper synchronization with the database.
- Enhanced documentation to clarify the order of preference for configuration values.

 apps/app_db/services/dw_optimizer.py | 24 +++++++++++++++++++++---
 1 file changed, 21 insertions(+), 3 deletions(-)

### 2026-04-29 14:02 · `793c305` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into develop

### 2026-04-29 13:59 · `952d37d` · Add DW_MAPS configuration and update related logic

- Introduced new configuration keys for DW_MAPS in system_config.py and config.json.
- Updated dw_optimizer.py to handle DW_MAPS in the database synchronization process.
- Added DFA_DML_URL and DW_MAPS to shared config settings.

 apps/app_db/constants/system_config.py |  1 +
 apps/app_db/data/config.json           |  2 ++
 apps/app_db/services/dw_optimizer.py   | 48 ++++++++++++++++++++++++++++++++++--------------
 apps/shared/config/config.py           |  2 ++
 4 files changed, 39 insertions(+), 14 deletions(-)

### 2026-04-14 14:56 · `53e84a9` · Add sv_order to subgroup data in DataService

 apps/datawarehouse/services/data_service.py | 1 +
 1 file changed, 1 insertion(+)

### 2026-04-01 12:57 · `50b9dc4` · Enhance README and SEARCH_INDEX_SERVICE documentation with detailed setup instructions for the Data Warehouse search index, including commands for creating and populating search tables. Clarified prerequisites and operational scope for users of the DFA Visualizer.

 README.md                    | 61 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 docs/SEARCH_INDEX_SERVICE.md | 70 ++++++++--------------------------------------------------------------
 2 files changed, 68 insertions(+), 63 deletions(-)

### 2026-03-27 11:54 · `06e4f37` · Enhance search functionality by implementing a multi-phase search strategy, including exact synonym matching. Update search response to include metadata for result count and limit. Modify search index builder to generate trigrams from both canonical and synonym texts. Update tests to reflect changes in synonym handling and ensure comprehensive coverage.

 apps/datawarehouse/router/search.py                                         | 12 ++++++++--
 apps/datawarehouse/services/search/service.py                               | 44 ++++++++++++++++++-------------------
 apps/datawarehouse/services/search_index/search_index_builder.py            | 13 +++++++----
 .../datawarehouse/services/search_index/search_index_incremental_updater.py |  9 ++++++--
 apps/shared/schemas/search.py                                               | 12 +++++++++-
 tests/test_services/test_search/test_search_service.py                      | 43 +++++++++++++-----------------------
 tests/test_services/test_search_index_builder.py                            |  9 ++++----
 7 files changed, 78 insertions(+), 64 deletions(-)

### 2026-03-26 19:02 · `d98dd0a` · Added PRIMARY KEY constraint to id column in search_keyword_ngram table

 apps/app_db/SQL/schema_search_mysql.sql | 1 +
 1 file changed, 1 insertion(+)

### 2026-03-25 10:21 · `281d6b2` · Update gallery description in main.py to reflect per-user functionality instead of system-wide access.

 main.py | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-03-25 10:18 · `f0b5954` · Update access control for app configuration and translations in seed_iam.py. Changed access from APP_CLIENT to AUTHENTICATED for relevant endpoints to enhance security and ensure proper user authentication.

 apps/app_db/scripts/seed_iam.py | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

### 2026-03-24 18:55 · `7a75f89` · Refactor gallery models and service to use SystemGallery and SystemGalleryKeyword. Updated imports and method references to reflect new naming conventions for improved clarity and consistency.

 apps/app_db/models/__init__.py          |  8 ++++----
 apps/app_db/models/core.py              | 14 +++++++-------
 apps/app_db/services/gallery_service.py | 34 +++++++++++++++++-----------------
 3 files changed, 28 insertions(+), 28 deletions(-)

### 2026-03-24 18:31 · `54ab2d6` · Implement migration to rename gallery tables to system_gallery and system_gallery_keyword, and remove user_id column from system_gallery for improved access control.

 .../versions/{028_rename_gallery_to_system_gallery.py => 036_rename_gallery_to_system_gallery.py}      | 10 +++++-----
 1 file changed, 5 insertions(+), 5 deletions(-)

### 2026-03-24 18:21 · `1217e4d` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/gallery-api

### 2026-03-24 18:21 · `7701bb2` · Enhance gallery API with user-specific access control. Integrated user ID and app key dependencies into gallery operations, ensuring that users can only access their own gallery items. Updated service methods to enforce access checks and modified payload schemas to include new fields. Improved error handling for unauthorized actions. Adjusted tests to validate user-specific behavior in gallery API endpoints.

 apps/app_db/router/gallery.py                  |  26 +++++++++---
 apps/app_db/schemas/gallery.py                 |   9 +++--
 apps/app_db/services/gallery_service.py        | 140 ++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------
 apps/app_db/tests/conftest.py                  |  11 +++++-
 apps/app_db/tests/test_api/test_gallery_api.py |   9 +++--
 apps/datawarehouse/constants.py                |   4 +-
 apps/datawarehouse/router/data.py              |   7 ++--
 apps/datawarehouse/services/data_service.py    |  26 +++++++++---
 apps/datawarehouse/tests/test_api/test_data.py |  23 ++++++++---
 9 files changed, 202 insertions(+), 53 deletions(-)

### 2026-03-23 17:29 · `a0a05d4` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/gallery-api

### 2026-03-23 17:29 · `043fa69` · Refactor gallery API to support system-wide functionality. Updated database schema to rename gallery tables to system_gallery and system_gallery_keyword, removing user_id for a shared model. Adjusted service and router logic to reflect these changes, including pagination and response structure updates. Enhanced tests to align with new API behavior.

 apps/app_db/migrations/versions/028_rename_gallery_to_system_gallery.py | 52 ++++++++++++++++++++++++++++++
 apps/app_db/models/core.py                                              | 11 +++----
 apps/app_db/router/gallery.py                                           | 70 +++++++++++++++++------------------------
 apps/app_db/schemas/gallery.py                                          |  6 ++--
 apps/app_db/services/gallery_service.py                                 | 35 ++++++++-------------
 apps/app_db/tests/test_api/test_gallery_api.py                          | 14 ++++-----
 main.py                                                                 |  2 +-
 7 files changed, 110 insertions(+), 80 deletions(-)

### 2026-03-20 17:50 · `7b0503f` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-api into feature/gallery-api

### 2026-03-20 17:32 · `144cf2c` · Enhance IAM API: Add APP_CLIENT access for app config and translations endpoints for both dm and visualizer. Include new translation retrieval by code functionality.

 apps/app_db/scripts/seed_iam.py | 8 ++++++--
 1 file changed, 6 insertions(+), 2 deletions(-)

### 2026-03-06 18:35 · `a9026c0` · Refactor data retrieval parameters to use unified identifier naming convention. Replaced individual NID/GID parameters with `i_identifier`, `u_identifier`, `sg_identifier`, and `ar_identifier` in the data fetching methods. Updated documentation and tests to reflect these changes, ensuring backward compatibility with existing API calls.

 apps/datawarehouse/router/data.py              |  63 ++++++++----------------
 apps/datawarehouse/services/data_service.py    | 170 +++++++++++++++++++++++++++++++++++++----------------------------
 apps/datawarehouse/tests/test_api/test_data.py |  27 ++++++-----
 3 files changed, 129 insertions(+), 131 deletions(-)

### 2026-03-06 18:05 · `62e0580` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/gallery-api

### 2026-03-02 14:15 · `4a2c73c` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/gallery-api

### 2026-02-26 10:08 · `aecfa6c` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/gallery-api

### 2026-02-26 09:45 · `e207d41` · Remove IAM module and related files as gallery functionality is consolidated under apps.app_db. This includes the deletion of IAM-specific dependencies, configuration, router, schemas, and tests.

 apps/app_db/migrations/versions/006_create_user_visualizations.py |  2 +-
 apps/iam/__init__.py                                              |  3 ---
 apps/iam/config/__init__.py                                       |  7 -------
 apps/iam/config/config.py                                         |  5 -----
 apps/iam/dependencies.py                                          | 18 ------------------
 apps/iam/router/api.py                                            |  7 -------
 apps/iam/schemas/__init__.py                                      |  5 -----
 apps/iam/tests/__init__.py                                        |  1 -
 apps/iam/tests/conftest.py                                        |  5 -----
 apps/iam/tests/test_api/__init__.py                               |  1 -
 10 files changed, 1 insertion(+), 53 deletions(-)

### 2026-02-25 19:25 · `968e247` · Create migration for user_visualizations and user_visualization_keywords tables

- Added migration script to create `user_visualizations` and `user_visualization_keywords` tables.
- Implemented checks to avoid creating tables if they already exist.
- Defined columns and relationships for user-specific gallery items and associated keywords.

 apps/app_db/migrations/versions/{005_create_user_visualizations.py => 006_create_user_visualizations.py} | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)

### 2026-02-25 19:23 · `6eef987` · Merge branches 'feature/gallery-api' and 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/gallery-api

### 2026-02-25 19:14 · `f59d5a4` · Refactor gallery API and database models for user visualizations

- Removed IAM-related router and models, consolidating gallery functionality under `apps.app_db`.
- Introduced new `UserVisualization` and `UserVisualizationKeyword` models to represent user-specific gallery items and their associated keywords.
- Added `gallery.py` router for CRUD operations on gallery items, including listing, adding, updating, and deleting.
- Created corresponding schemas for gallery item requests and responses.
- Implemented a service layer for handling gallery operations, ensuring separation of concerns.
- Added tests for gallery API endpoints to validate functionality and error handling.

 apps/app_db/dependencies.py                                                 | 18 ++++++++++
 .../{004_create_iam_user_galleries.py => 005_create_user_visualizations.py} | 34 +++++++++---------
 apps/app_db/models/__init__.py                                              |  8 ++---
 apps/app_db/models/core.py                                                  | 22 ++++++------
 apps/app_db/router/api.py                                                   |  7 +++-
 apps/{iam => app_db}/router/gallery.py                                      |  6 ++--
 apps/app_db/schemas/__init__.py                                             | 14 ++++++++
 apps/{iam => app_db}/schemas/gallery.py                                     |  2 +-
 apps/{iam => app_db}/services/gallery_service.py                            | 69 ++++++++++++++++++++++++-------------
 apps/app_db/tests/conftest.py                                               | 16 +++++++++
 apps/{iam => app_db}/tests/test_api/test_gallery_api.py                     | 24 ++++++-------
 apps/iam/router/api.py                                                      |  6 ++--
 apps/iam/schemas/__init__.py                                                | 17 ++-------
 apps/iam/tests/conftest.py                                                  | 33 ++----------------
 main.py                                                                     |  2 --
 15 files changed, 154 insertions(+), 124 deletions(-)

### 2026-02-25 12:01 · `5ceaa31` · Enhance IAM test configuration and gallery API tests

- Updated `conftest.py` to mock the app DB engine, allowing tests to run without a live MySQL connection.
- Modified `test_gallery_api.py` to adjust the way arguments are accessed in the `mock_add` call, improving clarity and maintainability.

 apps/iam/tests/conftest.py                  | 10 +++++++++-
 apps/iam/tests/test_api/test_gallery_api.py |  7 ++++---
 2 files changed, 13 insertions(+), 4 deletions(-)

### 2026-02-25 11:48 · `fc5ac03` · Merge branches 'feature/gallery-api' and 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/gallery-api

### 2026-02-24 17:38 · `f57aadf` · Enhance gallery API and models with additional validation and comments

- Added TODO comments in models and dependencies for future user model integration.
- Updated Gallery schemas to allow extra fields and added field validation for time coercion.
- Modified previewData type to Optional[Any] in multiple schemas and services to accommodate both object and list formats.
- Implemented tests to ensure previewData can be accepted as an object for snapshots in add and update operations.

 apps/app_db/models/core.py                  |  1 +
 apps/iam/dependencies.py                    |  4 ++++
 apps/iam/schemas/gallery.py                 | 21 +++++++++++++++++----
 apps/iam/services/gallery_service.py        |  7 +++----
 apps/iam/tests/test_api/test_gallery_api.py | 43 +++++++++++++++++++++++++++++++++++++++++++
 5 files changed, 68 insertions(+), 8 deletions(-)

### 2026-02-24 16:08 · `64f0ecd` · Add search index router and schemas for building search index

 apps/datawarehouse/router/api.py           |   2 ++
 apps/datawarehouse/router/search_index.py  | 101 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/datawarehouse/schemas/search_index.py |  27 +++++++++++++++++++
 3 files changed, 130 insertions(+)

### 2026-02-24 11:32 · `f6640bb` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/gallery-api

### 2026-02-24 11:15 · `80e20b6` · Add IAM user gallery functionality with CRUD operations

- Introduced IAMUserGallery and IAMUserGallerySearch models for managing user-specific galleries.
- Implemented gallery API endpoints for listing, adding, updating, and deleting gallery items.
- Added necessary schemas for request and response validation.
- Integrated IAM dependencies for user identification.
- Updated main application to include IAM router and gallery API documentation.
- Created migration script for new database tables.
- Added tests for gallery API endpoints to ensure functionality and error handling.

 apps/app_db/migrations/versions/004_create_iam_user_galleries.py |  79 ++++++++++++++
 apps/app_db/models/__init__.py                                   |   4 +
 apps/app_db/models/core.py                                       |  52 ++++++++++
 apps/iam/__init__.py                                             |   3 +
 apps/iam/config/__init__.py                                      |   7 ++
 apps/iam/config/config.py                                        |   5 +
 apps/iam/dependencies.py                                         |  14 +++
 apps/iam/router/api.py                                           |   9 ++
 apps/iam/router/gallery.py                                       | 184 +++++++++++++++++++++++++++++++++
 apps/iam/schemas/__init__.py                                     |  18 ++++
 apps/iam/schemas/gallery.py                                      |  74 +++++++++++++
 apps/iam/services/gallery_service.py                             | 264 +++++++++++++++++++++++++++++++++++++++++++++++
 apps/iam/tests/__init__.py                                       |   1 +
 apps/iam/tests/conftest.py                                       |  24 +++++
 apps/iam/tests/test_api/__init__.py                              |   1 +
 apps/iam/tests/test_api/test_gallery_api.py                      | 146 ++++++++++++++++++++++++++
 main.py                                                          |  10 ++
 17 files changed, 895 insertions(+)

### 2026-02-16 19:45 · `2e62042` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/data_api

### 2026-02-16 19:40 · `24ce9ab` · Add endpoint to list indicators for a specific indicator classification

- Implemented a new GET endpoint `/dw/{dw_id}/ic/{ic_identifier}/indicators` to retrieve a paginated list of indicators linked to a given indicator classification.
- Integrated caching for improved performance and response times.
- Enhanced error handling to return appropriate responses for not found and bad request scenarios.
- Updated API documentation to reflect the new endpoint and its parameters.
- Added unit tests to cover success, not found, and pagination scenarios for the new endpoint.

 apps/datawarehouse/router/indicator.py                             |  12 +-
 apps/datawarehouse/router/indicator_classification.py              | 105 +++++++++++++++
 apps/datawarehouse/services/indicator.py                           | 315 +++++++++++++++++++++++++++++----------------
 apps/datawarehouse/tests/test_api/test_indicator_classification.py |  93 +++++++++++++
 4 files changed, 404 insertions(+), 121 deletions(-)

### 2026-02-16 16:53 · `059e642` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/data_api

### 2026-02-16 16:51 · `0724e49` · Enhance get_all_indicators endpoint to support filtering by indicator classification

- Added optional query parameters `ic_nid` and `ic_gid` to filter indicators based on their classification.
- Implemented a new service method `_resolve_ic_filter_to_nid` to resolve the classification ID from either `ic_nid` or `ic_gid`.
- Updated caching logic to include the new filter parameters.
- Enhanced error handling to return a 404 response if the specified classification is not found.
- Updated documentation to reflect the new filtering capabilities.

 apps/datawarehouse/router/indicator.py   | 12 +++++++++++-
 apps/datawarehouse/services/indicator.py | 67 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 2 files changed, 72 insertions(+), 7 deletions(-)

### 2026-02-16 14:30 · `e89c306` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/data_api

### 2026-02-16 11:17 · `85f1bd7` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/data_api

### 2026-02-16 00:57 · `4fc1832` · Implement data response schema and update API to support new subgroup parameters

- Added DataRowResponseSchema for response validation in GET /dw/{dw_id}/data.
- Updated API endpoint to include new parameters: sg_nid, sg_gid, and isdefaultenabled.
- Refactored response handling to utilize success_response utility for consistent API responses.
- Enhanced documentation for mandatory parameters and filters in the API description.
- Added tests to validate response structure and behavior with new parameters.

 apps/datawarehouse/router/data.py              |  42 +++++++++++-------
 apps/datawarehouse/schemas/data.py             |  56 +++++++++++++++++++++++
 apps/datawarehouse/services/data_service.py    | 102 ++++++++++++++++++++++++------------------
 apps/datawarehouse/tests/test_api/test_data.py | 156 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 297 insertions(+), 59 deletions(-)

### 2026-02-13 16:01 · `f791a7d` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/data_api

### 2026-02-13 15:53 · `59b46ae` · Added column mappings for data attributes in db_tbl_cols_mapping.json

 apps/datawarehouse/config/db_tbl_cols_mapping.json | 19 ++++++++++++++++++-
 1 file changed, 18 insertions(+), 1 deletion(-)

### 2026-02-09 16:33 · `f3407c1` · Refactor _normalize_list_param function in data_service.py

- Improved the handling of list parameters by ensuring that each item is stripped of whitespace and split by commas, allowing for more flexible input formats.
- Enhanced the function to return a flattened list of non-empty strings, improving data normalization.

 apps/datawarehouse/services/data_service.py | 7 ++++++-
 1 file changed, 6 insertions(+), 1 deletion(-)

### 2026-02-09 12:45 · `8a649f0` · Update search response structure and documentation

- Changed `keywordId` in the search response to represent the entity ID (e.g., indicator_nid, area_nid) for better clarity in linking to the actual entity APIs.
- Updated the `SearchResultItem` schema to reflect the new definition of `keywordId`.
- Enhanced documentation to clarify the purpose of `keywordId` and its usage with entity APIs.

 apps/datawarehouse/router/search.py | 5 +++--
 apps/shared/schemas/search.py       | 4 ++--
 docs/SEARCH_QUERY.md                | 5 +++--
 3 files changed, 8 insertions(+), 6 deletions(-)

### 2026-02-10 11:49 · `e815331` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/app-config

### 2026-02-09 16:33 · `72e44f3` · Refactor _normalize_list_param function in data_service.py

- Improved the handling of list parameters by ensuring that each item is stripped of whitespace and split by commas, allowing for more flexible input formats.
- Enhanced the function to return a flattened list of non-empty strings, improving data normalization.

 apps/datawarehouse/services/data_service.py | 7 ++++++-
 1 file changed, 6 insertions(+), 1 deletion(-)

### 2026-02-09 12:45 · `5265332` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/app-config

### 2026-02-09 12:45 · `434530f` · Update search response structure and documentation

- Changed `keywordId` in the search response to represent the entity ID (e.g., indicator_nid, area_nid) for better clarity in linking to the actual entity APIs.
- Updated the `SearchResultItem` schema to reflect the new definition of `keywordId`.
- Enhanced documentation to clarify the purpose of `keywordId` and its usage with entity APIs.

 apps/datawarehouse/router/search.py | 5 +++--
 apps/shared/schemas/search.py       | 4 ++--
 docs/SEARCH_QUERY.md                | 5 +++--
 3 files changed, 8 insertions(+), 6 deletions(-)

### 2026-02-06 17:10 · `a86ec8f` · Add search tables and related functionality for Data Warehouse

- Introduced new SQL schema for search tables: `search_keywords`, `search_keyword_synonym`, and `search_keyword_ngram`.
- Updated `SystemDatawarehouseService` to create and manage search tables during warehouse creation.
- Added scripts for creating and populating search tables from UT data.
- Enhanced API router to return information about search tables created during warehouse setup.
- Updated documentation to include instructions for managing search tables and populating data.

 apps/app_db/SQL/schema_search_mysql.sql               |  41 ++++++++++++
 apps/app_db/router/datawarehouse.py                   |   3 +-
 apps/app_db/router/translations.py                    |   5 --
 apps/app_db/services/datawarehouse.py                 |  35 +++++++++--
 apps/datawarehouse/db/datawarehouse.py                |   6 +-
 apps/datawarehouse/models/datawarehouse.py            |   1 +
 apps/datawarehouse/router/data.py                     |   4 +-
 apps/datawarehouse/schemas/datawarehouse.py           |   4 +-
 apps/datawarehouse/scripts/build_search_index.py      |  70 +++++++++++++++++++++
 apps/datawarehouse/scripts/create_search_tables.py    | 104 ++++++++++++++++++++++++++++++
 apps/datawarehouse/scripts/seed_data_api_test_data.py | 150 +++++++++++++++++++++++++++++--------------
 apps/datawarehouse/services/data_service.py           | 115 ++++++++++++++-------------------
 apps/datawarehouse/services/search_index/tables.py    |   5 +-
 apps/datawarehouse/utils/search_schema.py             |  47 ++++++++++++++
 apps/shared/config/config.py                          |   2 +-
 apps/shared/utils/sql_adapter.py                      |  45 +++++++++----
 docs/SEARCH_INDEX_SERVICE.md                          |  90 +++++++++++++++++++++++---
 docs/SEARCH_QUERY.md                                  |  34 +++++++---
 test_scripts/run_dw_search_index.py                   |  47 +++-----------
 test_scripts/run_dw_search_index_indicators_only.py   | 199 ----------------------------------------------------------
 20 files changed, 606 insertions(+), 401 deletions(-)

### 2026-02-05 18:07 · `f9699f8` · Update AppDBSettings to set default value for ADAPTATION and enhance Data Warehouse API router

- Set default value for ADAPTATION in AppDBSettings to an empty string.
- Updated Data Warehouse API router to include new data endpoints and organized existing routes for better clarity.
- Added debug-only route for seeding test data when DEBUG is enabled.

 apps/app_db/config/config.py     |  2 +-
 apps/datawarehouse/router/api.py | 18 +++++++++++++++++-
 2 files changed, 18 insertions(+), 2 deletions(-)

### 2026-02-05 17:58 · `f29bf1d` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/app-config

### 2026-02-05 17:56 · `44a4861` · Enhance Data Management API and seeding scripts

- Introduced a new API endpoint to fetch data rows from the Data Management API (`GET /dw/{dw_id}/data`) with flexible filters, pagination, and optional metadata.
- Added a new service layer (`DataService`) to handle data retrieval logic, including mandatory indicator filters and default IUS handling.
- Created a seeding script to prepare test data for the Data Management API, covering various scenarios and filters.
- Updated the API router to include the new data endpoint and organized existing routes for better clarity.
- Enhanced the README with instructions for testing the Data API and seeding data.

 README.md                                             |  19 +++
 apps/app_db/scripts/seed_translations.py              | 226 +++++++++++++++---------
 apps/datawarehouse/router/api.py                      |   8 +-
 apps/datawarehouse/router/data.py                     | 130 ++++++++++++++
 apps/datawarehouse/scripts/seed_data_api_test_data.py | 479 +++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/datawarehouse/services/data_service.py           | 538 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 apps/shared/middleware/logging.py                     |   2 +-
 7 files changed, 1323 insertions(+), 79 deletions(-)

### 2026-02-05 15:02 · `1897f36` · Update translations API endpoint to use appkey instead of keyword

 apps/app_db/router/translations.py | 31 ++++++++++++++++---------------
 1 file changed, 16 insertions(+), 15 deletions(-)

### 2026-02-05 14:32 · `02e32e1` · Refactor database connection and enhance test setup

- Merged import statements for SQLAlchemy components in `core.py`.
- Updated test database session management in `conftest.py` to create the test engine only when needed, improving efficiency.
- Added unit tests for app-config and translations API endpoints, ensuring proper response handling and error scenarios.
- Implemented unit tests for AppConfigService and TranslationService, covering various cases including successful retrievals and error handling.
- Introduced shared validators tests to ensure proper functionality of utility functions.

 apps/app_db/db/core.py                                      |   3 +-
 apps/app_db/tests/conftest.py                               |  28 ++++---
 apps/app_db/tests/test_api/test_app_config.py               |  88 ++++++++++++++++++++++
 apps/app_db/tests/test_api/test_translations.py             | 183 +++++++++++++++++++++++++++++++++++++++++++++
 apps/app_db/tests/test_services/test_app_config_service.py  | 102 +++++++++++++++++++++++++
 apps/app_db/tests/test_services/test_translation_service.py | 212 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 tests/test_utils/test_validators.py                         |  83 ++++++++++++++++++++
 7 files changed, 686 insertions(+), 13 deletions(-)

### 2026-02-04 14:36 · `f1fcad5` · Implement translation service and API endpoints

- Added a new router for translations, including endpoints to retrieve global translations and translations by application keyword.
- Introduced a TranslationService for handling translation lookups from the database.
- Updated the SystemLanguageTranslation model and schema to allow nullable app_id for global translations.
- Created a seeding script to populate translation data for testing and development purposes.
- Enhanced the core API router to include the new translations router.

 apps/app_db/migrations/versions/003_create_system_language_translations.py |   3 +-
 apps/app_db/models/core.py                                                 |   3 +-
 apps/app_db/router/api.py                                                  |   6 +-
 apps/app_db/router/translations.py                                         | 107 ++++++++++++++++++++++++++++
 apps/app_db/schemas/core.py                                                |   2 +-
 apps/app_db/scripts/seed_translations.py                                   | 140 +++++++++++++++++++++++++++++++++++++
 apps/app_db/services/translation_service.py                                | 122 ++++++++++++++++++++++++++++++++
 7 files changed, 377 insertions(+), 6 deletions(-)

### 2026-02-03 17:43 · `a3563ba` · Add system language translations and i18n tables with corresponding models and schemas

- Created migration for `system_language_translations` and `system_language_translations_i18n` tables.
- Added SQLAlchemy models for `SystemLanguageTranslation` and `SystemLanguageTranslationI18n`.
- Implemented response schemas for system language translations and locale entries to support API responses.

 apps/app_db/migrations/versions/003_create_system_language_translations.py | 71 ++++++++++++++++++++++++++++++++++++++
 apps/app_db/models/__init__.py                                             |  4 +++
 apps/app_db/models/core.py                                                 | 56 +++++++++++++++++++++++++++++-
 apps/app_db/router/api.py                                                  |  2 +-
 apps/app_db/schemas/core.py                                                | 21 +++++++++++
 5 files changed, 152 insertions(+), 2 deletions(-)

### 2026-02-02 18:35 · `e924c07` · Enhance API router to include tags for application configuration

- Added a tag "Core - App Config" to the API router for better organization and documentation of routes related to application configurations.

 apps/app_db/router/api.py | 1 +
 1 file changed, 1 insertion(+)

### 2026-02-02 18:31 · `e5e0819` · Add system applications and configurations tables with corresponding service and router

- Created migration for `system_applications` and `system_configurations` tables.
- Added SQLAlchemy models for `SystemApplication` and `SystemConfiguration`.
- Implemented `AppConfigService` for fetching application configurations by appkey.
- Introduced new API router for application configuration retrieval.
- Updated schemas to support app configuration responses.
- Enhanced core router to include the new app configuration routes.

 .../versions/002_create_system_applications_and_configurations.py           | 48 +++++++++++++++++++++++++++++
 apps/app_db/models/__init__.py                                              | 10 +++++++
 apps/app_db/models/core.py                                                  | 42 ++++++++++++++++++++++++--
 apps/app_db/router/api.py                                                   |  6 +++-
 apps/app_db/router/app_config.py                                            | 60 +++++++++++++++++++++++++++++++++++++
 apps/app_db/schemas/core.py                                                 | 11 +++++++
 apps/app_db/services/app_config_service.py                                  | 53 ++++++++++++++++++++++++++++++++
 7 files changed, 227 insertions(+), 3 deletions(-)

### 2026-02-02 10:00 · `25b4e22` · Refactor import paths in search module

- Updated import statements in `search.py` to align with the new application structure, moving imports from `apps.shared` to `apps.datawarehouse`.
- Ensured consistency in utility function imports for n-grams and text normalization, enhancing code organization and maintainability.

 apps/datawarehouse/router/search.py |   6 ++--
 docs/SEARCH_QUERY.md                | 115 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 118 insertions(+), 3 deletions(-)

### 2026-01-28 11:05 · `523e07d` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/search-query

### 2026-01-27 18:44 · `f06fa79` · Add search API schemas and utility functions

- Introduced new schemas for the search API in `search.py`, including `SearchResultItem` and `SearchResponseData` for response serialization.
- Added utility functions for n-gram generation in `ngrams.py`, which will assist in search indexing and tokenization.
- Created a text utility module in `text.py` for normalizing free-text input, ensuring consistent formatting for search queries.
- Updated the `utils/__init__.py` to provide a description of the utility functions available in the data warehouse application.

 apps/{shared => datawarehouse}/schemas/search.py | 0
 apps/datawarehouse/utils/__init__.py             | 1 +
 apps/{shared => datawarehouse}/utils/ngrams.py   | 0
 apps/{shared => datawarehouse}/utils/text.py     | 0
 4 files changed, 1 insertion(+)

### 2026-01-27 18:25 · `7bb3736` · Update database connection strings to use mysqlconnector

- Changed MySQL connection strings in `config.py` and `datawarehouse.py` to use `mysqlconnector` instead of `pymysql`.
- Updated import paths in `search.py` to reflect the new application structure, ensuring consistency across modules.

 apps/app_db/config.py                  |  2 +-
 apps/datawarehouse/db/datawarehouse.py |  2 +-
 apps/datawarehouse/router/search.py    | 14 +++++++-------
 3 files changed, 9 insertions(+), 9 deletions(-)

### 2026-01-27 18:16 · `787e7e6` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/search-query

### 2026-01-27 18:09 · `587302b` · Add Data Warehouse Search API and update dependencies

- Introduced a new search API for keywords related to indicators, areas, subgroups, and time periods.
- Updated the main application file to include the new search API in the FastAPI router.
- Refactored database dependency management by moving `get_dw_db` to `db/datawarehouse.py` and simplifying the dependency structure.
- Removed unused MySQL dependency from requirements.txt to streamline the project.
- Updated documentation to reflect changes in the API structure and dependencies.

 apps/datawarehouse/router/api.py    |   8 ++++-
 apps/datawarehouse/router/search.py |   3 +-
 config/dependencies.py              | 149 ++--------------------------------------------------------------------------
 db/datawarehouse.py                 |  97 +++++++++++++++++++++++++++++++++++++++++++------
 docs/SEARCH_QUERY.md                |   2 +-
 main.py                             |   4 +++
 requirements.txt                    |   3 --
 7 files changed, 104 insertions(+), 162 deletions(-)

### 2026-01-27 15:15 · `f558d50` · Update documentation and scripts to reflect new application structure. Adjusted import paths in SEARCH_INDEX_SERVICE.md and SEARCH_QUERY.md, and added new test scripts for running the search index builder and incremental updates. This ensures consistency with the recent refactor of the application architecture.

 docs/SEARCH_INDEX_SERVICE.md                        |  32 +++++-----
 docs/SEARCH_QUERY.md                                |  72 ++++++++++++++--------
 test_scripts/__init__.py                            |   2 +
 test_scripts/run_dw_search_index.py                 |  54 +++++++++++++++++
 test_scripts/run_dw_search_index_indicators_only.py | 199 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 5 files changed, 317 insertions(+), 42 deletions(-)

### 2026-01-27 14:55 · `be23ae3` · Refactor application structure by updating import paths to use the new app_db module. This change includes adjustments across various files, ensuring consistency in the application architecture.

 apps/app_db/migrations/env.py                                               |  2 +-
 apps/app_db/router/api.py                                                   |  2 +-
 apps/app_db/router/datawarehouse.py                                         |  6 +--
 apps/app_db/services/datawarehouse_service.py                               |  4 +-
 apps/datawarehouse/router/search.py                                         | 14 +++---
 apps/datawarehouse/schemas/datawarehouse.py                                 |  2 +-
 apps/datawarehouse/scripts/seed_test_data.py                                |  4 +-
 apps/datawarehouse/services/indicator_service.py                            |  4 +-
 apps/datawarehouse/services/search/__init__.py                              |  8 ++--
 apps/datawarehouse/services/search/readers.py                               |  4 +-
 apps/datawarehouse/services/search/search_service.py                        |  6 +--
 apps/datawarehouse/services/search_index/search_index_builder.py            | 10 ++---
 .../datawarehouse/services/search_index/search_index_incremental_updater.py | 10 ++---
 apps/datawarehouse/services/search_index/transform.py                       |  6 +--
 apps/datawarehouse/services/search_index/writers.py                         |  4 +-
 apps/datawarehouse/services/unit_service.py                                 |  4 +-
 apps/datawarehouse/tests/test_api/test_indicator.py                         |  2 +-
 apps/datawarehouse/tests/test_api/test_unit.py                              |  2 +-
 config/constants.py                                                         |  2 +-
 config/dependencies.py                                                      | 88 +++++++++++++++++++++++++++++++------
 config/dw_registry.py                                                       | 66 ----------------------------
 db/datawarehouse.py                                                         |  2 +-
 main.py                                                                     |  2 +-
 tests/test_services/test_readers_safety.py                                  |  2 +-
 tests/test_services/test_search/test_scoring.py                             |  2 +-
 tests/test_services/test_search/test_search_service.py                      |  6 +--
 tests/test_services/test_search_index_builder.py                            | 10 ++---
 tests/test_services/test_search_index_incremental_updater.py                | 10 ++---
 tests/test_utils/test_ngrams.py                                             |  2 +-
 tests/test_utils/test_text.py                                               |  2 +-
 utils/database_connection.py                                                |  2 +-
 utils/validators.py                                                         |  2 +-
 32 files changed, 144 insertions(+), 148 deletions(-)

### 2026-01-27 14:43 · `2de6a72` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-api into feature/search-query

### 2026-01-23 13:31 · `2b79c15` · Implement search functionality with two-phase strategy and synonym fallback

- Added a new search router to handle smart search queries across data warehouse keywords.
- Implemented a two-phase search strategy: exact canonical match followed by trigram-based fuzzy search.
- Introduced synonym fallback mechanism for low-confidence queries to enhance search results.
- Created necessary schemas for request and response validation.
- Developed a scoring strategy to rank search results based on match types.
- Added comprehensive tests for the search service, including exact match, trigram search, and synonym fallback scenarios.
- Updated documentation to include details about the new search API and its usage.

 app/config/dependencies.py                             |  85 +++++++++++-
 app/config/dw_registry.py                              |  66 ++++++++++
 app/main.py                                            |   4 +
 app/router/api.py                                      |   3 +-
 app/router/search.py                                   | 159 ++++++++++++++++++++++
 app/schemas/search.py                                  |  26 ++++
 app/services/search/__init__.py                        |  39 ++++++
 app/services/search/readers.py                         | 285 ++++++++++++++++++++++++++++++++++++++++
 app/services/search/scoring.py                         | 221 +++++++++++++++++++++++++++++++
 app/services/search/search_service.py                  | 299 +++++++++++++++++++++++++++++++++++++++++
 app/services/search/types.py                           | 103 +++++++++++++++
 docs/SEARCH_QUERY.md                                   | 137 +++++++++++++++++++
 tests/test_services/test_search/__init__.py            |   3 +
 tests/test_services/test_search/test_scoring.py        | 135 +++++++++++++++++++
 tests/test_services/test_search/test_search_service.py | 409 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 15 files changed, 1971 insertions(+), 3 deletions(-)

### 2026-01-22 15:37 · `96cc830` · Add documentation for Data Warehouse Search Index Builder service

- Created `SEARCH_INDEX_SERVICE.md` to provide an overview of the Data Warehouse Search Index Builder service.
- Documented the service's functionality, including data reading, writing, and transformation processes.
- Explained the architecture, including core service, incremental updater, readers, writers, and utility functions.
- Included implementation decisions, operational notes, and testing guidelines for the service.
- Ensured clarity on the service's purpose and usage without exposing FastAPI endpoints.

 docs/{SEARCH_INDEX_BUILDER_SERVICE.md => SEARCH_INDEX_SERVICE.md} | 0
 1 file changed, 0 insertions(+), 0 deletions(-)

### 2026-01-22 15:33 · `490c8c8` · Implement table name quoting utility and update readers to use it

- Added `_quote_table` function to quote table names based on the database dialect (MySQL, PostgreSQL).
- Updated `UtIndicatorReader`, `UtAreaReader`, and `UtSubgroupValsReader` to utilize the new quoting function for SQL queries.
- Removed unused local runnable scripts from the `scripts` directory.
- Added a test case to ensure readers reject unsafe language codes.

 app/services/search_index/readers.py       | 35 +++++++++++++++++++++++++++++------
 scripts/__init__.py                        |  2 --
 scripts/run_dw_search_index.py             | 54 ------------------------------------------------------
 tests/test_services/test_readers_safety.py | 16 +++++++++++++++-
 4 files changed, 44 insertions(+), 63 deletions(-)

### 2026-01-22 15:18 · `08d77d1` · Add search index building service and related components

- Introduced `SearchIndexBuilderService` for populating DW-side search tables from UT tables.
- Added incremental updater for handling single entity updates.
- Implemented readers for fetching data from UT tables.
- Created writers for inserting/updating search tables with idempotent behavior.
- Defined necessary SQLAlchemy table structures and utility functions for text normalization and n-gram generation.
- Included tests for service functionality and utility methods.
- Updated requirements to include necessary libraries for security and authentication.

 app/services/search_index/__init__.py                         |   4 +
 app/services/search_index/readers.py                          | 184 +++++++++++++++++++++++++
 app/services/search_index/search_index_builder.py             | 364 ++++++++++++++++++++++++++++++++++++++++++++++++++
 app/services/search_index/search_index_incremental_updater.py | 217 ++++++++++++++++++++++++++++++
 app/services/search_index/tables.py                           |  41 ++++++
 app/services/search_index/transform.py                        | 145 ++++++++++++++++++++
 app/services/search_index/types.py                            |  57 ++++++++
 app/services/search_index/writers.py                          | 242 +++++++++++++++++++++++++++++++++
 app/utils/ngrams.py                                           |  27 ++++
 app/utils/text.py                                             |  34 +++++
 docs/SEARCH_INDEX_BUILDER_SERVICE.md                          | 327 +++++++++++++++++++++++++++++++++++++++++++++
 requirements.txt                                              |   7 +
 scripts/__init__.py                                           |   2 +
 scripts/run_dw_search_index.py                                |  54 ++++++++
 tests/test_services/test_readers_safety.py                    |  13 ++
 tests/test_services/test_search_index_builder.py              | 135 +++++++++++++++++++
 tests/test_services/test_search_index_incremental_updater.py  | 180 +++++++++++++++++++++++++
 tests/test_utils/test_ngrams.py                               |  14 ++
 tests/test_utils/test_text.py                                 |  15 +++
 19 files changed, 2062 insertions(+)

---

## dfa-toolkit-visualizer

### 2026-07-22 09:10 · `6573a85` · Merge pull request #216 in DFAV6/dfa-v6-visualizer from refactor/adjustments to develop

* commit '50d957362548f53a16deaff5384cfb4c79268cbf':
  Update package-lock.json
  Refactor IndicatorSelect component to ensure selection changes maintain item integrity by re-hydrating selected items from previous drafts or cache, preserving necessary properties for further actions.

### 2026-07-21 11:15 · `ca317f6` · Merge pull request #215 in DFAV6/dfa-v6-visualizer from refactor/adjustments to develop

* commit 'e98fea73c7c005f671d653fb4ea95200c1804c5a':
  dymanic series order change
  Refactor visualization engine to update module imports, replacing deprecated references with new ones, and enhance bar chart configuration by introducing border width options for item styles.
  Refactor visualization engine to update module imports, replacing deprecated references with new ones, and introduce a new engine file for enhanced text formatting capabilities.
  Refactor visualization engine to update module imports, replacing deprecated references with new ones, and introduce a new engine file for enhanced text formatting capabilities and chart options. Update type definitions to include additional properties for improved chart configuration.

### 2026-07-17 12:31 · `7d5c008` · Merge pull request #214 in DFAV6/dfa-v6-visualizer from refactor/adjustments to develop

* commit 'bda28070053f4787b51f1a83aca4c7afe39fb972':
  Update README.md to include new 'unit' option in tooltipFields for enhanced metadata display, and update type definitions to support unit display in PointMeta. Refactor engine imports to utilize new module paths.
  Update README.md to document new 'polar_line' chart variant for polar coordinate systems, enhance type definitions with 'isPolarLineVariant' and 'buildPolarLineOption' functions, and refactor engine imports to utilize updated module paths.

### 2026-07-16 11:13 · `863b1d7` · Merge pull request #213 in DFAV6/dfa-v6-visualizer from refactor/adjustments to develop

* commit 'afa2f4f07322237a78d5b63fdd5bf258f485637c':
  Enhance README.md to document new stacked area chart configurations, including 100% stacked area options, and update type definitions to support percent stacking in the visualization engine. Refactor engine imports to utilize updated module paths.
  Update visualization engine imports to reference new module paths, introduce sunburst layout adjustments for improved title handling, and enhance type definitions for better chart configuration.
  Refactor visualization engine to update module imports, replacing deprecated references with new ones, and enhance type definitions by adding 'resolveTreemapDrawArea' function for improved custom-series treemap layout calculations.
  Enhance README.md to document new alignment options for chart titles, subtitles, and custom labels, and update type definitions to include 'titleAlign', 'subtitleAlign', and 'customLabelAlign' properties for improved text formatting in visualizations.
  Refactor visualization engine to update module imports, replacing deprecated references with new ones, and introduce a new engine file for enhanced text formatting capabilities and chart options.
  Update README.md to clarify 'chartVariant' options for bar and line/area charts, and document new 100% stacked bar configurations. Refactor engine imports to utilize updated module references.

### 2026-07-14 06:05 · `96b7cb0` · Merge pull request #212 in DFAV6/dfa-v6-visualizer from refactor/adjustments to develop

* commit '02c5ae5c0a388a62bdbe45cdf6a7d73dc88923e1':
  Enhance README.md to document new chart types 'dotMatrix' and 'hundredMinus', and add details for secondary Y-axis configuration in ECharts.
  added support for the secondary axis
  Refactor visualization engine to update module imports, enhance chart type definitions with 'dotMatrix' and 'hundredMinus', and improve text formatting capabilities.

### 2026-07-01 15:11 · `d000f51` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feature/ssologout

### 2026-06-29 16:28 · `e870d5d` · Refactor session expiration handling to improve user experience during authentication. Introduce isPublicAppPathname function to identify public routes and adjust session clearing logic accordingly. Ensure proper navigation behavior based on the current page context.

 src/lib/api/tokenRefresh.ts | 29 +++++++++++++++++------------
 src/lib/auth/returnUrl.ts   |  8 ++++++++
 2 files changed, 25 insertions(+), 12 deletions(-)

### 2026-06-29 14:18 · `98210e7` · Enhance authentication flow by adding session expiration handling in AuthPage. Update SSO auto-redirect logic to prevent loops on session-expired logouts. Refactor loading indicators for improved user experience during sign-in processes. Remove unused session cleanup calls in Header and SignInRequiredModal components.

 src/app/[locale]/auth/page.tsx         | 28 ++++++++++++++++------------
 src/components/Header.tsx              |  6 ++----
 src/components/SignInRequiredModal.tsx |  4 +---
 src/hooks/useSessionKeepAlive.ts       |  3 +++
 src/lib/api/tokenRefresh.ts            |  1 +
 5 files changed, 23 insertions(+), 19 deletions(-)

### 2026-06-29 10:14 · `a903eaf` · Implement session management improvements by adding access token expiration checks and a new session status API. Refactor authentication handling to clear stale sessions and enhance user experience during sign-in and sign-out processes. Update related components to utilize the new session management logic.

 src/app/api/auth/session-status/route.ts |   6 +++++
 src/components/Header.tsx                |   7 ++---
 src/components/SignInRequiredModal.tsx   |   4 ++-
 src/contexts/AuthContext.tsx             |  20 ++++++++++-----
 src/hooks/useSessionKeepAlive.ts         | 100 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/api/tokenRefresh.ts              |  14 +++++++---
 src/lib/auth/authService.ts              |  16 ++----------
 src/lib/auth/jwt.ts                      |  13 ++++++++++
 src/lib/auth/sessionCleanup.ts           |  36 ++++++++++++++++++++++++++
 src/lib/sso/constants.ts                 |   6 ++---
 src/lib/sso/server.ts                    |  39 ++++++++++++++++++++++++++++
 src/middleware.ts                        |   7 ++---
 12 files changed, 233 insertions(+), 35 deletions(-)

### 2026-06-25 07:31 · `72961d6` · Automatic merge from main -> develop

* commit '4bbf21b00debc6122e5e65bfd01ad950ca9a626a':

### 2026-06-25 07:31 · `4bbf21b` · Merge pull request #202 in DFAV6/dfa-v6-visualizer from develop to main

* commit '02fe3e68a75ffd2def13301df2f6204d1678ba84':
  Refactor authentication handling to include access token management and session expiration handling. Update AuthPage to utilize new BFF data structure for user session persistence. Enhance API client methods to support automatic token refresh on 401 responses, improving error handling and user experience.

### 2026-06-25 12:47 · `02fe3e6` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into develop

### 2026-06-25 12:46 · `6cb6d84` · Refactor authentication handling to include access token management and session expiration handling. Update AuthPage to utilize new BFF data structure for user session persistence. Enhance API client methods to support automatic token refresh on 401 responses, improving error handling and user experience.

 src/app/[locale]/auth/page.tsx |   8 ++--
 src/contexts/AuthContext.tsx   |  14 +++++++
 src/lib/api/client.ts          | 179 ++++++++++++++++++++++++++++++++++++++++-----------------------------------------
 src/lib/api/core.ts            |  71 ++++++++++++++++++++------------
 src/lib/api/reference.ts       |  32 ++++++++++-----
 src/lib/api/tokenRefresh.ts    |  79 ++++++++++++++++++++++++++++++++++++
 src/lib/sso/client.ts          |  18 ++++++++-
 src/lib/sso/server.ts          |  19 +++++++--
 src/lib/sso/types.ts           |   6 ++-
 9 files changed, 289 insertions(+), 137 deletions(-)

### 2026-06-25 10:17 · `02c6de7` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into develop

### 2026-06-25 10:15 · `afc3987` · Update environment configuration in `env-config.yaml` to change application identifiers from "DTK_VIZ" to "DFA_VIZ" for consistency with the new naming convention.

 oci_k8s/overlays/guinea/env-config.yaml | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)

### 2026-06-22 11:26 · `3c0ef00` · Update cursor rules in `.cursorrules` to reflect the latest DFA v6 styleguide changes, including the source of truth and component class naming conventions. Removed references to deprecated files and clarified usage of shared BEM names for consistency across the application.

 .cursorrules | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

### 2026-06-22 10:35 · `ab7a199` · Integrate DFA v6 styleguide by adding shared CSS and Tailwind configuration. Updated `next.config.ts` to include `@dfa-v6/styleguide` for component styling. Removed deprecated design tokens package and replaced it with a new styleguide package containing design tokens and global styles. Updated layout to import the new styleguide CSS. Enhanced Tailwind configuration to utilize the styleguide preset for consistent theming across the application.

 next.config.ts                                           |   1 +
 package-lock.json                                        |  74 ++++++---------------------------
 packages/design-tokens/README.md                         |  43 --------------------
 packages/design-tokens/package.json                      |  17 --------
 {src/app => packages/dfa-v6-styleguide}/globals.css      |   2 +-
 packages/dfa-v6-styleguide/package.json                  |  20 +++++++++
 packages/dfa-v6-styleguide/postcss.config.mjs            |   6 +++
 packages/dfa-v6-styleguide/tailwind.config.ts            | 122 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 packages/{design-tokens => dfa-v6-styleguide}/tokens.css |   8 ++--
 src/app/layout.tsx                                       |   3 +-
 src/app/product-tokens.css                               |   6 +++
 tailwind.config.ts                                       | 116 +---------------------------------------------------
 12 files changed, 176 insertions(+), 242 deletions(-)

### 2026-06-18 15:15 · `1bbd132` · Refactor API proxy route and appClientAuth module by removing the unused normalizeToolkitPathForIam function. Simplified backend URL construction in dispatch function to enhance clarity and maintainability.

 src/app/api/proxy/[...path]/route.ts | 11 +++--------
 src/lib/api/appClientAuth.ts         | 15 +--------------
 2 files changed, 4 insertions(+), 22 deletions(-)

### 2026-06-15 18:12 · `8b6f76c` · Add Sisomali adaptation to deployment configuration

- Updated `build_spec.yaml` to include 'sisomali' in the DEPLOY_ADAPTATIONS list and adjusted output artifacts.
- Enhanced `README.md` to document the new Sisomali adaptation with its respective host and API backend.
- Created new configuration files for Sisomali in the `oci_k8s/overlays/sisomali/` directory, including `env-config.yaml`, `ingress.yaml`, and `kustomization.yaml` for deployment management.

 build_spec.yaml                              |  7 +++++--
 oci_k8s/README.md                            | 14 ++++++++++++--
 oci_k8s/overlays/sisomali/env-config.yaml    | 25 +++++++++++++++++++++++++
 oci_k8s/overlays/sisomali/ingress.yaml       | 24 ++++++++++++++++++++++++
 oci_k8s/overlays/sisomali/kustomization.yaml | 29 +++++++++++++++++++++++++++++
 5 files changed, 95 insertions(+), 4 deletions(-)

### 2026-06-15 12:17 · `d737264` · Merge pull request #192 in DFAV6/dfa-v6-visualizer from feature/styleguide to develop

* commit '1a63cc6a6e5474bed91c5f883ae9cdf5e91180f3':
  Refactor review stage circles to dots in dataset list table for improved clarity and styling consistency. Updated class names and styles to align with the DFA v6 styleguide.
  Remove hidden sign-in switch from globals.css and update pagination controls comment for clarity.
  Add cursor rules and update Tailwind configuration for new design tokens

### 2026-06-12 16:21 · `1a63cc6` · Refactor review stage circles to dots in dataset list table for improved clarity and styling consistency. Updated class names and styles to align with the DFA v6 styleguide.

 src/app/globals.css | 18 +++++++++---------
 1 file changed, 9 insertions(+), 9 deletions(-)

### 2026-06-12 15:57 · `11382ec` · Remove hidden sign-in switch from globals.css and update pagination controls comment for clarity.

 src/app/globals.css | 9 +--------
 1 file changed, 1 insertion(+), 8 deletions(-)

### 2026-06-12 11:46 · `74fb711` · Add cursor rules and update Tailwind configuration for new design tokens

- Introduced a new `.cursorrules` file detailing the DFA v6 styleguide for shared CSS.
- Updated `tailwind.config.ts` to include additional color tokens and utility classes for improved styling.
- Enhanced `tokens.css` with new color definitions and design tokens for better theming.
- Modified `Login.tsx` and related components to include `credentials: "include"` in fetch requests for SSO support.
- Updated various components to align with the new styling conventions and class names as per the styleguide.

 .cursorrules                                                  |   12 +
 packages/design-tokens/tokens.css                             |   52 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js          |    4 +
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map      |    2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs     |    2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map |    2 +-
 packages/dfa-v6-comp-login/src/Login.tsx                      |    4 +
 src/app/[locale]/auth/page.tsx                                |   43 +-
 src/app/[locale]/visualizer/page.tsx                          |    4 +-
 src/app/api/auth/password/reset-confirm/route.ts              |    6 +
 src/app/api/auth/password/reset-request/route.ts              |    6 +
 src/app/api/auth/register/route.ts                            |    6 +
 src/app/globals.css                                           | 1679 +++++++++++++++++--------------------------------
 src/components/Header.tsx                                     |    8 +-
 src/components/TranslationsPanel.tsx                          |    4 +-
 src/components/visualizer/VisualizationTab.tsx                |   16 +-
 src/contexts/AuthContext.tsx                                  |    4 +-
 src/lib/auth/authService.ts                                   |    9 +-
 src/lib/constants.ts                                          |    2 +
 src/lib/sso/client.ts                                         |   11 +-
 src/lib/sso/server.ts                                         |   30 +
 src/middleware.ts                                             |   10 +-
 tailwind.config.ts                                            |   35 +-
 23 files changed, 798 insertions(+), 1153 deletions(-)

### 2026-06-10 18:08 · `49f4dd7` · Implement SSO return URL handling and middleware enhancements

- Introduced new utility functions for validating and resolving return URLs in the authentication flow.
- Updated middleware to redirect users based on authentication status and return URL parameters.
- Enhanced the AuthPage component to utilize the new return URL validation logic.
- Refactored SSO callback handling to ensure proper return URL resolution after authentication.
- Improved the Header component to conditionally enable search sync polling based on user permissions.

 src/app/[locale]/auth/page.tsx              |  50 ++++++++++++-------------
 src/app/[locale]/auth/sso/callback/page.tsx |   7 ++--
 src/components/Header.tsx                   |   7 +++-
 src/hooks/useSearchSyncPoll.ts              |  19 ++++++++--
 src/lib/api/client.ts                       |  13 ++++++-
 src/lib/auth/returnUrl.ts                   | 136 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/middleware.ts                           |  29 ++++++++++++---
 7 files changed, 219 insertions(+), 42 deletions(-)

### 2026-06-09 17:12 · `222f232` · Add AppToaster component for notifications and implement search sync functionality

- Introduced AppToaster component for displaying toast notifications.
- Updated Header component to utilize toast notifications for search sync actions.
- Implemented useSearchSyncPoll hook for managing background polling of search sync jobs.
- Enhanced API with new methods for syncing search data and checking job status.
- Updated constants and types to support new search sync functionality.

 src/app/[locale]/layout.tsx    |   2 +
 src/components/AppToaster.tsx  |   7 ++++
 src/components/Header.tsx      |  21 +++++-----
 src/hooks/useSearchSyncPoll.ts | 169 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/api/core.ts            |  61 +++++++++++++++++++++++++++--
 src/lib/api/types.ts           |  19 +++++++++
 src/lib/constants.ts           |   2 +
 7 files changed, 269 insertions(+), 12 deletions(-)

### 2026-06-09 09:53 · `7daa182` · Merge pull request #188 in DFAV6/dfa-v6-visualizer from feature/vizsso to develop

* commit '55ef68ac092e310343fb950d5c8a42e02483ab10':
  Refactor MapConfigurationPanel and related components to standardize terminology from 'DML' to 'map service' and improve error messages for clarity. Update Data API and visualizer components to align with new area ID handling and enhance validation messages for map configuration.

### 2026-06-09 15:22 · `55ef68a` · Refactor MapConfigurationPanel and related components to standardize terminology from 'DML' to 'map service' and improve error messages for clarity. Update Data API and visualizer components to align with new area ID handling and enhance validation messages for map configuration.

 src/components/settings/MapConfigurationPanel.tsx | 47 ++++++++++++++++++++++++++---------------------
 src/lib/api/data.ts                               |  6 +++---
 src/lib/visualizer/chartTransform.ts              |  2 ++
 src/lib/visualizer/dataApiAdapter.ts              |  2 +-
 src/lib/visualizer/mapConfigEditor.ts             | 14 +++++++-------
 5 files changed, 39 insertions(+), 32 deletions(-)

### 2026-06-09 06:26 · `e0f4c00` · Merge pull request #187 in DFAV6/dfa-v6-visualizer from feature/vizsso to develop

* commit '4270e33aa7703b2314f033fd8be0d9d2e3312522':
  Update Data API parameters to rename 'isdefaultenabled' to 'isdefaultsubgroup' for clarity and consistency in API response handling.
  Updating the unit format implementation

### 2026-06-09 11:55 · `4270e33` · Update Data API parameters to rename 'isdefaultenabled' to 'isdefaultsubgroup' for clarity and consistency in API response handling.

 src/lib/api/data.ts  | 8 ++++----
 src/lib/constants.ts | 2 +-
 2 files changed, 5 insertions(+), 5 deletions(-)

### 2026-06-09 11:42 · `9f1f3f4` · Updating the unit format implementation

 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js.map            |    2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs.map       |    2 +-
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js          |   70 +-
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js.map      |    2 +-
 packages/dfa-v6-comp-visualization/dist/engine.mjs                          |  992 +---------------------------
 packages/dfa-v6-comp-visualization/dist/engine.mjs.map                      |    2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/cartesian.d.ts.map |    2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/heatmap.d.ts.map   |    2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/labelUtils.d.ts    |    5 +-
 .../dist/engine/optionBuilders/labelUtils.d.ts.map                          |    2 +-
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/pie.d.ts.map  |    2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/pyramid.d.ts.map   |    2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/radar.d.ts.map     |    2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/treemap.d.ts.map   |    2 +-
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts                   |   10 +
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts.map               |    2 +-
 packages/dfa-v6-comp-visualization/dist/engine/unitFormatDisplay.d.ts       |   10 +
 packages/dfa-v6-comp-visualization/dist/engine/unitFormatDisplay.d.ts.map   |    1 +
 packages/dfa-v6-comp-visualization/dist/index-CxzvlzwC.mjs                  | 1233 +++++++++++++++++++++++++++++++++++
 packages/dfa-v6-comp-visualization/dist/index-CxzvlzwC.mjs.map              |    1 +
 packages/dfa-v6-comp-visualization/dist/index.d.ts                          |    1 +
 packages/dfa-v6-comp-visualization/dist/index.d.ts.map                      |    2 +-
 packages/dfa-v6-comp-visualization/dist/index.mjs                           |   93 +--
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/area.ts        |    2 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/bar.ts         |    2 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/cartesian.ts   |    7 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/heatmap.ts     |    6 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/labelUtils.ts  |   20 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/line.ts        |    2 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/pie.ts         |    3 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/pyramid.ts     |   17 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/radar.ts       |    4 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/scatter.ts     |    4 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/treemap.ts     |   17 +-
 packages/dfa-v6-comp-visualization/src/engine/types.ts                      |   15 +-
 packages/dfa-v6-comp-visualization/src/engine/unitFormatDisplay.test.ts     |  101 +++
 packages/dfa-v6-comp-visualization/src/engine/unitFormatDisplay.ts          |  294 +++++++++
 packages/dfa-v6-comp-visualization/src/index.ts                             |    1 +
 src/components/visualizer/DataTableTab.tsx                                  |   12 +-
 src/components/visualizer/VisualizationTab.tsx                              |   53 +-
 src/lib/visualizer/chartTransform.ts                                        |  114 +++-
 src/lib/visualizer/unitFormatDisplay.ts                                     |   67 ++
 42 files changed, 2021 insertions(+), 1162 deletions(-)

### 2026-06-05 10:43 · `ba129ed` · Merge pull request #186 in DFAV6/dfa-v6-visualizer from feature/vizsso to develop

* commit 'f8e5c6028e421e714b611934ef8a00ab9be9a1b9':
  Remove deprecated SSO-related constants from constants.ts to streamline codebase.

### 2026-06-05 16:09 · `f8e5c60` · Remove deprecated SSO-related constants from constants.ts to streamline codebase.

 src/lib/constants.ts | 2 --
 1 file changed, 2 deletions(-)

### 2026-06-05 10:27 · `bdae5ee` · Merge pull request #185 in DFAV6/dfa-v6-visualizer from feature/vizsso to develop

* commit 'c02235d06e40803b567ac7ea6e4999c1a9ef6f8d':
  Removed console log
  Refactor authentication handling by consolidating SSO logic into a dedicated module. Updated middleware and API routes to utilize new SSO server functions for login, logout, and refresh operations. Removed legacy cookie management code and streamlined SSO provider fetching. Enhanced code organization for better maintainability.

### 2026-06-05 15:55 · `c02235d` · Removed console log

 src/components/Header.tsx | 1 -
 1 file changed, 1 deletion(-)

### 2026-06-05 15:53 · `b018a3e` · Refactor authentication handling by consolidating SSO logic into a dedicated module. Updated middleware and API routes to utilize new SSO server functions for login, logout, and refresh operations. Removed legacy cookie management code and streamlined SSO provider fetching. Enhanced code organization for better maintainability.

 src/app/[locale]/auth/page.tsx          |   2 +-
 src/app/api/auth/login/route.ts         |  82 +-------------------
 src/app/api/auth/logout/route.ts        |  61 +--------------
 src/app/api/auth/refresh/route.ts       |  58 +-------------
 src/app/api/auth/sso/providers/route.ts |  27 +------
 src/app/api/proxy/[...path]/route.ts    |   2 +-
 src/components/Header.tsx               |   6 +-
 src/contexts/AuthContext.tsx            |   2 +-
 src/contexts/CoreContext.tsx            |   3 +-
 src/lib/auth/authService.ts             |  92 +++-------------------
 src/lib/auth/ssoProviders.ts            |  31 --------
 src/lib/constants.ts                    |  12 +--
 src/lib/server/authSessionCookies.ts    |  55 --------------
 src/lib/sso/client.ts                   | 172 +++++++++++++++++++++++++++++++++++++++++
 src/lib/sso/constants.ts                |  25 ++++++
 src/lib/sso/index.ts                    |  35 +++++++++
 src/lib/sso/server.ts                   | 298 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/sso/types.ts                    |  66 ++++++++++++++++
 src/middleware.ts                       |   3 +-
 19 files changed, 624 insertions(+), 408 deletions(-)

### 2026-06-05 07:00 · `0fca037` · Merge pull request #183 in DFAV6/dfa-v6-visualizer from feature/vizsso to develop

* commit '67a281d2d25099a131c3d59c6eca4c1d0571a9ba':
  Enhance Login component with SSO support and additional props. Added renderAfterSubmit for custom content and showRegisterPrompt for conditional display of registration prompt. Updated authentication middleware to handle new SSO flow and added SSO callback page for token exchange.

### 2026-06-05 12:25 · `67a281d` · Enhance Login component with SSO support and additional props. Added renderAfterSubmit for custom content and showRegisterPrompt for conditional display of registration prompt. Updated authentication middleware to handle new SSO flow and added SSO callback page for token exchange.

 packages/dfa-v6-comp-login/dist/Login.d.ts                    |    7 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js          | 3349 +++++++++++++++++++++++++------------------------
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map      |    2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs     |   42 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map |    2 +-
 packages/dfa-v6-comp-login/src/Login.tsx                      |   39 +-
 src/app/[locale]/auth/page.tsx                                |  121 +-
 src/app/[locale]/auth/sso/callback/page.tsx                   |   49 +
 src/app/api/auth/login/route.ts                               |   84 ++
 src/app/api/auth/logout/route.ts                              |   63 +
 src/app/api/auth/refresh/route.ts                             |   60 +
 src/app/api/auth/sso/providers/route.ts                       |   29 +
 src/app/api/proxy/[...path]/route.ts                          |   13 +-
 src/components/Header.tsx                                     |   36 +-
 src/contexts/AuthContext.tsx                                  |   14 +-
 src/contexts/CoreContext.tsx                                  |   20 +-
 src/lib/api/client.ts                                         |   47 +-
 src/lib/auth/authService.ts                                   |  199 ++-
 src/lib/auth/ssoProviders.ts                                  |   31 +
 src/lib/auth/types.ts                                         |    4 +
 src/lib/constants.ts                                          |   12 +
 src/lib/i18n/translations/translations.json                   |    1 +
 src/lib/server/authSessionCookies.ts                          |   55 +
 src/middleware.ts                                             |   22 +-
 24 files changed, 2497 insertions(+), 1804 deletions(-)

### 2026-06-03 18:28 · `00da6d8` · Refactor Data API parameters: rename isdefaultenabled to isdefaultsubgroup for clarity and update related comments in constants and data files.

 src/lib/api/data.ts  | 8 ++++----
 src/lib/constants.ts | 2 +-
 2 files changed, 5 insertions(+), 5 deletions(-)

### 2026-06-03 12:51 · `537df9d` · Merge pull request #181 in DFAV6/dfa-v6-visualizer from feature/sprint9 to develop

* commit '4419ac4899929d31c6c17555360b9c8b696cbd57':
  Update Data API endpoints and parameters to reflect new published data structure. Changed DATA_PATH_SEGMENT to '/reports/data/published/full' and updated related comments and interfaces across multiple files for consistency.

### 2026-06-03 18:18 · `4419ac4` · Update Data API endpoints and parameters to reflect new published data structure. Changed DATA_PATH_SEGMENT to '/reports/data/published/full' and updated related comments and interfaces across multiple files for consistency.

 src/lib/api/data.ts                  | 237 +++++++++++++++++++++++++++++++++++++++++++++++++++------------------------
 src/lib/appConfig/utils.ts           |   2 +-
 src/lib/constants.ts                 |   8 +--
 src/lib/visualizer/dataApiAdapter.ts |   7 ++-
 src/lib/visualizer/dataApiParams.ts  |   8 +--
 5 files changed, 173 insertions(+), 89 deletions(-)

### 2026-06-02 12:16 · `0eab9d1` · Merge pull request #179 in DFAV6/dfa-v6-visualizer from feature/sprint9 to develop

* commit 'c8b3ca4e0c649371c17e9f76008092e7bd558d61':
  map configuration setup for admin

### 2026-06-02 17:36 · `c8b3ca4` · map configuration setup for admin

 src/components/Header.tsx                         |  30 +++
 src/components/settings/MapConfigurationPanel.tsx | 677 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/api/core.ts                               |   9 +-
 src/lib/visualizer/mapConfigEditor.ts             | 197 ++++++++++++++++++
 4 files changed, 912 insertions(+), 1 deletion(-)

### 2026-05-29 06:21 · `4bb7295` · Merge pull request #177 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit '2dabebbcda964f1099c19637948fa6d2f54ec3d6':
  Unit format implementation

### 2026-05-29 11:48 · `2dabebb` · Unit format implementation

 package.json                                                                |   2 +-
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js          |  76 +--
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js.map      |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine.mjs                          | 900 +++++++++++++++++++-----------------
 packages/dfa-v6-comp-visualization/dist/engine.mjs.map                      |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/area.d.ts.map |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/bar.d.ts.map  |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/cartesian.d.ts     |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/cartesian.d.ts.map |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/heatmap.d.ts.map   |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/labelUtils.d.ts    |   7 +-
 .../dist/engine/optionBuilders/labelUtils.d.ts.map                          |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/line.d.ts.map |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/pie.d.ts.map  |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/pyramid.d.ts.map   |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/radar.d.ts.map     |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/scatter.d.ts.map   |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/treemap.d.ts.map   |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts                   |  12 +
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts.map               |   2 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/area.ts        |   6 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/bar.ts         |  28 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/cartesian.ts   |  36 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/heatmap.ts     |  17 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/labelUtils.ts  |  27 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/line.ts        |  44 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/pie.ts         |  14 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/pyramid.ts     |  23 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/radar.ts       |  25 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/scatter.ts     |  12 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/treemap.ts     |  21 +-
 packages/dfa-v6-comp-visualization/src/engine/types.ts                      |  17 +-
 src/components/visualizer/BasicSettingsTab.tsx                              |  50 +-
 src/components/visualizer/DataTableTab.tsx                                  |   3 +-
 src/components/visualizer/VisualizationTab.tsx                              |  15 +-
 src/lib/api/core.ts                                                         |   2 +-
 src/lib/api/data.ts                                                         |   4 +
 src/lib/i18n/translations/translations.json                                 |   1 +
 src/lib/visualizer/chartTransform.ts                                        | 111 +++--
 src/lib/visualizer/dataApiAdapter.ts                                        |   9 +-
 src/lib/visualizer/types.ts                                                 |   7 +
 41 files changed, 913 insertions(+), 586 deletions(-)

### 2026-05-28 08:25 · `774f906` · Merge pull request #176 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit '0796e9c35e19418eb5d501551818d38b9db09600':
  Add sync functionality to Header component for search data

### 2026-05-28 11:47 · `0796e9c` · Add sync functionality to Header component for search data

 src/components/Header.tsx | 38 +++++++++++++++++++++++++++++++++++++-
 src/lib/api/core.ts       | 17 +++++++++++++++++
 2 files changed, 54 insertions(+), 1 deletion(-)

### 2026-05-25 12:48 · `ed2b401` · Merge pull request #172 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit '164b03e9e4ac17ced96d88f278a7a80d159df8cd':
  Enhance cardinality detection and indicator info extraction in export payload. Update logic to account for unique (indicatorId, unit) pairs and adjust data structures for multi-dimensional exports, ensuring accurate representation of indicators, units, subgroups, and areas.

### 2026-05-25 18:16 · `164b03e` · Enhance cardinality detection and indicator info extraction in export payload. Update logic to account for unique (indicatorId, unit) pairs and adjust data structures for multi-dimensional exports, ensuring accurate representation of indicators, units, subgroups, and areas.

 src/lib/visualizer/export/buildPayload.ts | 48 +++++++++++++++++++++++++++---------------------
 1 file changed, 27 insertions(+), 21 deletions(-)

### 2026-05-25 07:20 · `50a7c78` · Merge pull request #170 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit 'c058c78855c157f90473506e3c9241bc4f3d7a8e':
  Add export functionality for metadata in visualizer
  Refactor export functionality to use buildExportPayloadFromRows for data export across visualizer components. Update metadata handling in CSV and XLSX downloads to support multi-dimensional export mode. Enhance type definitions for export metadata and payload structures.

### 2026-05-25 12:48 · `c058c78` · Add export functionality for metadata in visualizer

 package-lock.json                         | 212 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 package.json                              |  12 ++--
 src/app/[locale]/visualizer/page.tsx      |  13 ++++-
 src/components/visualizer/MetadataTab.tsx |   2 +-
 src/lib/visualizer/metadataExport.ts      |  85 ++++++++++++++++++++++++++++
 5 files changed, 300 insertions(+), 24 deletions(-)

### 2026-05-25 12:40 · `4ea8326` · Refactor export functionality to use buildExportPayloadFromRows for data export across visualizer components. Update metadata handling in CSV and XLSX downloads to support multi-dimensional export mode. Enhance type definitions for export metadata and payload structures.

 src/app/[locale]/visualizer/page.tsx           |   9 +-
 src/components/visualizer/VisualizationTab.tsx |   8 +-
 src/lib/gallery/exportFromItem.ts              |  44 +++------
 src/lib/visualizer/export/buildPayload.ts      | 339 +++++++++++++++++++++++++++++++++++++++++++++++------------------
 src/lib/visualizer/export/downloadCsv.ts       |  43 ++++++---
 src/lib/visualizer/export/downloadXlsx.ts      |  43 ++++++---
 src/lib/visualizer/export/index.ts             |   4 +-
 src/lib/visualizer/export/types.ts             |  29 ++++--
 8 files changed, 351 insertions(+), 168 deletions(-)

### 2026-05-22 05:28 · `e4f1660` · Merge pull request #166 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit 'c378bb704e6adc519961fec38d2f2e029f611e21':
  Refactor environment configuration for API signing. Update .env.example and related files to clarify signing key usage for both proxy and direct modes. Adjust Docker and Kubernetes configurations to align with new signing key structure. Enhance documentation in README for better understanding of signing mechanisms.
  Update source maps for dfa-v6-comp-area, dfa-v6-comp-indicator, and dfa-v6-comp-kw-search packages to reflect recent changes in TypeScript files. Ensure accurate mapping for debugging and development purposes.

### 2026-05-22 10:56 · `c378bb7` · Refactor environment configuration for API signing. Update .env.example and related files to clarify signing key usage for both proxy and direct modes. Adjust Docker and Kubernetes configurations to align with new signing key structure. Enhance documentation in README for better understanding of signing mechanisms.

 .env.example                              | 15 +++++++--------
 Dockerfile                                |  3 +--
 Dockerfile.oci                            |  4 ++--
 README.md                                 |  5 +++--
 build_spec.yaml                           |  4 ++--
 build_spec_test.yaml                      |  4 ++--
 docker-compose.yml                        |  7 ++++---
 oci_k8s/overlays/datanett/env-config.yaml |  4 ++--
 oci_k8s/overlays/demo/env-config.yaml     |  4 ++--
 oci_k8s/overlays/guinea/env-config.yaml   |  4 ++--
 oci_k8s_test/env-config.yaml              |  4 ++--
 src/components/SignedFetchProvider.tsx    |  8 ++------
 src/hooks/useSignedFetchHeaders.ts        |  6 ++----
 src/lib/api/appClientAuth.ts              |  6 +++---
 src/lib/api/client.ts                     |  6 ++----
 src/lib/api/signedFetch.ts                | 34 ++++++++++++++--------------------
 src/lib/auth/signature.ts                 |  4 ++--
 src/lib/constants.ts                      | 12 +++++++-----
 src/lib/server/vizAppSign.ts              |  2 +-
 src/lib/server/vizUpstream.ts             |  2 +-
 src/middleware.ts                         | 13 ++++---------
 21 files changed, 67 insertions(+), 84 deletions(-)

### 2026-05-20 17:57 · `225552a` · Update source maps for dfa-v6-comp-area, dfa-v6-comp-indicator, and dfa-v6-comp-kw-search packages to reflect recent changes in TypeScript files. Ensure accurate mapping for debugging and development purposes.

 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.js.map                  | 2 +-
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.umd.cjs.map             | 2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js.map        | 2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs.map   | 2 +-
 packages/dfa-v6-comp-kw-search/dist/index.mjs.map                       | 2 +-
 packages/dfa-v6-comp-kw-search/dist/index.umd.js.map                    | 2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map                | 2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map           | 2 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.js.map          | 2 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.umd.cjs.map     | 2 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.js.map      | 2 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.umd.cjs.map | 2 +-
 12 files changed, 12 insertions(+), 12 deletions(-)

### 2026-05-20 11:41 · `cf78393` · Merge pull request #165 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit '6dceadb2551c1319d7dca697c76e0bf0715752c8':
  testing the proxy signing key fix on the test web

### 2026-05-20 16:21 · `6dceadb` · testing the proxy signing key fix on the test web

 oci_k8s_test/env-config.yaml | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

### 2026-05-20 10:01 · `fd84736` · Merge pull request #164 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit '9ba9bf938589d8acab0427c528579d737489f9ad':
  change the env value in env config for test

### 2026-05-20 15:30 · `9ba9bf9` · change the env value in env config for test

 oci_k8s_test/env-config.yaml | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-05-20 09:15 · `5881add` · Merge pull request #163 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit 'ac7be2ec91fcfba85ab1e98182962f8e2e1328ff':
  Refactor API request handling by implementing a global fetch interceptor for Ed25519 signing in direct mode. Update runtime caching strategy to use NetworkOnly for API responses, and integrate SignedFetchProvider into the component tree to ensure early loading of the fetch interceptor. Remove legacy signing logic from various API client functions for cleaner code.

### 2026-05-20 14:42 · `ac7be2e` · Refactor API request handling by implementing a global fetch interceptor for Ed25519 signing in direct mode. Update runtime caching strategy to use NetworkOnly for API responses, and integrate SignedFetchProvider into the component tree to ensure early loading of the fetch interceptor. Remove legacy signing logic from various API client functions for cleaner code.

 runtimeCaching.js                      |  15 +++-------
 src/app/[locale]/layout.tsx            |  25 +++++++++-------
 src/app/api/proxy/[...path]/route.ts   |   1 +
 src/components/SignedFetchProvider.tsx |  15 ++++++++++
 src/hooks/useSignedFetchHeaders.ts     |  40 ++++++++++---------------
 src/lib/api/client.ts                  |  29 +++++++++++-------
 src/lib/api/core.ts                    |   2 --
 src/lib/api/reference.ts               |   5 ++--
 src/lib/api/signedFetch.ts             | 118 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 9 files changed, 189 insertions(+), 61 deletions(-)

### 2026-05-20 08:43 · `5f3380e` · Merge pull request #162 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit '612f2c5c461767d0b0e237e0b60abfe72ef11102':
  temporarily changing the env config for enable api proxy on test to true
  Undid the recent fixes due to unreliable fixes
  Updated the components

### 2026-05-20 14:12 · `612f2c5` · temporarily changing the env config for enable api proxy on test to true

 oci_k8s_test/env-config.yaml | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-05-20 14:10 · `a321fd1` · Undid the recent fixes due to unreliable fixes

 packages/dfa-v6-comp-area/dist/AreaSelect.d.ts                          |    4 +-
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.js                      |  843 +++++----
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.js.map                  |    2 +-
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.umd.cjs                 |    2 +-
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.umd.cjs.map             |    2 +-
 packages/dfa-v6-comp-area/src/AreaSelect.tsx                            |   20 +-
 packages/dfa-v6-comp-indicator/dist/IndicatorSelect.d.ts                |    4 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js            |  879 +++++-----
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js.map        |    2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs       |    2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs.map   |    2 +-
 packages/dfa-v6-comp-indicator/src/IndicatorSelect.tsx                  |   13 +-
 packages/dfa-v6-comp-kw-search/dist/createChipSearch.d.ts.map           |    2 +-
 packages/dfa-v6-comp-kw-search/dist/index.mjs                           |  332 ++--
 packages/dfa-v6-comp-kw-search/dist/index.mjs.map                       |    2 +-
 packages/dfa-v6-comp-kw-search/dist/index.umd.js                        |   22 +-
 packages/dfa-v6-comp-kw-search/dist/index.umd.js.map                    |    2 +-
 packages/dfa-v6-comp-kw-search/dist/types.d.ts                          |    2 -
 packages/dfa-v6-comp-kw-search/dist/types.d.ts.map                      |    2 +-
 packages/dfa-v6-comp-kw-search/src/createChipSearch.ts                  |    3 +-
 packages/dfa-v6-comp-kw-search/src/types.ts                             |    2 -
 packages/dfa-v6-comp-login/dist/Login.d.ts                              |    4 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js                    | 3656 +++++++++++++++++++--------------------
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map                |    2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs               |   40 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map           |    2 +-
 packages/dfa-v6-comp-login/src/Login.tsx                                |   40 +-
 packages/dfa-v6-comp-subgroup/dist/SubgroupSelect.d.ts                  |    4 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.js              |  183 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.js.map          |    2 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.umd.cjs         |    2 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.umd.cjs.map     |    2 +-
 packages/dfa-v6-comp-subgroup/src/SubgroupSelect.tsx                    |    6 +-
 packages/dfa-v6-comp-timeperiod/dist/TimePeriodSelect.d.ts              |    4 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.js          |  325 ++--
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.js.map      |    2 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.umd.cjs     |    2 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.umd.cjs.map |    2 +-
 packages/dfa-v6-comp-timeperiod/src/TimePeriodSelect.tsx                |    6 +-
 src/app/[locale]/auth/page.tsx                                          |    3 -
 src/app/api/proxy/[...path]/route.ts                                    |    1 -
 src/components/AreaSelectionModal.tsx                                   |    3 -
 src/components/IndicatorSelectionModal.tsx                              |    3 -
 src/components/SubgroupSelectionModal.tsx                               |    3 -
 src/components/TimePeriodSelectionModal.tsx                             |    3 -
 src/components/VendorChipSearch.tsx                                     |    3 -
 src/hooks/useSignedFetch.ts                                             |   54 -
 src/hooks/useSignedFetchHeaders.ts                                      |   33 +-
 48 files changed, 3209 insertions(+), 3325 deletions(-)

### 2026-05-20 13:48 · `7759997` · Updated the components

 packages/dfa-v6-comp-area/dist/AreaSelect.d.ts                          |    4 +-
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.js                      |  843 ++++-----
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.js.map                  |    2 +-
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.umd.cjs                 |    2 +-
 packages/dfa-v6-comp-area/dist/dfa-v6-comp-area.umd.cjs.map             |    2 +-
 packages/dfa-v6-comp-area/src/AreaSelect.tsx                            |   20 +-
 packages/dfa-v6-comp-indicator/dist/IndicatorSelect.d.ts                |    4 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js            |  879 +++++-----
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js.map        |    2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs       |    2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs.map   |    2 +-
 packages/dfa-v6-comp-indicator/src/IndicatorSelect.tsx                  |   13 +-
 packages/dfa-v6-comp-kw-search/dist/createChipSearch.d.ts.map           |    2 +-
 packages/dfa-v6-comp-kw-search/dist/index.mjs                           |  332 ++--
 packages/dfa-v6-comp-kw-search/dist/index.mjs.map                       |    2 +-
 packages/dfa-v6-comp-kw-search/dist/index.umd.js                        |   22 +-
 packages/dfa-v6-comp-kw-search/dist/index.umd.js.map                    |    2 +-
 packages/dfa-v6-comp-kw-search/dist/types.d.ts                          |    2 +
 packages/dfa-v6-comp-kw-search/dist/types.d.ts.map                      |    2 +-
 packages/dfa-v6-comp-kw-search/src/createChipSearch.ts                  |    3 +-
 packages/dfa-v6-comp-kw-search/src/types.ts                             |    2 +
 packages/dfa-v6-comp-login/dist/Login.d.ts                              |    4 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js                    | 3656 ++++++++++++++++++++-------------------
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map                |    2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs               |   40 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map           |    2 +-
 packages/dfa-v6-comp-login/src/Login.tsx                                |   40 +-
 packages/dfa-v6-comp-subgroup/dist/SubgroupSelect.d.ts                  |    4 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.js              |  183 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.js.map          |    2 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.umd.cjs         |    2 +-
 packages/dfa-v6-comp-subgroup/dist/dfa-v6-comp-subgroup.umd.cjs.map     |    2 +-
 packages/dfa-v6-comp-subgroup/src/SubgroupSelect.tsx                    |    6 +-
 packages/dfa-v6-comp-timeperiod/dist/TimePeriodSelect.d.ts              |    4 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.js          |  325 ++--
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.js.map      |    2 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.umd.cjs     |    2 +-
 packages/dfa-v6-comp-timeperiod/dist/dfa-v6-comp-timeperiod.umd.cjs.map |    2 +-
 packages/dfa-v6-comp-timeperiod/src/TimePeriodSelect.tsx                |    6 +-
 src/app/[locale]/auth/page.tsx                                          |    3 +
 src/app/api/proxy/[...path]/route.ts                                    |    1 +
 src/components/AreaSelectionModal.tsx                                   |    3 +
 src/components/IndicatorSelectionModal.tsx                              |    3 +
 src/components/SubgroupSelectionModal.tsx                               |    3 +
 src/components/TimePeriodSelectionModal.tsx                             |    3 +
 src/components/VendorChipSearch.tsx                                     |    3 +
 src/hooks/useSignedFetch.ts                                             |   54 +
 src/hooks/useSignedFetchHeaders.ts                                      |   33 +-
 48 files changed, 3325 insertions(+), 3209 deletions(-)

### 2026-05-19 11:12 · `52af7a3` · Merge pull request #161 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit '33d9d5daf5c6f90f405f6c8f5a6040dd80d5e645':
  fixed the API_ORIGIN for the PWA

### 2026-05-19 16:40 · `33d9d5d` · fixed the API_ORIGIN for the PWA

 runtimeCaching.js | 46 ++++++++++++++++++----------------------------
 1 file changed, 18 insertions(+), 28 deletions(-)

### 2026-05-19 08:39 · `17ffacf` · Merge pull request #160 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit 'c2097a2e65d39f903fc108db21a1edc4c6efdc47':
  Refactor applyVizAuthHeadersToRecord to initialize headers object as empty. This ensures headers are populated correctly from the input.

### 2026-05-19 14:08 · `c2097a2` · Refactor applyVizAuthHeadersToRecord to initialize headers object as empty. This ensures headers are populated correctly from the input.

 src/lib/api/appClientAuth.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-05-19 07:14 · `f98943a` · Merge pull request #159 in DFAV6/dfa-v6-visualizer from feature/signature to develop

* commit 'b054352ee629dc49b6558ed3dcb7c2385d14ded7':
  Update MUI styled-engine to v7.3.10, enhance LoginResponse permissions structure, and refactor locale resolution in middleware. Improved error handling and streamlined API request headers for better security and functionality.
  signature header fix

### 2026-05-19 12:29 · `b054352` · Update MUI styled-engine to v7.3.10, enhance LoginResponse permissions structure, and refactor locale resolution in middleware. Improved error handling and streamlined API request headers for better security and functionality.

 packages/dfa-v6-comp-login/dist/Login.d.ts                    | 10 ++++++++-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js          |  8 +++----
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map      |  2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs     |  6 +++---
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map |  2 +-
 src/app/[locale]/auth/page.tsx                                | 12 +++++------
 src/app/api/proxy/[...path]/route.ts                          |  1 +
 src/middleware.ts                                             | 58 +++++++++++++++++++++++++++++++++++++++------------
 8 files changed, 70 insertions(+), 29 deletions(-)

### 2026-05-19 11:48 · `e607380` · signature header fix

 .env.example                                 |  11 +++---
 README.md                                    |   3 +-
 src/app/[locale]/auth/page.tsx               |   7 ++--
 src/app/api/proxy/[...path]/route.ts         |  43 +++++++++++++---------
 src/components/AreaSelectionModal.tsx        |   8 +++--
 src/components/IndicatorSelectionModal.tsx   |   8 +++--
 src/components/SubgroupSelectionModal.tsx    |   8 +++--
 src/components/TimePeriodSelectionModal.tsx  |   8 +++--
 src/components/VendorChipSearch.tsx          |  25 +++++++++++--
 src/components/insights/insightsApiClient.ts |  14 +++-----
 src/hooks/useSignedFetchHeaders.ts           |  33 +++++++++++++++++
 src/lib/api/appClientAuth.ts                 | 130 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/api/client.ts                        |  73 +++++++++++++++++++++-----------------
 src/lib/api/core.ts                          |  33 +++++++----------
 src/lib/api/reference.ts                     |  18 +++-------
 src/lib/auth/authService.ts                  |  17 +++++----
 src/lib/auth/signature.ts                    |  86 ++++++++++++++++++++++++++++++++++++++++++++
 src/lib/constants.ts                         |  14 ++++----
 src/lib/server/vizAppSign.ts                 |  51 ++++++++++++++++++++++++++
 src/lib/server/vizUpstream.ts                |  59 ++++++++++++++++++++++++++++++
 src/middleware.ts                            |  14 ++++----
 21 files changed, 531 insertions(+), 132 deletions(-)

### 2026-05-18 10:07 · `f0e2666` · Update timestamp header format in API requests to use Unix timestamp

 src/app/api/proxy/[...path]/route.ts | 2 +-
 src/lib/api/client.ts                | 2 +-
 src/lib/api/core.ts                  | 2 +-
 3 files changed, 3 insertions(+), 3 deletions(-)

### 2026-05-15 07:09 · `f1ba5bb` · Merge pull request #157 in DFAV6/dfa-v6-visualizer from feature/sprint7 to develop

* commit '4d8d98137414997ee1a46f40c11542fcd480cf37':
  seed config patch api inconsistency fix

### 2026-05-15 12:35 · `4d8d981` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feature/sprint7

### 2026-05-15 12:31 · `707eff2` · seed config patch api inconsistency fix

 src/lib/api/core.ts | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

### 2026-05-14 18:28 · `c8055c4` · Add AboutPanel component and integrate into Header for user information access

- Introduced AboutPanel component for displaying application information.
- Integrated AboutPanel into Header, allowing users to access it via the More Options menu.
- Updated translations to include "About" and its description.
- Adjusted AppSettingsDialog to reset AI_API_KEY value for improved security.

 src/components/Header.tsx                     | 60 ++++++++++++++++++++++++++++++++++++++--------------------
 src/components/about/AboutPanel.tsx           | 69 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/settings/AppSettingsDialog.tsx |  9 +++++----
 src/lib/i18n/translations/translations.json   |  2 ++
 4 files changed, 116 insertions(+), 24 deletions(-)

### 2026-05-14 17:40 · `46d9abd` · Enhance user permissions handling and introduce app settings dialog for super admins. Updated LoginResponse to include detailed permissions structure. Refactored AuthPage to utilize new permissions data for user roles and super admin status. Added AppSettingsDialog component for managing app configurations, accessible to super admins. Updated CoreContext to support config refresh after settings changes.

 packages/dfa-v6-comp-login/src/Login.tsx      |   5 +-
 src/app/[locale]/auth/page.tsx                |  20 ++-
 src/app/api/proxy/[...path]/route.ts          |   5 +-
 src/components/Header.tsx                     |  55 +++++++
 src/components/settings/AppSettingsDialog.tsx | 518 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/contexts/CoreContext.tsx                  |  10 ++
 src/lib/api/core.ts                           |  14 ++
 src/lib/auth/authService.ts                   |  27 +++-
 src/lib/auth/types.ts                         |   5 +
 src/lib/constants.ts                          |  11 ++
 src/lib/i18n/translations/translations.json   |  16 +++
 11 files changed, 674 insertions(+), 12 deletions(-)

### 2026-05-13 12:31 · `c3e181a` · Merge pull request #153 in DFAV6/dfa-v6-visualizer from feature/sprint7 to develop

* commit 'b9d440cee08fd9d632755a8e3274c05b8e69ad25':
  updated lock file
  Refactor IuTreeView component to enhance subgroup selection and label interaction. Updated variable names for clarity, improved checkbox click handling, and added cursor pointer style for labels. Adjusted state management in related functions for better performance.

### 2026-05-13 18:01 · `b9d440c` · updated lock file

 package-lock.json | 797 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 1 file changed, 721 insertions(+), 76 deletions(-)

### 2026-05-13 17:20 · `c2f9eea` · Refactor IuTreeView component to enhance subgroup selection and label interaction. Updated variable names for clarity, improved checkbox click handling, and added cursor pointer style for labels. Adjusted state management in related functions for better performance.

 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js          | 292 ++++++++++++++++++++++--------------------
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.js.map      |   2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs     |   2 +-
 packages/dfa-v6-comp-indicator/dist/dfa-v6-comp-indicator.umd.cjs.map |   2 +-
 packages/dfa-v6-comp-indicator/dist/styles.css                        |   2 +-
 5 files changed, 158 insertions(+), 142 deletions(-)

### 2026-05-11 12:48 · `4aa9913` · Updated embed to use the short url

 src/app/[locale]/visualize/embed/page.tsx | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)

### 2026-05-11 12:42 · `434d033` · Fix: fixed the infinite calls bug on share links api

 src/components/visualizer/ShareModal.tsx | 48 +++++++++++++++++++++++++++---------------------
 1 file changed, 27 insertions(+), 21 deletions(-)

### 2026-05-11 12:12 · `4b236f5` · Feature: Updated the share url feature, from client side base64 encoded url, to a shortened url store in the database

 src/app/[locale]/visualize/embed/page.tsx |   9 +++---
 src/app/[locale]/visualizer/page.tsx      |   6 ++--
 src/app/api/proxy/[...path]/route.ts      |  20 ++++++++++++++
 src/components/visualizer/ShareModal.tsx  | 106 ++++++++++++++++++++++++++++++++++++++++++++++++++--------------------
 4 files changed, 104 insertions(+), 37 deletions(-)

### 2026-05-08 18:37 · `609455c` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feature/sprint7

### 2026-05-08 18:37 · `17895b8` · Refactor language handling in AuthPage and Header components to utilize system languages from the backend. Introduce new API endpoint for fetching system languages and update CoreContext to manage this data. Remove deprecated language parsing logic and adjust related components for improved localization support.

 src/app/[locale]/auth/page.tsx                 | 22 ++++++----------------
 src/app/[locale]/visualizer/page.tsx           | 32 ++++++++++++++++----------------
 src/app/api/proxy/[...path]/route.ts           | 10 ++++++++++
 src/app/globals.css                            | 12 ++++++++++++
 src/app/layout.tsx                             | 13 ++++++++++---
 src/components/Header.tsx                      | 64 +++++++++++++++++-----------------------------------------------
 src/components/SelectionModal.tsx              |  4 ++--
 src/components/gallery/GalleryPage.tsx         | 14 +++++++-------
 src/components/insights/insightsMarkdown.css   | 10 ++++++++++
 src/components/insights/insightsRenderer.tsx   | 32 ++++++++++++++++----------------
 src/components/visualizer/AppearanceTab.tsx    |  2 +-
 src/components/visualizer/BasicSettingsTab.tsx | 24 ++++++++++++------------
 src/components/visualizer/DataTableTab.tsx     |  6 +++---
 src/components/visualizer/ShareModal.tsx       |  2 +-
 src/components/visualizer/VisualizationTab.tsx | 24 ++++++++++++------------
 src/contexts/CoreContext.tsx                   | 21 ++++++++++++++++++---
 src/lib/api/core.ts                            | 13 +++++++++++++
 src/lib/api/types.ts                           | 10 ++++++++++
 src/lib/appConfig/utils.ts                     | 20 +++++++++++++-------
 src/lib/constants.ts                           |  5 ++---
 src/lib/i18n/config.ts                         |  8 +++++++-
 21 files changed, 198 insertions(+), 150 deletions(-)

### 2026-05-08 06:26 · `aab7d70` · Merge pull request #149 in DFAV6/dfa-v6-visualizer from feature/map to develop

* commit '09a6427703fec0de9cdd680419e069a1a62e3281':
  Regenerated the lockfile

### 2026-05-08 11:52 · `09a6427` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feature/map

### 2026-05-08 11:51 · `3b34a7d` · Regenerated the lockfile

 package-lock.json | 1331 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------------------
 1 file changed, 964 insertions(+), 367 deletions(-)

### 2026-05-08 05:11 · `643646f` · Merge pull request #148 in DFAV6/dfa-v6-visualizer from feature/map to develop

* commit 'a39c87a594f06f6364a43f1431c0229a04ef3810':
  Update

### 2026-05-08 10:38 · `a39c87a` · Update

 src/app/[locale]/visualizer/page.tsx | 7 ++++++-
 1 file changed, 6 insertions(+), 1 deletion(-)

### 2026-05-07 17:37 · `1ba3c24` · Update source maps for dfa-v6-comp-login package to reflect recent changes in dependencies and structure. This includes updates to the mapping files for both UMD and ES modules.

 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map      | 2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)

### 2026-05-07 17:25 · `766a2e3` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feature/map

### 2026-05-07 17:21 · `751f532` · Refactor VisualizationTab component to streamline area selection logic. Replaced direct references to selectedComponents.area with a unified mapAreas variable for improved clarity and maintainability. Updated dependencies in useMemo hooks accordingly.

 src/components/visualizer/VisualizationTab.tsx | 17 +++++++----------
 1 file changed, 7 insertions(+), 10 deletions(-)

### 2026-05-07 16:42 · `6667fc1` · Enhance Visualizer UI state management by adding session persistence for side panel and active tab. Introduced new session storage keys for UI state, allowing restoration of the edit settings tab and side panel view on refresh. Updated relevant components to utilize the new state management functions.

 src/app/[locale]/visualizer/page.tsx                | 16 +++++++++++++++
 src/components/visualizer/VisualizationSettings.tsx | 26 ++++++++++++++++++++++--
 src/components/visualizer/VisualizationTab.tsx      | 31 ++++++++++++++++++++++++++--
 src/contexts/VisualizerStateContext.tsx             |  1 +
 src/lib/constants.ts                                |  5 +++++
 src/lib/visualizer/sessionAdapter.ts                | 67 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 142 insertions(+), 4 deletions(-)

### 2026-05-07 15:46 · `46eb901` · Update package-lock.json to remove unnecessary libc entries and bump @mui/styled-engine version to v7.3.10. Enhance visualization engine with barGap adjustment for better chart rendering.

 package-lock.json                                                           | 592 +-----------------------------------
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js                        |   8 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map                    |   2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs                   |   6 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map               |   2 +-
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js          |   2 +-
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js.map      |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine.mjs                          |   1 +
 packages/dfa-v6-comp-visualization/dist/engine.mjs.map                      |   2 +-
 .../dfa-v6-comp-visualization/dist/engine/optionBuilders/pyramid.d.ts.map   |   2 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/pyramid.ts     |   1 +
 src/components/visualizer/MapSettingsSection.tsx                            |  76 +++--
 src/lib/i18n/translations/translations.json                                 |   6 +-
 13 files changed, 76 insertions(+), 626 deletions(-)

### 2026-05-07 10:38 · `86c5e1c` · Update package dependencies and remove optional dependencies

 package-lock.json | 2509 +++++++++++++++++++++++++++++++++++++++++++++++++++++----------------------------------------
 package.json      |    3 -
 2 files changed, 1431 insertions(+), 1081 deletions(-)

### 2026-04-30 17:59 · `29b5892` · Enhance EmbedPage and VisualizerPage functionality with data warehouse integration and filter handling

- Updated EmbedPage to utilize dataWarehouseId and getConfig for improved data fetching.
- Refactored dataApiParams to handle composite indicator IDs more effectively.
- Introduced selectedComponentsToFilters utility for better filter value derivation from selected components.
- Cleaned up VisualizerPage by removing unused functions and optimizing selection identity handling.
- Enhanced share URL handling in embed/share functionality to support new indicator formats.

 src/app/[locale]/visualize/embed/page.tsx         |  15 ++++++---
 src/app/[locale]/visualizer/page.tsx              |  38 +---------------------
 src/app/api/proxy/[...path]/route.ts              |  15 +++------
 src/components/visualizer/VisualizationTab.tsx    |   7 ++--
 src/lib/visualizer/dataApiParams.ts               |  15 ++++++---
 src/lib/visualizer/embed/shareUrl.ts              | 107 +++++++++++++++++++++++++++++++++++++++++---------------------
 src/lib/visualizer/selectedComponentsToFilters.ts |  43 +++++++++++++++++++++++++
 7 files changed, 144 insertions(+), 96 deletions(-)

### 2026-04-30 15:11 · `624014e` · Refactor header and visualizer components for improved mobile responsiveness and layout adjustments

- Updated CSS for app header and inner wrapper to enhance mobile layout.
- Modified VisualizerLayout to simplify height calculations.
- Introduced mobile filter functionality in VisualizerPage with a bottom sheet for better accessibility.
- Adjusted DataTableTab and VisualizationTab for consistent spacing and layout on mobile devices.
- Added translations for new filter settings in translations.json.

 src/app/[locale]/visualizer/layout.tsx         |   2 +-
 src/app/[locale]/visualizer/page.tsx           | 150 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/app/globals.css                            |  12 ++---
 src/components/Header.tsx                      |   8 ++--
 src/components/visualizer/DataTableTab.tsx     |  14 +++---
 src/components/visualizer/VisualizationTab.tsx | 162 +++++++++++++++++++++++++++++++++++++++++++++++++++--------------
 src/lib/i18n/translations/translations.json    |   1 +
 7 files changed, 295 insertions(+), 54 deletions(-)

### 2026-04-29 16:02 · `ee18b1b` · Enhance map visualization features and update configuration options

- Introduced new map label toggles in ChartConfig for area name, data value, and area ID display.
- Updated MapChartData type to include areaId for better data handling.
- Refactored buildMapOption function to support new label configurations and improve visualMap settings.
- Enhanced BasicSettingsTab to better organize map classification settings.

 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js         |  33 +-
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js.map     |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine.mjs                         | 640 +++++++++++++++++++------------------
 packages/dfa-v6-comp-visualization/dist/engine.mjs.map                     |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/map.d.ts.map |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts                  |   7 +
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts.map              |   2 +-
 packages/dfa-v6-comp-visualization/src/engine/optionBuilders/map.ts        | 100 ++++--
 packages/dfa-v6-comp-visualization/src/engine/types.ts                     |   4 +-
 src/components/visualizer/BasicSettingsTab.tsx                             |   7 +-
 src/components/visualizer/MapSettingsSection.tsx                           |  32 ++
 src/components/visualizer/VisualizationTab.tsx                             |  10 +-
 src/lib/i18n/translations/translations.json                                |   4 +
 src/lib/visualizer/chartTransform.ts                                       |  23 ++
 src/lib/visualizer/types.ts                                                |  10 +
 15 files changed, 511 insertions(+), 367 deletions(-)

### 2026-04-29 14:43 · `6fd1752` · Refactor backend URL construction in proxy route

- Updated the dispatch function to include search parameters in the backend URL for the app-config route.
- Improved clarity and maintainability of the URL construction logic.

 src/app/api/proxy/[...path]/route.ts | 11 +++++------
 1 file changed, 5 insertions(+), 6 deletions(-)

### 2026-04-29 13:59 · `5a6fd18` · Enhance choropleth map support and update configuration handling

- Added support for choropleth maps in the visualization package, including new MapChartData type and related utilities.
- Updated README to document new map features and configuration requirements.
- Refactored map URL resolution logic to accommodate nested map configurations and improve error handling.
- Modified constants to prefer DW_MAPS over legacy DFA_MAPS for better clarity in map configuration.
- Enhanced the VisualizationTab component to utilize the new map configuration structure.

 packages/dfa-v6-comp-visualization/README.md   | 107 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/components/visualizer/VisualizationTab.tsx |   6 ++--
 src/lib/api/core.ts                            |  23 ++++++++++++--
 src/lib/constants.ts                           |   4 ++-
 src/lib/visualizer/mapUtils.ts                 | 102 +++++++++++++++++++++++++++++++++++++++++++++-----------------
 5 files changed, 204 insertions(+), 38 deletions(-)

### 2026-04-28 18:18 · `1f740a4` · Refactor visualization settings constants to improve icon handling

- Updated chartVariants and legendIcons to use ChartSettingsIcon type for better flexibility.
- Replaced the Map icon with PublicIcon from MUI for enhanced visual consistency.
- Added import for ComponentType from React to support new icon type definition.

 src/components/visualizer/VisualizationSettingsConstants.ts | 13 ++++++++-----
 1 file changed, 8 insertions(+), 5 deletions(-)

### 2026-04-28 18:15 · `bd12c30` · Enhance map visualization features and update dependencies

- Added support for map classification settings in the BasicSettingsTab and MapSettingsSection components.
- Updated echartsChartData type to include MapChartData.
- Introduced a utility function to filter data rows for single time periods in map visualizations.
- Improved styling and layout for map settings UI components.
- Updated translations to include new map-related terms.
- Removed unnecessary dev dependency from package-lock.json.

 package-lock.json                                |  1 -
 src/components/insights/InsightsPanel.tsx        | 22 ++++++++++++++++++++--
 src/components/visualizer/BasicSettingsTab.tsx   | 12 ++++++++----
 src/components/visualizer/MapSettingsSection.tsx | 19 ++++++++++---------
 src/components/visualizer/VisualizationTab.tsx   | 12 +++++++-----
 src/lib/i18n/translations/translations.json      |  9 +++++++++
 src/lib/visualizer/chartTransform.ts             | 44 ++++++++++++++++++++++++++++++++++++++++++--
 7 files changed, 96 insertions(+), 23 deletions(-)

### 2026-04-28 12:40 · `76d9324` · build files

 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js         |  42 ++--
 packages/dfa-v6-comp-visualization/dist/embed/dfa-viz-embed.min.js.map     |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine.mjs                         | 503 +++++++++++++++++++++----------------
 packages/dfa-v6-comp-visualization/dist/engine.mjs.map                     |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/index.d.ts                  |   6 +-
 packages/dfa-v6-comp-visualization/dist/engine/index.d.ts.map              |   2 +-
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/map.d.ts     |   4 +
 packages/dfa-v6-comp-visualization/dist/engine/optionBuilders/map.d.ts.map |   1 +
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts                  |  31 ++-
 packages/dfa-v6-comp-visualization/dist/engine/types.d.ts.map              |   2 +-
 packages/dfa-v6-comp-visualization/dist/index.d.ts                         |   2 +-
 packages/dfa-v6-comp-visualization/dist/index.d.ts.map                     |   2 +-
 packages/dfa-v6-comp-visualization/dist/index.mjs                          |  29 +--
 13 files changed, 367 insertions(+), 261 deletions(-)

### 2026-04-28 12:32 · `54936cb` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feature/map

### 2026-04-28 12:27 · `7130966` · Add support for choropleth map charts in dfa-toolkit-comp-charts

- Introduced MapChartData type and isMapChartData type guard for handling map data.
- Implemented buildMapOption function for generating ECharts options for map charts.
- Updated chart transformation logic to include map data processing.
- Added MapSettingsSection component for configuring map classification settings.
- Enhanced BasicSettingsTab and EmbedChartView components to support map chart settings.
- Updated visualization types to include map classification options.
- Added utility functions for map area enrichment and classification.
- Updated constants to include DML map library configuration options.

 packages/dfa-toolkit-comp-charts/src/engine/index.ts              |  10 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/map.ts | 103 ++++++++++++++++++
 packages/dfa-toolkit-comp-charts/src/engine/types.ts              |  31 +++++-
 packages/dfa-toolkit-comp-charts/src/index.ts                     |   2 +
 src/components/visualizer/BasicSettingsTab.tsx                    |   6 ++
 src/components/visualizer/EmbedChartView.tsx                      |   5 +-
 src/components/visualizer/MapSettingsSection.tsx                  | 172 ++++++++++++++++++++++++++++++
 src/components/visualizer/VisualizationTab.tsx                    | 148 +++++++++++++++++++++-----
 src/lib/api/referenceClient.ts                                    |  62 ++++++-----
 src/lib/constants.ts                                              |   4 +
 src/lib/visualizer/chartTransform.ts                              |  58 ++++++++++-
 src/lib/visualizer/mapUtils.ts                                    | 260 ++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/visualizer/types.ts                                       |  10 ++
 13 files changed, 813 insertions(+), 58 deletions(-)

### 2026-04-15 14:49 · `b06401a` · Refine visualization panel behavior in VisualizerPage

- Adjusted logic for handling the visualization settings panel to prevent unintended interactions.
- Updated state management for `ignoreNextSettingsOpenRef` to ensure proper opening and closing of the settings drawer.
- Improved comments for clarity on the intended functionality regarding panel state transitions.

 src/app/[locale]/visualizer/page.tsx | 9 ++++++++-
 1 file changed, 8 insertions(+), 1 deletion(-)

### 2026-04-14 18:16 · `e0212bb` · Add tsconfig.tsbuildinfo to .gitignore to prevent build files from being tracked

 .gitignore | 2 ++
 1 file changed, 2 insertions(+)

### 2026-04-14 18:15 · `b151f50` · Build cache file deleted, not supposed to be deleted

 tsconfig.tsbuildinfo | 1 -
 1 file changed, 1 deletion(-)

### 2026-04-14 14:56 · `579e5d6` · Implement subgroup ordering in visualizer charts: Introduce sorting options based on API metadata for subgroup display order. Update relevant components and data transformation functions to utilize the new sorting logic, enhancing the visual representation of data in charts. Refactor data API response handling to include subgroup metadata for improved chart rendering.

 src/app/[locale]/visualizer/page.tsx           |   6 +++
 src/components/visualizer/DataTableTab.tsx     |  10 ++--
 src/components/visualizer/EmbedChartView.tsx   |  19 ++++---
 src/components/visualizer/VisualizationTab.tsx |  35 ++++++------
 src/lib/api/data.ts                            |  38 +++++++++----
 src/lib/constants.ts                           |   2 +
 src/lib/gallery/fetchPreviewData.ts            |   8 ++-
 src/lib/visualizer/chartTransform.ts           | 191 +++++++++++++++++++++++++++++++++++++++++++++++++----------------
 src/lib/visualizer/dataApiAdapter.ts           |  23 +++++++-
 src/lib/visualizer/embed/snapshot.ts           |  10 +++-
 src/lib/visualizer/types.ts                    |   2 +
 tsconfig.tsbuildinfo                           |   2 +-
 12 files changed, 258 insertions(+), 88 deletions(-)

### 2026-04-14 12:16 · `2d7486d` · Refactor Chart Layout Section in Visualizer: Update axis mapping logic to utilize a checkbox matrix for dimension selection. Introduce new utility functions for managing Y-column constraints and mapping from matrix state. Enhance translations with a new dimension label. Clean up unused props and improve overall code readability.

 src/components/visualizer/BasicSettingsTab.tsx | 235 ++++++++++++++++++++++++++++++-----------------------------------
 src/lib/i18n/translations/translations.json    |   1 +
 src/lib/visualizer/axisMapping.ts              |  46 +++++++++++++
 tsconfig.tsbuildinfo                           |   2 +-
 4 files changed, 156 insertions(+), 128 deletions(-)

### 2026-04-13 18:40 · `4e2263f` · Enhance visualizer session management by introducing SESSION_STORAGE_KEYS for gallery navigation. Implement logic to strip gallery-specific titles and subtitles on sign-out, ensuring data-derived headings are used on subsequent loads. Update Header and GalleryPage components to manage session storage effectively during navigation. Refactor ClearVisualizerStateOnLeave to maintain session state for temporary destinations, improving user experience.

 src/components/Header.tsx                      | 29 ++++++++++++++++++++++++++++-
 src/components/gallery/GalleryPage.tsx         | 11 ++++++++++-
 src/components/visualizer/VisualizationTab.tsx | 11 +++++++----
 src/contexts/VisualizerStateContext.tsx        | 41 ++++++++++++++++++++++-------------------
 src/lib/constants.ts                           |  5 +++++
 src/lib/visualizer/sessionAdapter.ts           | 25 +++++++++++++++++++++++++
 tsconfig.tsbuildinfo                           |  2 +-
 7 files changed, 98 insertions(+), 26 deletions(-)

### 2026-04-01 12:14 · `557ca7d` · Enhance chart layout functionality to support additional chart types including spider and pyramid. Updated logic for dimension selection and series mapping in BasicSettingsTab and VisualizationTab components. Improved user experience by refining conditions for series selection and auto-setting dimensions.

 src/components/visualizer/BasicSettingsTab.tsx | 36 +++++++++++++++++++++++++++---------
 src/components/visualizer/VisualizationTab.tsx | 17 +++++++++++++++++
 tsconfig.tsbuildinfo                           |  2 +-
 3 files changed, 45 insertions(+), 10 deletions(-)

### 2026-03-31 18:47 · `df0edcd` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-31 17:45 · `ec4786c` · Enhance chart engine with treemap support

- Added support for treemap charts by introducing new types and functions in the engine.
- Updated ChartConfig and ChartData interfaces to include treemap options.
- Implemented a new function to build treemap options, ensuring compatibility with existing chart configurations.
- Enhanced type definitions for improved clarity and type safety across the engine.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js            |  31 +--
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 462 +++++++++++++++++++++---------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/index.d.ts                     |   6 +-
 packages/dfa-toolkit-comp-charts/dist/engine/index.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/treemap.d.ts    |  17 ++
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/treemap.d.ts.map     |   1 +
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts                     |  14 +-
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.d.ts                            |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.d.ts.map                        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.mjs                             |   7 +-
 packages/dfa-toolkit-comp-charts/src/engine/index.ts                        |  10 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/treemap.ts       | 106 +++++++++
 packages/dfa-toolkit-comp-charts/src/engine/types.ts                        |  19 +-
 packages/dfa-toolkit-comp-charts/src/index.ts                               |   2 +
 src/components/visualizer/AppearanceTab.tsx                                 |  46 ++++
 src/components/visualizer/BasicSettingsTab.tsx                              |  55 ++---
 src/components/visualizer/EmbedChartView.tsx                                |   8 +-
 src/components/visualizer/VisualizationTab.tsx                              |  51 ++--
 src/lib/i18n/translations/translations.json                                 |  12 +-
 src/lib/visualizer/chartTransform.ts                                        |  63 ++++-
 23 files changed, 642 insertions(+), 280 deletions(-)

### 2026-03-31 11:15 · `538d088` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-31 10:58 · `40f6c4f` · Add scatter chart support and refactor engine types

- Introduced support for scatter charts by adding new types and functions in the engine.
- Updated ChartConfig and ChartData interfaces to include scatter chart options.
- Implemented a new function to build scatter chart options.
- Enhanced type definitions to improve type safety and clarity across the engine.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js            |  58 +++----
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 315 ++++++++++++++++++++++--------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/index.d.ts                     |   6 +-
 packages/dfa-toolkit-comp-charts/dist/engine/index.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/scatter.d.ts    |   4 +
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/scatter.d.ts.map     |   1 +
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts                     |  24 ++-
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.d.ts                            |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.d.ts.map                        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.mjs                             |  65 ++++----
 packages/dfa-toolkit-comp-charts/src/engine/index.ts                        |  10 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/scatter.ts       |  93 +++++++++++
 packages/dfa-toolkit-comp-charts/src/engine/types.ts                        |  24 ++-
 packages/dfa-toolkit-comp-charts/src/index.ts                               |   2 +
 src/components/visualizer/BasicSettingsTab.tsx                              | 210 ++++++++++++++++++++++++
 src/components/visualizer/EmbedChartView.tsx                                |  36 +++--
 src/components/visualizer/VisualizationSettings.tsx                         |   6 +-
 src/components/visualizer/VisualizationTab.tsx                              |  52 ++++--
 src/lib/visualizer/chartTransform.ts                                        | 131 ++++++++++++++-
 src/lib/visualizer/types.ts                                                 |  27 ++++
 23 files changed, 836 insertions(+), 240 deletions(-)

### 2026-03-30 18:34 · `ff0bd85` · Update visualizer time period handling post-hydration

- Adjusted the logic to clear explicit time period selection only after hydration is complete, preventing premature resets during the initial handoff.
- Enhanced the dependency array in the useEffect hook to include `hydrationDone`, ensuring proper state management when the indicator set changes.

 src/app/[locale]/visualizer/page.tsx | 9 ++++++---
 1 file changed, 6 insertions(+), 3 deletions(-)

### 2026-03-30 17:57 · `8e80404` · Implement session management for visualization configuration

- Added functions to persist and retrieve visualization configuration (chart type, colors, fonts, etc.) in session storage.
- Updated VisualizerPage to restore chart configuration alongside sidebar selection during hydration.
- Cleared visualization configuration from session storage when the user navigates away from the visualizer or clears selection.
- Enhanced session storage keys to include `VISUALIZER_VIZ_CONFIG` for improved state management.

 src/app/[locale]/visualizer/page.tsx    | 20 +++++++++++++++++---
 src/contexts/VisualizerStateContext.tsx |  1 +
 src/lib/constants.ts                    |  2 ++
 src/lib/visualizer/sessionAdapter.ts    | 36 ++++++++++++++++++++++++++++++++++++
 4 files changed, 56 insertions(+), 3 deletions(-)

### 2026-03-30 17:37 · `46cf805` · Refactor visualizer hydration logic and state management

- Introduced a new state variable `hydrationDone` to manage the completion of sidebar hydration.
- Updated the useLayoutEffect to set `hydrationDone` based on session restoration and URL parameters.
- Ensured that sidebar selection persistence only occurs after hydration is complete.
- Streamlined the handling of share state and session data to improve user experience and prevent premature state clearing.

 src/app/[locale]/visualizer/page.tsx | 61 +++++++++++++++++++++++++++++++------------------------------
 tsconfig.tsbuildinfo                 |  2 +-
 2 files changed, 32 insertions(+), 31 deletions(-)

### 2026-03-30 16:51 · `161e1e0` · Enhance localization and accessibility in visualizer components

- Updated the NotFound component to utilize translations for titles and descriptions based on user locale.
- Improved the Header component by replacing static aria-labels with localized strings for better accessibility.
- Refactored LocaleSwitcher to use context for translations and updated aria-labels accordingly.
- Enhanced SelectionModal and TileComponent with localized aria-labels for better user experience.
- Updated various visualizer components (e.g., AppearanceTab, TypographyTab) to use context-based translations for labels and placeholders.
- Improved ShareModal with localized text for sharing options and embed instructions.
- Refactored VisualizationSettings to utilize translations for tab labels and titles, enhancing overall accessibility.

 src/app/[locale]/visualizer/page.tsx                |   6 +-
 src/app/not-found.tsx                               |  17 +++-
 src/components/Header.tsx                           |   4 +-
 src/components/LocaleSwitcher.tsx                   |   6 +-
 src/components/SelectionModal.tsx                   |   4 +-
 src/components/TileComponent.tsx                    |   4 +-
 src/components/visualizer/AppearanceTab.tsx         |  18 ++--
 src/components/visualizer/BasicSettingsTab.tsx      | 288 ++++++++++++++++++++++++++----------------------------------
 src/components/visualizer/EmbedChartView.tsx        |   9 +-
 src/components/visualizer/FontControls.tsx          |   6 +-
 src/components/visualizer/ShareModal.tsx            |  46 +++++-----
 src/components/visualizer/TypographyTab.tsx         |  12 +--
 src/components/visualizer/VisualizationSettings.tsx |  23 ++---
 src/components/visualizer/VisualizationTab.tsx      | 135 ++++++++++++++--------------
 src/components/visualizer/VisualizerTabIcons.tsx    |   2 +-
 src/lib/gallery/fetchPreviewData.ts                 |   8 +-
 src/lib/i18n/translations/translations.json         | 145 +++++++++++++++++++++++++++++-
 src/lib/visualizer/axisMapping.ts                   | 175 +++++++++---------------------------
 src/lib/visualizer/chartTransform.ts                |   2 +-
 src/lib/visualizer/chartUiLabels.ts                 |  63 +++++++++++++
 src/lib/visualizer/embed/snapshot.ts                |   4 +-
 src/lib/visualizer/types.ts                         |   4 +-
 tsconfig.tsbuildinfo                                |   2 +-
 23 files changed, 536 insertions(+), 447 deletions(-)

### 2026-03-30 14:27 · `3cc1e5d` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-30 14:27 · `91f7e65` · Refactor visualizer session management and enhance layout handling

- Updated session storage keys for visualizer to use `VIZ_SEARCH_HANDOFF` for one-shot transfers from the landing page, replacing legacy keys.
- Improved layout handling in the visualizer by locking the viewport to accommodate nested flex and overflow properties.
- Enhanced chip search functionality to persist search handoff data and clear it appropriately.
- Added loading states for metadata requests in the visualizer to improve user experience.
- Implemented validation for axis mapping against data cardinality to ensure accurate chart rendering.

 README.md                                           |   4 +-
 src/app/[locale]/visualizer/layout.tsx              |  10 ++-
 src/app/[locale]/visualizer/page.tsx                | 107 +++++++++++++++++----------
 src/components/LandingContent.tsx                   |  10 +--
 src/components/VendorChipSearch.tsx                 |  52 ++++++++------
 src/components/visualizer/BasicSettingsTab.tsx      | 224 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/components/visualizer/EmbedChartView.tsx        |   8 ++-
 src/components/visualizer/MetadataTab.tsx           |  19 ++++-
 src/components/visualizer/VisualizationSettings.tsx |  14 ++--
 src/components/visualizer/VisualizationTab.tsx      |  55 +++++++++++---
 src/contexts/VisualizerStateContext.tsx             |   2 +
 src/lib/constants.ts                                |  17 +++--
 src/lib/gallery/fetchPreviewData.ts                 |   7 +-
 src/lib/i18n/translations/translations.json         |   1 +
 src/lib/visualizer/axisMapping.ts                   | 194 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/visualizer/sessionAdapter.ts                | 234 ++++++++++++++++++++++++++++++------------------------------
 tsconfig.tsbuildinfo                                |   2 +-
 17 files changed, 746 insertions(+), 214 deletions(-)

### 2026-03-27 14:24 · `fa84aee` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-27 09:59 · `4a7d2b8` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-26 19:01 · `f6d2476` · Implement time period sorting functionality by adding a new utility for comparing time period IDs. Update sorting logic in chart transformation functions to utilize this new utility for improved accuracy in time-based data representation.

 src/lib/visualizer/chartTransform.ts |   5 ++-
 src/lib/visualizer/timePeriodSort.ts | 167 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 170 insertions(+), 2 deletions(-)

### 2026-03-24 18:32 · `833c2be` · refactor: remove debug logging from signIn function in authService

- Eliminated console.log statement for cleaner code and improved performance.
- Streamlined the signIn function to focus on essential operations.

 src/lib/auth/authService.ts | 1 -
 1 file changed, 1 deletion(-)

### 2026-03-24 18:19 · `0e205d3` · refactor: enhance visualizer and gallery components with improved state management and metadata handling

- Updated VisualizerPage to streamline gallery item hydration and metadata fetching.
- Enhanced DataTableTab and MetadataTab to support customizable font styles for titles and subtitles.
- Refactored gallery API client to improve response mapping and payload handling.
- Cleaned up unused code and comments for better readability and maintainability.

 src/app/[locale]/visualizer/page.tsx           | 407 ++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 src/app/api/proxy/[...path]/route.ts           |   7 ++
 src/components/gallery/GalleryPage.tsx         |  52 +--------
 src/components/gallery/galleryUrl.ts           |  96 +---------------
 src/components/visualizer/DataTableTab.tsx     |  25 +++-
 src/components/visualizer/MetadataTab.tsx      |  76 +++++++-----
 src/components/visualizer/VisualizationTab.tsx |   2 +-
 src/lib/api/data.ts                            |  15 +--
 src/lib/auth/authService.ts                    |   1 +
 src/lib/constants.ts                           |   4 +-
 src/lib/gallery/galleryApiClient.ts            |  47 +++++---
 src/lib/gallery/galleryRepository.ts           |   4 +-
 src/lib/gallery/types.ts                       |  56 ++++++++-
 tsconfig.tsbuildinfo                           |   2 +-
 14 files changed, 484 insertions(+), 310 deletions(-)

### 2026-03-23 18:26 · `0f00e08` · refactor: streamline API proxy configuration and clean up related constants

- Removed the API proxy path from the environment example as it is no longer necessary.
- Simplified the API_PROXY_PREFIX constant to a static value.
- Updated the IndicatorSelect component to remove unnecessary query parameters for API requests.
- Cleaned up constants related to API query defaults for improved clarity and maintainability.

 .env.example                                                                |   3 -
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js      | 595 +++++++++++++++++-------------------
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js.map  |   2 +-
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs |   2 +-
 .../dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs.map  |   2 +-
 packages/dfa-toolkit-comp-indicator/src/IndicatorSelect.tsx                 |  25 +-
 src/lib/api/reference.ts                                                    |  21 +-
 src/lib/api/referenceClient.ts                                              |  11 +-
 src/lib/constants.ts                                                        |  18 +-
 tsconfig.tsbuildinfo                                                        |   2 +-
 10 files changed, 299 insertions(+), 382 deletions(-)

### 2026-03-23 18:19 · `ec892fa` · refactor: add API_PUBLIC_KEY constant for enhanced API key management

 src/app/api/proxy/[...path]/route.ts | 1 +
 1 file changed, 1 insertion(+)

### 2026-03-23 18:18 · `2fe3619` · refactor: remove authentication proxy handling from API route

- Eliminated the "auth" case from the API proxy dispatch function as it was no longer needed.
- Updated the API route to streamline request handling for other cases.

 src/app/api/proxy/[...path]/route.ts | 9 ---------
 src/lib/api/core.ts                  | 1 +
 2 files changed, 1 insertion(+), 9 deletions(-)

### 2026-03-23 18:12 · `7b08170` · chore: update ajv dependency and clean up package-lock.json

- Added ajv version 8.18.0 to package.json and package-lock.json.
- Removed outdated ajv entries from nested dependencies in package-lock.json.
- Updated related dependencies for consistency and improved package management.

 package-lock.json                                                           | 142 +++++++++++++++---------------------
 package.json                                                                |   1 +
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.js.map            |   2 +-
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.umd.cjs.map       |   2 +-
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js.map  |   2 +-
 .../dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs.map  |   2 +-
 packages/dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.js.map    |   2 +-
 .../dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.umd.cjs.map    |   2 +-
 src/app/api/proxy/[...path]/route.ts                                        |   3 +-
 src/lib/api/core.ts                                                         |   6 +-
 src/lib/constants.ts                                                        |   2 +-
 tsconfig.tsbuildinfo                                                        |   2 +-
 12 files changed, 72 insertions(+), 96 deletions(-)

### 2026-03-23 18:06 · `af76b89` · refactor: remove unused proxyModeAppKeyHeaders function and clean up API key handling

- Eliminated the proxyModeAppKeyHeaders function as it was no longer necessary.
- Updated fetchCore function to directly manage API key headers based on ENABLE_API_PROXY flag.
- Streamlined code for improved readability and maintainability.

 src/lib/api/core.ts | 11 -----------
 1 file changed, 11 deletions(-)

### 2026-03-23 17:49 · `a51f144` · refactor: remove deprecated app client headers and streamline API key handling

- Deleted the getAppClientHeaders function as it was no longer needed.
- Updated middleware and core API functions to directly handle API key retrieval.
- Adjusted .env.example to remove obsolete API key variables and clarify usage.
- Improved code consistency by using a new proxyModeAppKeyHeaders function for API key management.

 .env.example                    |  5 -----
 src/lib/api/appClientHeaders.ts | 13 -------------
 src/lib/api/core.ts             | 12 ++++++++++--
 src/middleware.ts               |  4 ++--
 tsconfig.tsbuildinfo            |  2 +-
 5 files changed, 13 insertions(+), 23 deletions(-)

### 2026-03-23 17:31 · `ab08492` · refactor: update API header constants to use new naming conventions

- Changed API header constants from X-App-* to X-Api-* for consistency.
- Ensured alignment with recent updates in API key handling.

 src/lib/constants.ts | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)

### 2026-03-23 17:29 · `48a9752` · refactor: update API key handling to use X-App-Key and improve environment variable documentation

- Changed references from X-Api-Key to X-App-Key in the codebase.
- Updated .env.example to reflect the new key naming and usage.
- Adjusted comments and documentation for clarity regarding API key usage.
- Modified gallery API parameters to use consistent naming conventions for pagination.

 .env.example                         |  8 ++++----
 src/app/api/proxy/[...path]/route.ts |  5 +----
 src/lib/api/appClientHeaders.ts      |  6 ++++--
 src/lib/api/core.ts                  |  8 ++++----
 src/lib/constants.ts                 |  2 +-
 src/lib/gallery/galleryApiClient.ts  | 10 +++++-----
 src/lib/gallery/galleryRepository.ts |  4 ++--
 tsconfig.tsbuildinfo                 |  2 +-
 8 files changed, 22 insertions(+), 23 deletions(-)

### 2026-03-23 16:52 · `0fbc1ff` · refactor: simplify ENABLE_API_PROXY constant for environment variable check

 src/lib/constants.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-03-23 16:32 · `cb25e8c` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-23 16:29 · `4af0c46` · feat: add authentication proxy handling and improve environment variable parsing

- Implemented a new case for "auth" in the API proxy to handle authentication requests.
- Enhanced the ENABLE_API_PROXY constant to simplify the environment variable check for enabling the API proxy.

 src/app/api/proxy/[...path]/route.ts | 9 +++++++++
 src/lib/constants.ts                 | 2 +-
 2 files changed, 10 insertions(+), 1 deletion(-)

### 2026-03-23 14:16 · `944e80a` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-23 14:08 · `64f8757` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-23 14:03 · `eaa340d` · refactor: enhance app-config API handling and improve environment configuration

- Updated .env.example to clarify API key usage for backend routes.
- Refactored middleware to include app client headers in API requests.
- Adjusted fetchAppConfig to remove keyword dependency and streamline API calls.
- Introduced unwrapAppConfigValue utility to normalize app-config values.
- Enhanced CoreContext to utilize the new app-config value handling.
- Updated constants to reflect changes in app-config API structure.

 .env.example                         |  5 ++++-
 src/app/api/proxy/[...path]/route.ts |  6 ++----
 src/contexts/CoreContext.tsx         |  8 ++++++--
 src/lib/api/appClientHeaders.ts      | 11 +++++++++++
 src/lib/api/core.ts                  | 31 +++++++++++++++++--------------
 src/lib/api/types.ts                 | 10 ++++++++--
 src/lib/appConfig/utils.ts           | 14 +++++++++++++-
 src/lib/constants.ts                 |  2 +-
 src/middleware.ts                    | 18 +++++++++++++-----
 9 files changed, 75 insertions(+), 30 deletions(-)

### 2026-03-20 17:50 · `192ec05` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-visualizer into feat/subgroup_fix

### 2026-03-20 17:33 · `c0b4c78` · chore: update environment configuration and API proxy handling in .env.example, Dockerfile, and related files

 .env.example                         | 10 ++++++++--
 Dockerfile                           |  2 +-
 src/app/api/proxy/[...path]/route.ts |  3 +++
 src/lib/api/core.ts                  | 12 ++++++------
 src/lib/constants.ts                 | 17 +++++++++--------
 5 files changed, 27 insertions(+), 17 deletions(-)

### 2026-03-19 17:43 · `699618e` · refactor: update waffle chart implementation in VisualizationTab to improve data handling and display logic

 src/components/visualizer/VisualizationTab.tsx | 102 +++++++++++++++++++++++++++++++++++++----------------------------
 1 file changed, 58 insertions(+), 44 deletions(-)

### 2026-03-16 11:02 · `d31d796` · feat: enhance visualizer session management and default area handling

- Added functions to persist and retrieve visualizer selection from session storage, ensuring user selections survive page refreshes.
- Introduced logic to fetch and display default area items when no user area is selected, improving user experience.
- Updated constants to include a key for visualizer selection in session storage.
- Refactored visualization tab to handle default settings and selection identity more effectively, enhancing chart configuration persistence.

 src/app/[locale]/visualizer/page.tsx           | 111 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/components/visualizer/VisualizationTab.tsx |  86 ++++++++++++++++++++++++++++++++++++++++++--------
 src/lib/constants.ts                           |   4 +++
 src/lib/visualizer/sessionAdapter.ts           |  40 ++++++++++++++++++++++++
 4 files changed, 213 insertions(+), 28 deletions(-)

### 2026-03-12 17:46 · `966049b` · fix: update stack handling in bar chart options

- Changed stack assignment in bar chart options to use a default value when stack is not provided.
- Ensured consistent handling of stack property across chart configurations for improved reliability.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js     | 2 +-
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map | 2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs                     | 2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                 | 2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/bar.ts    | 2 +-
 5 files changed, 5 insertions(+), 5 deletions(-)

### 2026-03-12 16:10 · `1bebb0d` · refactor: simplify legend handling and improve grid configuration

- Removed the LEGEND_SCROLL_THRESHOLD constant to streamline legend visibility logic.
- Updated functions to check for series count and visibility without relying on the threshold.
- Enhanced grid configuration to ensure proper layout adjustments based on legend visibility.
- Refactored related functions for clarity and consistency in handling chart options.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js            | 52 +++++++++++-----------
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map        |  2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 86 ++++++++++++++++++-------------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |  2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts  |  2 -
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts.map   |  2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/pie.d.ts.map    |  2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/cartesian.ts     |  4 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/pie.ts           |  3 +-
 9 files changed, 75 insertions(+), 80 deletions(-)

### 2026-03-12 15:11 · `3f0d190` · refactor: enhance layout and styling in DataTableTab and MetadataTab components

- Updated layout structure to improve responsiveness and visual consistency.
- Changed overflow properties to ensure proper scrolling behavior in both tabs.
- Renamed MetadataCard to MetadataSection for clarity and adjusted its styling.
- Enhanced accessibility by ensuring minimum height properties are set correctly.

 src/components/visualizer/DataTableTab.tsx | 14 +++++++++-----
 src/components/visualizer/MetadataTab.tsx  | 41 +++++++++++++++++++++--------------------
 2 files changed, 30 insertions(+), 25 deletions(-)

### 2026-03-12 14:18 · `acd7e5e` · refactor: adjust layout and styling in VisualizationTab component

- Changed overflow properties in the main chart area to improve layout handling.
- Added an ID to the chart container for better accessibility and targeting.
- Updated minimum height for the chart renderer to enhance responsiveness and visual consistency.

 src/components/visualizer/VisualizationTab.tsx | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)

### 2026-03-11 18:28 · `85c169e` · style: update tab icon classes for VisualizerTabIcons component

- Modified class names in VisualizerTabIcons to include 'btn-comp-secondary' for consistent styling across tab icons.
- Ensured that the visual appearance aligns with the updated design standards for better user experience.

 src/components/visualizer/VisualizerTabIcons.tsx | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)

### 2026-03-11 18:25 · `4d791bf` · feat: integrate ShareModal into VisualizerPage and refactor VisualizationTab

- Added ShareModal import to VisualizerPage for sharing functionality.
- Refactored VisualizationTab to remove local ShareModal state and utilize a callback for opening the Share modal.
- Enhanced metadata copying logic in VisualizerPage to format and include additional details.
- Improved area filter handling in VisualizationTab for better data representation.

 src/app/[locale]/visualizer/page.tsx           | 244 ++++++++++++++++++++++++++++++++++++-----------------------------
 src/components/visualizer/VisualizationTab.tsx |  45 ++++--------
 2 files changed, 147 insertions(+), 142 deletions(-)

### 2026-03-11 17:25 · `c27ccf5` · feat: enhance BasicSettingsTab and VisualizationSettings for compact mode

- Added a `compact` prop to BasicSettingsTab to conditionally render labels based on panel width.
- Implemented a responsive design in VisualizationSettings to toggle compact mode based on panel width, improving UI for narrow displays.
- Updated button styles and tooltip handlers to accommodate the new compact layout.

 src/components/visualizer/BasicSettingsTab.tsx      | 25 +++++++++++++++++--------
 src/components/visualizer/VisualizationSettings.tsx | 37 +++++++++++++++++++++++++++++++------
 2 files changed, 48 insertions(+), 14 deletions(-)

### 2026-03-11 15:47 · `66f0ae9` · feat: implement tab icons for visualizer component navigation

- Added VisualizerTabIcons component to provide icon-based tab navigation for visualization, data, and metadata views.
- Updated MetadataTab and DataTableTab to integrate tab icons, enhancing user experience and navigation clarity.
- Refactored existing tab structures to accommodate new tab switching functionality.

 src/app/[locale]/visualizer/page.tsx             |  76 ++++++++-------
 src/components/visualizer/DataTableTab.tsx       |  33 +++++--
 src/components/visualizer/MetadataTab.tsx        |  67 +++++++++----
 src/components/visualizer/VisualizationTab.tsx   | 333 ++++++++++++++++++++++++++++++++-------------------------------
 src/components/visualizer/VisualizerTabIcons.tsx |  73 ++++++++++++++
 5 files changed, 353 insertions(+), 229 deletions(-)

### 2026-03-10 18:56 · `0c895c4` · refactor: improve y-axis configuration handling in cartesian option builder

- Enhanced the buildYAxisValue function to conditionally apply scale settings based on the presence of explicit min, max, and interval values.
- Improved readability and maintainability of the y-axis configuration logic.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js            |   2 +-
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 134 +++++++++++++++++++-----------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |   2 +-
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/cartesian.ts     |  16 ++++-
 6 files changed, 87 insertions(+), 71 deletions(-)

### 2026-03-10 17:22 · `dcca716` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feat/subgroup_fix

### 2026-03-10 17:17 · `25ec9ac` · refactor: update chart variant icons to use Lucide components

- Replaced string-based icons with LucideIcon components for better scalability and consistency.
- Enhanced the rendering of chart variant buttons in the BasicSettingsTab for improved visual clarity.

 src/components/visualizer/BasicSettingsTab.tsx              | 37 ++++++++++++++++++---------------
 src/components/visualizer/VisualizationSettingsConstants.ts | 59 ++++++++++++++++++++++++++++++++++-------------------
 2 files changed, 58 insertions(+), 38 deletions(-)

### 2026-03-10 16:44 · `d14b7a2` · refactor: enhance bar chart option handling and improve data processing

- Updated bar chart option builder to support both horizontal and stacked-horizontal configurations.
- Introduced a new flag to conditionally apply stacking based on chart variant.
- Refactored data processing in VisualizationTab to separate pie and cartesian chart data handling for improved clarity and performance.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js         |   2 +-
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map     |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs                         | 182 +++++++++++++++++++--------------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                     |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/bar.d.ts.map |   2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/bar.ts        |   7 +-
 src/components/visualizer/VisualizationTab.tsx                           |  19 ++--
 7 files changed, 112 insertions(+), 104 deletions(-)

### 2026-03-06 18:35 · `0efb684` · refactor: update DataApiParams to use unified identifier fields

- Replaced individual NID and GID fields with a single identifier field for indicators, units, subgroups, areas, and IUS.
- Updated related functions to handle the new identifier format.
- Adjusted error messages and query parameter serialization to reflect the changes.

 src/lib/api/data.ts                  | 56 ++++++++++++++++++++------------------------------------
 src/lib/appConfig/utils.ts           |  2 +-
 src/lib/gallery/exportFromItem.ts    | 25 ++++---------------------
 src/lib/gallery/fetchPreviewData.ts  |  3 +--
 src/lib/visualizer/dataApiParams.ts  | 27 ++++++---------------------
 src/lib/visualizer/embed/shareUrl.ts | 26 ++++----------------------
 6 files changed, 36 insertions(+), 103 deletions(-)

### 2026-03-03 14:45 · `9ce074e` · refactor: improve layout and overflow handling in visualizer components

- Updated the visualizer page to set a maximum height and enable overflow handling, ensuring better content visibility and layout management.
- Enhanced the VisualizationTab component to allow for vertical scrolling and prevent overflow, improving user experience when displaying charts and controls.

 src/app/[locale]/visualizer/page.tsx           | 2 +-
 src/components/visualizer/VisualizationTab.tsx | 4 ++--
 2 files changed, 3 insertions(+), 3 deletions(-)

### 2026-03-03 12:59 · `6f77d65` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feat/subgroup_fix

### 2026-03-03 12:42 · `2266110` · feat: enhance visualizer metadata handling and UI

- Introduced fetching of per-indicator metadata when the Metadata tab is active, improving user experience by displaying relevant information for selected indicators.
- Updated the MetadataTab component to accept a list of indicators and their metadata, streamlining the display of metadata cards.
- Enhanced DataTableTab to show the count of data points when filters are applied, providing clearer context to users.
- Added new translations for metadata availability messages to support internationalization.
- Refactored related components for improved readability and maintainability.

 src/app/[locale]/visualizer/page.tsx         |  69 +++++++++++++++++++-------------
 src/components/visualizer/DataTableTab.tsx   | 143 ++++++++++++++++++++++++++++++++++++++++---------------------------
 src/components/visualizer/MetadataTab.tsx    | 126 ++++++++++++++++++++++++++++++++++-------------------------
 src/lib/api/reference.ts                     |  21 ++++++++++
 src/lib/i18n/translations/en.json            |   1 +
 src/lib/i18n/translations/fr.json            |   1 +
 src/lib/i18n/translations/hi.json            |   1 +
 src/lib/visualizer/dataApiAdapter.ts         |  48 ++++++++++++++++++++---
 src/lib/visualizer/timeRangeFromSelection.ts |  11 ++++--
 tsconfig.tsbuildinfo                         |   2 +-
 10 files changed, 275 insertions(+), 148 deletions(-)

### 2026-03-02 18:35 · `eca7238` · feat: enhance gallery item handling in visualizer

- Added functionality to load gallery items based on the URL parameter `gid`, allowing for snapshot data usage and bookmark state management.
- Implemented logic to check for matching filters when displaying snapshots, ensuring accurate data representation.
- Updated the visualizer page to handle loading and error states for gallery items effectively.
- Enhanced the gallery API to include a method for fetching items by ID, improving data retrieval processes.
- Updated translations to include new error messages related to snapshot creation failures.

 src/app/[locale]/visualizer/page.tsx   | 84 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/components/gallery/GalleryPage.tsx | 47 +++++++++++++++++++++++++----------------
 src/components/gallery/galleryUrl.ts   |  5 +++--
 src/lib/gallery/galleryRepository.ts   | 21 +++++++++++++++++++
 src/lib/i18n/translations/en.json      |  3 ++-
 src/lib/i18n/translations/fr.json      |  3 ++-
 src/lib/i18n/translations/hi.json      |  3 ++-
 src/lib/visualizer/dataApiAdapter.ts   | 85 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 8 files changed, 225 insertions(+), 26 deletions(-)

### 2026-03-02 12:46 · `fa3ec21` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feat/subgroup_fix

### 2026-03-02 12:39 · `9e696bf` · refactor: update gallery API constants and enhance font size input handling

- Renamed GALLERY_PATH_PREFIX to GALLERY_PATH_SEGMENT for clarity and consistency in API URL construction.
- Updated GALLERY_BACKEND_BASE to use the new GALLERY_PATH_SEGMENT.
- Improved font size input handling in FontControls by introducing a dedicated handleSizeChange function and removing the Enter key handling logic for a more streamlined user experience.
- Adjusted minimum font size constants in TypographyTab to allow for smaller sizes.

 src/app/api/proxy/[...path]/route.ts        |  4 ++--
 src/components/visualizer/FontControls.tsx  | 23 +++++++++++------------
 src/components/visualizer/TypographyTab.tsx |  4 ++--
 src/lib/constants.ts                        | 11 +++--------
 src/lib/gallery/galleryApiClient.ts         |  6 +++---
 5 files changed, 21 insertions(+), 27 deletions(-)

### 2026-02-27 18:16 · `c8c4307` · refactor: update font family in VisualizationSettingsConstants

- Changed 'Helvetica' to 'Helvetica Neue' in the fontFamilies array to ensure better compatibility and modern appearance.

 src/components/visualizer/VisualizationSettingsConstants.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-02-27 17:45 · `d6fefd6` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feat/subgroup_fix

### 2026-02-27 17:45 · `cc3cc96` · refactor: update chart engine and types for improved functionality

- Refactored the engine.mjs file to enhance readability and maintainability, including renaming functions for clarity.
- Added a new optional 'stack' property to the LineBarAreaData interface to support stacked charts.
- Introduced a wrapLegendName function to handle long legend names, preventing overlap in chart displays.
- Updated type definitions and improved the handling of chart configurations for better performance and usability.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js            |  60 ++++-----
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 249 ++++++++++++++++++++----------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/bar.d.ts.map    |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts  |   9 ++
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/pie.d.ts.map    |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts                     |   1 +
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/bar.ts           |   1 +
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/cartesian.ts     |  61 ++++++++-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/pie.ts           |  10 +-
 packages/dfa-toolkit-comp-charts/src/engine/types.ts                        |   2 +-
 src/app/[locale]/visualize/embed/page.tsx                                   |  24 +++-
 src/app/[locale]/visualizer/page.tsx                                        | 163 ++++++++++++++++-------
 src/app/api/proxy/[...path]/route.ts                                        |  13 +-
 src/components/visualizer/DataTableTab.tsx                                  | 213 +++++++++++++++++++++++-------
 src/components/visualizer/EmbedChartView.tsx                                |  27 +++-
 src/components/visualizer/ShareModal.tsx                                    |   7 +-
 src/components/visualizer/TypographyTab.tsx                                 |   9 +-
 src/components/visualizer/VisualizationSettings.tsx                         |   2 +-
 src/components/visualizer/VisualizationTab.tsx                              | 141 +++++++++++++++++---
 src/lib/gallery/fetchPreviewData.ts                                         |   1 +
 src/lib/visualizer/chartExport/compositeImage.ts                            |  27 +++-
 src/lib/visualizer/chartExport/compositeSvg.ts                              |  42 +++++-
 src/lib/visualizer/chartExport/types.ts                                     |   6 +
 src/lib/visualizer/chartTransform.ts                                        |  49 ++++++-
 src/lib/visualizer/dataApiParams.ts                                         |  15 +--
 src/lib/visualizer/defaultChartConfig.ts                                    |  24 ++--
 src/lib/visualizer/embed/shareUrl.ts                                        |  75 +++++++++--
 src/lib/visualizer/embed/snapshot.ts                                        |   1 +
 src/lib/visualizer/types.ts                                                 |   8 ++
 tsconfig.tsbuildinfo                                                        |   2 +-
 34 files changed, 930 insertions(+), 324 deletions(-)

### 2026-02-27 08:27 · `59ea7a6` · refactor: enhance IndicatorSelect component for improved search functionality

- Updated the search handling logic to filter items based on user input more effectively.
- Simplified caching logic for fetched indicators, ensuring that search parameters are correctly applied.
- Improved state management for selected items to prevent unnecessary re-renders.
- Removed redundant checks and streamlined the code for better readability and performance.

 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js      | 507 +++++++++++++++++++-----------------
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js.map  |   2 +-
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs |   2 +-
 .../dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs.map  |   2 +-
 packages/dfa-toolkit-comp-indicator/src/IndicatorSelect.tsx                 |  88 +++++--
 src/components/IndicatorSelectionModal.tsx                                  |   1 -
 6 files changed, 336 insertions(+), 266 deletions(-)

### 2026-02-26 18:45 · `24fcb0f` · refactor: improve font size input handling in FontControls component

- Replaced useEffect with useState and useCallback for better state management and performance.
- Added focus and blur handlers to enhance user experience when interacting with the font size input.
- Implemented Enter key handling for committing size changes, improving input responsiveness.

 src/components/visualizer/FontControls.tsx | 60 ++++++++++++++++++++++++++++++++++++++++++------------------
 1 file changed, 42 insertions(+), 18 deletions(-)

### 2026-02-26 18:40 · `4b7a7e7` · refactor: optimize chart configuration and enhance input handling in VisualizationTab component

- Updated the useMemo dependency array for echartsChartConfig to focus on chart-relevant fields, reducing unnecessary re-renders.
- Added Enter key handling for title and description inputs to improve user experience when editing.
- Removed outdated instructions from the getting started section for clarity.

 src/components/visualizer/VisualizationTab.tsx | 46 ++++++++++++++++++++++++++++++++++++++++++++--
 1 file changed, 44 insertions(+), 2 deletions(-)

### 2026-02-26 15:54 · `5533cf1` · fix: update application title in Header component and constants

- Changed the header title from APP_NAME to APP_TITLE in Header component.
- Updated APP_CONFIG_DEFAULTS to set APP_TITLE to "Data NeTT Visualizer".

 src/components/Header.tsx | 2 +-
 src/lib/constants.ts      | 3 +--
 2 files changed, 2 insertions(+), 3 deletions(-)

### 2026-02-26 10:19 · `6aff500` · feat: enhance font handling and sharing functionality in visualizer components

- Added Inter font integration to the layout for improved typography.
- Updated font family stack to include system UI and sans-serif fallback.
- Introduced onShareModalClose callback to reset share trigger on modal close.
- Enhanced VisualizationTab component to utilize the new share modal close functionality.

 src/app/[locale]/visualizer/page.tsx           |  1 +
 src/app/layout.tsx                             | 11 +++++++++--
 src/components/visualizer/EmbedChartView.tsx   |  2 +-
 src/components/visualizer/VisualizationTab.tsx | 11 ++++++++---
 src/lib/visualizer/chartExport/fontUtils.ts    | 11 +++++++++--
 5 files changed, 28 insertions(+), 8 deletions(-)

### 2026-02-25 19:08 · `300a966` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/vizv2

### 2026-02-25 18:52 · `9e3c861` · fix: correct search API endpoint documentation for clarity

- Updated the search API endpoint example in the README to include an additional dot in the query parameter, enhancing clarity for users.

 README.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-02-25 18:49 · `25cdbb0` · refactor: update design tokens and API routes for improved functionality

- Replaced the "primary-light" color token with "tab-bg" in the Tailwind configuration for better clarity.
- Added "tab-bg" color definition in the design tokens CSS file.
- Updated API routes to streamline data fetching, including changes to the viz-state and proxy routes for enhanced performance.
- Removed deprecated API routes to clean up the codebase and improve maintainability.

 packages/design-tokens/tokens.css                                   |  32 +--
 packages/dfa-toolkit-comp-charts/dist/ChartRendererWrapper.d.ts.map |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.mjs                     |  60 +++--
 packages/dfa-toolkit-comp-charts/dist/index.mjs.map                 |   2 +-
 src/app/[locale]/gallery/page.tsx                                   |   7 +-
 src/app/[locale]/visualize/embed/page.tsx                           |   2 +-
 src/app/[locale]/visualizer/layout.tsx                              |   4 +-
 src/app/[locale]/visualizer/page.tsx                                |   8 +-
 src/app/api/areas/route.ts                                          | 155 -----------
 src/app/api/dw/[dwId]/[...path]/route.ts                            |  55 ----
 src/app/api/gallery/[id]/route.ts                                   |  89 -------
 src/app/api/gallery/route.ts                                        |  92 -------
 src/app/api/health/route.ts                                         |  12 -
 src/app/api/indicators/[identifier]/route.ts                        |  27 --
 src/app/api/options/[keyword]/route.ts                              |  52 ----
 src/app/api/proxy/[...path]/route.ts                                | 626 ++++++++++++++++++++++++++++++++++++++++++++
 src/app/api/subgroups/route.ts                                      |  33 ---
 src/app/api/time-periods/route.ts                                   |  30 ---
 src/app/api/viz-state/route.ts                                      |  81 ------
 src/app/globals.css                                                 |   5 -
 src/components/gallery/GalleryPage.tsx                              |   9 +-
 src/components/visualizer/AppearanceTab.tsx                         |   2 +-
 src/components/visualizer/BasicSettingsTab.tsx                      |   2 +-
 src/components/visualizer/FontControls.tsx                          |   2 +-
 src/components/visualizer/VisualizationSettings.tsx                 |   2 +-
 src/components/visualizer/VisualizationTab.tsx                      |  11 +-
 src/contexts/ThemeContext.tsx                                       |  60 -----
 src/lib/api/client.ts                                               |   2 +-
 src/lib/api/reference.ts                                            |  15 +-
 src/lib/appConfig/utils.ts                                          |  27 +-
 src/lib/constants.ts                                                |  25 +-
 src/middleware.ts                                                   |   2 +-
 tailwind.config.ts                                                  |   2 +-
 33 files changed, 734 insertions(+), 801 deletions(-)

### 2026-02-25 14:56 · `e5026e7` · refactor: update gallery repository to use backend API by default

- Changed the gallery repository to utilize ApiGalleryRepository as the default implementation.
- LocalGalleryRepository remains available for testing or fallback purposes.
- Updated documentation to reflect the new default behavior.

 src/lib/gallery/galleryRepository.ts | 8 +++-----
 1 file changed, 3 insertions(+), 5 deletions(-)

### 2026-02-25 14:33 · `2a887f7` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/vizv2

### 2026-02-25 11:48 · `7ac8477` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/vizv2

### 2026-02-25 11:43 · `4efc252` · feat: enhance visualizer and gallery components with time range handling

- Added a new utility to compute time ranges from selected time periods, improving data handling for visualizations.
- Updated the VisualizerPage to manage share URL hydration status and resolve selected component labels more effectively.
- Refactored time period handling in GalleryPage and gallery URL functions to ensure consistent behavior across components.
- Enhanced the VisualizationTab to include methods for retrieving current visualization settings and chart data.
- Introduced new properties in the GalleryItem interface for better tracking of chart types and data warehouse IDs during saves.

 src/app/[locale]/visualizer/page.tsx           | 299 ++++++++++++++++++++++++++++++++++++++++-------------------------
 src/components/gallery/GalleryPage.tsx         |  21 ++++-
 src/components/gallery/galleryUrl.ts           |  26 ++++--
 src/components/visualizer/VisualizationTab.tsx |  43 ++++++++--
 src/lib/gallery/types.ts                       |   4 +
 src/lib/visualizer/dataApiAdapter.ts           |   2 +-
 src/lib/visualizer/timeRangeFromSelection.ts   |  62 ++++++++++++++
 7 files changed, 326 insertions(+), 131 deletions(-)

### 2026-02-25 09:55 · `6a92689` · feat: refactor data API parameter handling and enhance gallery functionality

- Introduced a shared Data API parameter builder to unify the construction of query parameters across the visualizer and gallery components.
- Updated the VisualizerPage to utilize the new shared builder for improved consistency in API requests.
- Enhanced the GalleryPage to open visualizations in a new tab, improving user experience.
- Refactored item-to-data API parameter conversion to support selected components and filters more effectively.
- Improved handling of time periods and indicators in the export functionality, ensuring accurate data fetching and exports.

 src/app/[locale]/visualizer/page.tsx   |  95 ++++++++++++++----------------------------------------------------
 src/components/gallery/GalleryPage.tsx | 104 +++++++++++++++++++++++++++++++++++++++++++++++++++----------------------
 src/components/gallery/galleryUrl.ts   |  17 ++++++++++--
 src/lib/gallery/exportFromItem.ts      |  83 +++++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/lib/gallery/fetchPreviewData.ts    |  18 ++++++-------
 src/lib/visualizer/dataApiParams.ts    | 103 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 293 insertions(+), 127 deletions(-)

### 2026-02-24 17:19 · `26d7ed1` · feat: enhance styling and theming with design tokens

- Introduced a token-driven styling architecture, centralizing theme management through CSS custom properties.
- Updated Tailwind configuration to map design tokens for consistent theming across components.
- Enhanced various components to utilize design tokens for colors, borders, and backgrounds, ensuring a cohesive UI.
- Added new gradient styles and improved error handling visuals in the ChartRendererWrapper.
- Implemented a new API route for gallery functionality, enabling seamless data fetching and interaction with the backend.
- Updated multiple components to reflect the new theming approach, improving maintainability and user experience.

 README.md                                                     |  10 +++
 packages/design-tokens/tokens.css                             |  27 +++++++
 packages/dfa-toolkit-comp-charts/src/ChartRendererWrapper.tsx |   6 +-
 src/app/[locale]/signin/page.tsx                              |   6 +-
 src/app/[locale]/visualizer/page.tsx                          | 190 +++++++++++++++++++++++---------------------------
 src/app/api/gallery/[id]/route.ts                             |  89 +++++++++++++++++++++++
 src/app/api/gallery/route.ts                                  |  92 ++++++++++++++++++++++++
 src/app/globals.css                                           |  10 ++-
 src/components/Header.tsx                                     |   2 +-
 src/components/SelectionModal.tsx                             |   2 +-
 src/components/VendorChipSearch.tsx                           |  27 ++++---
 src/components/gallery/GalleryPage.tsx                        | 158 ++++++++++++-----------------------------
 src/components/visualizer/AppearanceTab.tsx                   | 110 ++++++++++++-----------------
 src/components/visualizer/BasicSettingsTab.tsx                | 139 ++++++++++++++++++------------------
 src/components/visualizer/DataTableTab.tsx                    |  28 ++++----
 src/components/visualizer/EmbedChartView.tsx                  |  17 +++--
 src/components/visualizer/FontControls.tsx                    |  41 ++++++-----
 src/components/visualizer/MetadataTab.tsx                     |   8 ++-
 src/components/visualizer/ShareModal.tsx                      |  50 ++++++-------
 src/components/visualizer/VisualizationSettings.tsx           |  38 +++++-----
 src/components/visualizer/VisualizationTab.tsx                | 173 +++++++++++++++++++--------------------------
 src/contexts/CoreContext.tsx                                  |   7 +-
 src/contexts/ThemeContext.tsx                                 |  83 ----------------------
 src/lib/api/client.ts                                         |  89 +++++++++++++++++++++--
 src/lib/constants.ts                                          |  20 +++---
 src/lib/gallery/galleryApiClient.ts                           | 154 ++++++++++++++++++++++++++++++++++++++++
 src/lib/gallery/galleryRepository.ts                          |  71 ++++++++++++++++++-
 src/lib/i18n/translations/en.json                             |  65 +++++++++++++++++
 src/lib/i18n/translations/fr.json                             |  65 +++++++++++++++++
 src/lib/i18n/translations/hi.json                             |  65 +++++++++++++++++
 src/lib/i18n/translations/index.ts                            |  24 +++++++
 tailwind.config.ts                                            |   1 +
 32 files changed, 1195 insertions(+), 672 deletions(-)

### 2026-02-24 12:43 · `5e3a62f` · feat: enhance sharing functionality in ShareModal

- Updated handleShare function to accept a specific URL for sharing, ensuring consistency between copied URL and shared links.
- Improved sharing links for WhatsApp, LinkedIn, Gmail, and Facebook to include introductory text and handle encoding properly.
- Adjusted button click handlers to pass the shareUrl directly for each platform, enhancing user experience and functionality.

 src/components/visualizer/ShareModal.tsx | 27 ++++++++++++++-------------
 1 file changed, 14 insertions(+), 13 deletions(-)

### 2026-02-24 11:32 · `0ac9b32` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/vizv2

### 2026-02-24 11:06 · `5ace422` · feat: add embed functionality for standalone visualizations

- Updated build script to include a new configuration for creating a standalone embed bundle.
- Introduced a new entry point for the embed bundle, exposing the createDfaChart function on the global window object.
- Added TypeScript definitions for the embed functionality to enhance type safety and integration.
- Removed deprecated embedLoader files to streamline the codebase and improve maintainability.

 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js     | 50 ++++++++++++++++++++++----------------------
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map |  2 +-
 packages/dfa-toolkit-comp-charts/dist/embedEntry.d.ts                |  9 ++++++++
 packages/dfa-toolkit-comp-charts/dist/embedEntry.d.ts.map            |  1 +
 packages/dfa-toolkit-comp-charts/dist/embedLoader.d.ts               |  6 ------
 packages/dfa-toolkit-comp-charts/dist/embedLoader.d.ts.map           |  1 -
 packages/dfa-toolkit-comp-charts/package.json                        |  2 +-
 packages/dfa-toolkit-comp-charts/src/embedEntry.ts                   | 16 ++++++++++++++
 packages/dfa-toolkit-comp-charts/vite.embed.config.ts                | 28 +++++++++++++++++++++++++
 9 files changed, 81 insertions(+), 34 deletions(-)

### 2026-02-24 10:46 · `508c17a` · feat: enhance gallery functionality and data handling

- Introduced a new GalleryPage component to manage and display gallery items, integrating theme context and routing.
- Implemented data fetching for gallery items, including real-time previews and export capabilities for selected items.
- Added functionality to bookmark visualizations, syncing with a gallery repository for persistent state management.
- Enhanced the visualizer page to support dynamic updates based on user interactions and gallery selections.
- Updated various components to improve data handling and user experience, including better integration with the Data API for fetching item previews and exports.

 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 128 ++++----
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |   2 +-
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts                     |   7 +
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/cartesian.ts     |   8 +
 packages/dfa-toolkit-comp-charts/src/engine/types.ts                        |   2 +
 src/app/[locale]/gallery/page.tsx                                           |  18 +-
 src/app/[locale]/visualizer/page.tsx                                        |  56 ++--
 src/components/gallery/GalleryPage.tsx                                      | 624 ++++++++++++++++++++++++++++++++++++
 src/components/gallery/galleryUrl.ts                                        |  73 +++++
 src/components/visualizer/VisualizationTab.tsx                              |  44 +--
 src/lib/gallery/exportFromItem.ts                                           | 117 +++++++
 src/lib/gallery/fetchPreviewData.ts                                         |  69 ++++
 src/lib/gallery/galleryRepository.ts                                        |  87 +++++
 src/lib/gallery/types.ts                                                    |  40 +++
 16 files changed, 1159 insertions(+), 120 deletions(-)

### 2026-02-19 11:50 · `e06b461` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/vizv2

### 2026-02-18 14:15 · `195170b` · feat: implement share state encoding and decoding for visualizations

- Added support for encoding and decoding visualization state in URLs using the s= parameter, enhancing the sharing functionality.
- Updated EmbedPage and VisualizerPage components to handle the new s= parameter for improved state management.
- Modified ShareModal to generate share URLs with the encoded state, replacing the previous p= parameter for edited charts.
- Enhanced error handling for missing or invalid share parameters, ensuring better user feedback and experience.

 src/app/[locale]/visualize/embed/page.tsx | 23 ++++++++++++++++++++---
 src/app/[locale]/visualizer/page.tsx      | 27 ++++++++++++++++++++++-----
 src/components/visualizer/ShareModal.tsx  | 34 ++++++++++++----------------------
 src/lib/visualizer/embed/shareUrl.ts      | 67 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 4 files changed, 120 insertions(+), 31 deletions(-)

### 2026-02-17 19:48 · `fcf28ca` · feat: add embed functionality for visualizations and enhance build process

- Introduced a new build script for embedding visualizations, creating the necessary output files in the public/embed directory.
- Added a new embed configuration file for Vite to facilitate the building of the embed runtime.
- Implemented a live embed preview page to allow users to test iframe integration with visualizations.
- Updated the layout to use a conditional header for improved user experience based on locale.
- Enhanced the visualizer routing to support both standard and embed-specific URLs, ensuring seamless navigation and data fetching.

 package.json                                                         |   4 +-
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js     |  75 +++++++++++++
 packages/dfa-toolkit-comp-charts/dist/embed/dfa-viz-embed.min.js.map |   1 +
 packages/dfa-toolkit-comp-charts/dist/embedLoader.d.ts               |   6 ++
 packages/dfa-toolkit-comp-charts/dist/embedLoader.d.ts.map           |   1 +
 public/embed-example.html                                            |  76 +++++++++++++
 public/embed/dfa-viz-embed.min.js                                    | 124 ++++++++++++++++++++++
 public/embed/dfa-viz-embed.min.js.map                                |   1 +
 public/embed/robot.txt                                               |   0
 src/app/[locale]/layout.tsx                                          |   4 +-
 src/app/[locale]/visualize/embed/page.tsx                            | 125 ++++++++++++++++++++++
 src/app/[locale]/visualize/page.tsx                                  |  27 +++++
 src/app/[locale]/visualizer/page.tsx                                 | 143 ++++++++++++++++++++++---
 src/app/api/viz-state/route.ts                                       |  81 ++++++++++++++
 src/app/api/viz-state/store.ts                                       |  41 +++++++
 src/components/ConditionalHeader.tsx                                 |  17 +++
 src/components/visualizer/EmbedChartView.tsx                         | 154 +++++++++++++++++++++++++++
 src/components/visualizer/ShareModal.tsx                             | 247 +++++++++++++++++++++++++++----------------
 src/components/visualizer/VisualizationTab.tsx                       |  71 ++++++++++---
 src/embed/embedLoader.ts                                             |  55 ++++++++++
 src/lib/constants.ts                                                 |   2 +-
 src/lib/visualizer/colorThemes.ts                                    |   3 +
 src/lib/visualizer/embed/shareUrl.ts                                 | 181 +++++++++++++++++++++++++++++++
 src/lib/visualizer/embed/snapshot.ts                                 | 185 ++++++++++++++++++++++++++++++++
 src/lib/visualizer/urlParamsAdapter.ts                               |  58 ++++++++++
 vite.embed.config.ts                                                 |  26 +++++
 26 files changed, 1583 insertions(+), 125 deletions(-)

### 2026-02-16 20:03 · `7fa4eb7` · refactor: update fetchIndicatorsByClassification function for improved API endpoint and clarity

- Revised the fetchIndicatorsByClassification function to use a new API endpoint format, linking indicators to classifications via ic_identifier.
- Enhanced documentation to clarify the usage of ic_identifier, distinguishing between numeric and non-numeric identifiers.
- Adjusted the search parameters to ensure proper handling of pagination and sorting, improving overall API interaction.

 src/lib/api/referenceClient.ts | 16 +++++-----------
 1 file changed, 5 insertions(+), 11 deletions(-)

### 2026-02-16 19:10 · `e6e3660` · refactor: rename chart option builder functions and enhance SVG export handling

- Renamed several chart option builder functions for improved clarity and consistency, including changing `P` to `v`, `_` to `P`, and `c` to `_`.
- Updated the `init` function to specify the SVG renderer for chart initialization, enhancing rendering capabilities.
- Improved the SVG export functionality by refining the handling of SVG data URLs and ensuring proper dimensions are set for embedded SVGs.
- Adjusted the export logic in the `VisualizationTab` to differentiate between SVG and PNG formats, enhancing user experience during chart exports.

 packages/dfa-toolkit-comp-charts/dist/engine.mjs     | 26 +++++++++++++-------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map |  2 +-
 packages/dfa-toolkit-comp-charts/src/engine/index.ts |  2 +-
 src/components/visualizer/VisualizationTab.tsx       |  9 +++++----
 src/lib/visualizer/chartExport/compositeSvg.ts       | 47 ++++++++++++++++++++++++++++-------------------
 5 files changed, 48 insertions(+), 38 deletions(-)

### 2026-02-16 16:51 · `b5e4042` · feat: add chart image export functionality to VisualizerTab

- Implemented export options for SVG, PNG, and JPG formats in the VisualizationTab component.
- Introduced a ref to trigger chart image exports, enhancing user interaction with the export menu.
- Created utility functions for generating composite images and SVGs with titles and descriptions, improving the export experience.
- Updated related components and types to support the new export features, ensuring seamless integration with existing functionality.

 src/app/[locale]/visualizer/page.tsx             |  23 +++++--
 src/components/visualizer/VisualizationTab.tsx   |  92 +++++++++++++++++++++++-----
 src/lib/visualizer/chartExport/compositeImage.ts | 130 +++++++++++++++++++++++++++++++++++++++
 src/lib/visualizer/chartExport/compositeSvg.ts   | 207 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/visualizer/chartExport/fontUtils.ts      |  49 +++++++++++++++
 src/lib/visualizer/chartExport/index.ts          |  18 ++++++
 src/lib/visualizer/chartExport/types.ts          |  37 ++++++++++++
 tsconfig.tsbuildinfo                             |   2 +-
 8 files changed, 538 insertions(+), 20 deletions(-)

### 2026-02-16 16:19 · `62fbb33` · refactor: enhance IndicatorSelect component with classification options fetching

- Added support for fetching sector, goal, and theme classification options from an API, improving flexibility in data selection.
- Introduced new `ClassificationOption` type for better type safety and clarity in the component's props.
- Updated the `IndicatorSelect` component to utilize fetched classification options, allowing for dynamic dropdowns based on API data.
- Refactored related logic to ensure smooth integration of new features while maintaining existing functionality.

 packages/dfa-toolkit-comp-indicator/dist/IndicatorSelect.d.ts               |   8 +-
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js      | 387 +++++++++++++++++++-----------------
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js.map  |   2 +-
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs |   2 +-
 .../dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs.map  |   2 +-
 packages/dfa-toolkit-comp-indicator/dist/index.d.ts                         |   2 +-
 packages/dfa-toolkit-comp-indicator/src/IndicatorSelect.tsx                 |  66 +++++-
 packages/dfa-toolkit-comp-indicator/src/index.ts                            |   1 +
 src/app/[locale]/visualizer/page.tsx                                        |  87 +++++---
 src/components/IndicatorSelectionModal.tsx                                  |   4 +
 src/components/TileComponent.tsx                                            |   5 +-
 src/lib/api/referenceClient.ts                                              |  81 +++++++-
 src/lib/constants.ts                                                        |  16 ++
 13 files changed, 444 insertions(+), 219 deletions(-)

### 2026-02-16 11:18 · `9540cda` · refactor: remove locale from DataApiParams and update related logic

- Eliminated the locale parameter from DataApiParams, clarifying its usage as only relevant for the Accept-Language header.
- Adjusted the buildSearchParams function to no longer append locale to the search parameters.
- Updated the fetchDataApi function to simplify language handling, ensuring it defaults to acceptLanguage or the locale when necessary.

 src/app/[locale]/visualizer/page.tsx | 3 +--
 src/lib/api/data.ts                  | 6 ++----
 2 files changed, 3 insertions(+), 6 deletions(-)

### 2026-02-16 00:56 · `8323856` · refactor: enhance chart grid and legend configuration

- Introduced constants for legend scroll thresholds and dimensions to improve layout management.
- Updated grid and legend builders to dynamically adjust based on the number of series, ensuring better handling of overflow scenarios.
- Refactored area, bar, line, and pie chart option builders to utilize the new grid and legend configurations, enhancing consistency across chart types.
- Improved data label handling and formatting for better customization in visualizations.

 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 293 ++++++++++++++++++------------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/index.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/area.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/bar.d.ts.map    |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts  |  12 +-
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/line.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/pie.d.ts.map    |   2 +-
 packages/dfa-toolkit-comp-charts/src/engine/index.ts                        |   3 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/area.ts          |   5 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/bar.ts           |   5 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/cartesian.ts     |  98 +++++++++---
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/line.ts          |   5 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/pie.ts           |  64 ++++++--
 15 files changed, 299 insertions(+), 200 deletions(-)

### 2026-02-15 23:48 · `3ce65b5` · refactor: simplify DataTableTab component by removing export functionality

- Removed the export menu and related state management from the DataTableTab component.
- Streamlined data handling logic by adjusting dependencies in the useMemo hook.
- Updated the component structure to enhance readability and maintainability.

 src/components/visualizer/DataTableTab.tsx | 70 ++++++++--------------------------------------------------------------
 1 file changed, 8 insertions(+), 62 deletions(-)

### 2026-02-15 23:47 · `e353c3e` · feat: implement data export functionality in visualizer components

- Added export options for CSV, JSON, and XLSX formats in the VisualizerPage and DataTableTab components.
- Introduced utility functions for building export payloads and generating filenames based on indicator data and time ranges.
- Enhanced data handling to ensure accurate representation of time periods and subgroups in exported files.
- Updated the data API adapter to support parsing of time period strings for better sorting and display in visualizations.

 package-lock.json                                      | 127 ++++++++++++++++++++++++++++------
 package.json                                           |   3 +-
 packages/dfa-toolkit-comp-search/dist/index.mjs.map    |   2 +-
 packages/dfa-toolkit-comp-search/dist/index.umd.js.map |   2 +-
 src/app/[locale]/visualizer/page.tsx                   |  45 +++++++++---
 src/components/visualizer/DataTableTab.tsx             | 211 +++++++++++++++++++++------------------------------------
 src/components/visualizer/VisualizationTab.tsx         |  66 ++++++++----------
 src/lib/visualizer/dataApiAdapter.ts                   |  15 +++-
 src/lib/visualizer/export/buildPayload.ts              | 128 ++++++++++++++++++++++++++++++++++
 src/lib/visualizer/export/downloadCsv.ts               |  44 ++++++++++++
 src/lib/visualizer/export/downloadJson.ts              |  28 ++++++++
 src/lib/visualizer/export/downloadUtils.ts             |  12 ++++
 src/lib/visualizer/export/downloadXlsx.ts              |  39 +++++++++++
 src/lib/visualizer/export/index.ts                     |   5 ++
 src/lib/visualizer/export/types.ts                     |  30 ++++++++
 src/lib/visualizer/types.ts                            |   4 ++
 16 files changed, 555 insertions(+), 206 deletions(-)

### 2026-02-15 21:55 · `b416a84` · refactor: enhance axis configuration and data label formatting

- Updated the split line configuration for both x and y axes to improve visibility with enhanced styling options.
- Refactored data label handling in chart option builders to ensure consistent formatting and visibility settings across different chart types.
- Improved the overall structure of axis and label configurations for better maintainability and customization in chart presentations.

 packages/dfa-toolkit-comp-charts/dist/engine.mjs                        | 62 ++++++++++++++++++++---------------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                    |  2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/cartesian.ts |  4 +--
 3 files changed, 34 insertions(+), 34 deletions(-)

### 2026-02-15 21:48 · `ba4b3ed` · refactor: enhance chart data label configuration and formatting

- Introduced new data label options in ChartConfig for better customization, including position, visibility, and number formatting.
- Implemented utility functions for formatting label values and building data label configurations, improving code reusability.
- Updated area and bar chart option builders to utilize the new data label configurations, ensuring consistent label display across chart types.
- Adjusted visualization settings to reflect the new data label options, enhancing user control over chart presentations.

 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 377 +++++++++++++++++++-----------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/area.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/bar.d.ts.map    |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/labelUtils.d.ts |  20 ++
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/labelUtils.d.ts.map  |   1 +
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/line.d.ts.map   |   2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts                     |   4 +
 packages/dfa-toolkit-comp-charts/dist/engine/types.d.ts.map                 |   2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/area.ts          |  13 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/bar.ts           |  14 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/labelUtils.ts    |  86 ++++++++
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/line.ts          |  14 +-
 packages/dfa-toolkit-comp-charts/src/engine/types.ts                        |   4 +
 src/lib/visualizer/chartTransform.ts                                        |   3 +
 src/lib/visualizer/types.ts                                                 |   2 +-
 16 files changed, 340 insertions(+), 208 deletions(-)

### 2026-02-15 21:30 · `6fa471a` · refactor: update data point calculation and chart title synchronization

- Modified the area default in filters to an empty array for improved flexibility.
- Changed data point count calculation to reflect actual API response data instead of filter cardinalities.
- Centralized chart title logic to ensure it accurately reflects the selected indicator and area, enhancing consistency in the visualization settings.
- Updated effect dependencies to synchronize visualization settings with changes in filters and API response.

 src/app/[locale]/visualizer/page.tsx           |  9 +++------
 src/components/visualizer/VisualizationTab.tsx | 53 ++++++++++++++++++++++++++++++++++++-----------------
 2 files changed, 39 insertions(+), 23 deletions(-)

### 2026-02-15 21:10 · `68f6f66` · refactor: improve chart configuration and visualization layout

- Renamed functions for clarity and consistency in the chart option builders.
- Added visibility settings for axes in pie and cartesian chart options.
- Enhanced layout and styling in the VisualizerPage for better user experience, including adjustments to button and tooltip handlers.
- Updated data handling in chart options to ensure proper display of categories and values.

 packages/dfa-toolkit-comp-charts/dist/engine.mjs                            | 42 ++++++++++++++++-------------
 packages/dfa-toolkit-comp-charts/dist/engine.mjs.map                        |  2 +-
 .../dfa-toolkit-comp-charts/dist/engine/optionBuilders/cartesian.d.ts.map   |  2 +-
 packages/dfa-toolkit-comp-charts/dist/engine/optionBuilders/pie.d.ts.map    |  2 +-
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/cartesian.ts     |  4 +++
 packages/dfa-toolkit-comp-charts/src/engine/optionBuilders/pie.ts           |  2 ++
 src/app/[locale]/visualizer/page.tsx                                        | 54 ++++++++++++++++++++-----------------
 7 files changed, 62 insertions(+), 46 deletions(-)

### 2026-02-15 20:38 · `0918b15` · refactor: centralize API query parameters with API_QUERY_DEFAULTS

- Introduced API_QUERY_DEFAULTS to standardize default query parameters for Data API and Indicator API across the application.
- Updated VisualizerPage and API routes to utilize the new defaults, improving maintainability and consistency in API calls.
- Enhanced button styles and layout in the VisualizerPage for better user experience.

 src/app/[locale]/visualizer/page.tsx   |  6 ++----
 src/app/api/options/[keyword]/route.ts |  6 ++----
 src/lib/api/data.ts                    |  9 ++++++---
 src/lib/api/reference.ts               | 14 ++++++++------
 src/lib/api/referenceClient.ts         | 11 +++++++++--
 src/lib/constants.ts                   | 20 ++++++++++++++++++++
 6 files changed, 47 insertions(+), 19 deletions(-)

### 2026-02-13 18:53 · `c18259e` · Merge branches 'feature/vizv2' and 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/vizv2

### 2026-02-13 18:52 · `10f40ad` · feat: add animated loader component and enhance visualization settings functionality

- Introduced a new Loader component for displaying loading animations.
- Updated VisualizationTab to include a button for editing visualization settings, with state management for opening and closing the settings panel.
- Refactored data API parameters to support new subgroup fields and improved handling of loading states in the visualizer.
- Enhanced CSS with loader styles for a better user experience during data loading.

 src/app/[locale]/visualizer/page.tsx           | 63 ++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/app/globals.css                            | 38 ++++++++++++++++++++++++++++++++++++++
 src/components/Loader.tsx                      | 34 ++++++++++++++++++++++++++++++++++
 src/components/visualizer/VisualizationTab.tsx | 32 +++++++++++---------------------
 src/lib/api/data.ts                            | 41 +++++++++++++++++++++++++++--------------
 src/lib/visualizer/dataApiAdapter.ts           | 45 ++++++++++++++++++++++++++++++++++++---------
 6 files changed, 200 insertions(+), 53 deletions(-)

### 2026-02-13 17:52 · `ff40a4b` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/vizv2

### 2026-02-13 17:52 · `4d8beb0` · Update environment configuration, enhance API routing, and refactor data fetching methods. Added type definitions for CSS and removed unused mock data files.

 .env.example                                    |   5 +-
 packages/dfa-toolkit-comp-search/package.json   |   4 +-
 packages/dfa-toolkit-comp-search/style.css.d.ts |   1 +
 src/app/[locale]/visualizer/page.tsx            |  61 ++++-----
 src/components/SubgroupSelectionModal.tsx       |  27 ++--
 src/components/TimePeriodSelectionModal.tsx     |  27 ++--
 src/components/VendorChipSearch.tsx             |   1 -
 src/components/visualizer/DataTableTab.tsx      |  11 +-
 src/components/visualizer/FontControls.tsx      |  36 +++++-
 src/components/visualizer/MetadataTab.tsx       |   9 +-
 src/components/visualizer/TypographyTab.tsx     |  13 ++
 src/dfa-toolkit-comp-search.d.ts                |  37 ------
 src/dummy_data/SearchComponentMockData.json     |  77 ------------
 src/dummy_data/visualizerMockData.ts            | 441 ----------------------------------------------------------------
 src/lib/api/client.ts                           | 117 +++++++++++++++++
 src/lib/api/data.ts                             |  53 ++++----
 src/lib/api/referenceClient.ts                  |  38 ++----
 src/lib/constants.ts                            |  22 ++++
 src/lib/visualizer/optionsCache.ts              |  27 ++--
 src/lib/visualizer/sessionAdapter.ts            |   2 +-
 src/lib/visualizer/types.ts                     |  11 ++
 21 files changed, 313 insertions(+), 707 deletions(-)

### 2026-02-10 12:26 · `56574ef` · public folder

 public/robot.txt | 0
 1 file changed, 0 insertions(+), 0 deletions(-)

### 2026-02-09 18:10 · `24ac297` · refactor: remove unused import in VisualizationTab component

- Removed the unused import of 'dfa-toolkit-comp-charts/styles' from the VisualizationTab component to clean up the code and improve maintainability.

 src/components/visualizer/VisualizationTab.tsx | 1 -
 1 file changed, 1 deletion(-)

### 2026-02-09 18:04 · `69f4bc8` · feat: add nid property to AreaItem type and update AreaSelect component

- Introduced a new optional property `nid` of type number to the `AreaItem` type for enhanced data representation.
- Updated the AreaSelect component to handle the new `nid` property, ensuring compatibility with existing functionality.
- Refactored related functions to accommodate the changes in data structure, improving overall type safety and usability.

 packages/dfa-toolkit-comp-area/dist/AreaSelect.d.ts                         |   1 +
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.js                | 367 +++++++++++++++++++-----------------
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.js.map            |   2 +-
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.umd.cjs           |   2 +-
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.umd.cjs.map       |   2 +-
 packages/dfa-toolkit-comp-charts/dist/index.d.ts.map                        |   2 +-
 .../dfa-toolkit-comp-charts/dist/{styles/chart-container.css => styles.css} |   0
 packages/dfa-toolkit-comp-charts/package.json                               |   2 +-
 packages/dfa-toolkit-comp-charts/src/index.ts                               |   2 +-
 .../dfa-toolkit-comp-charts/src/{styles/chart-container.css => styles.css}  |   0
 packages/dfa-toolkit-comp-charts/vite.config.ts                             |   2 +-
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js      | 316 ++++++++++++++++---------------
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js.map  |   2 +-
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs |   2 +-
 .../dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs.map  |   2 +-
 packages/dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.js        | 182 +++++++++---------
 packages/dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.js.map    |   2 +-
 packages/dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.umd.cjs   |   2 +-
 .../dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.umd.cjs.map    |   2 +-
 packages/dfa-toolkit-comp-time-period/dist/dfa-toolkit-comp-time-period.js  | 156 +++++++--------
 .../dfa-toolkit-comp-time-period/dist/dfa-toolkit-comp-time-period.js.map   |   2 +-
 .../dfa-toolkit-comp-time-period/dist/dfa-toolkit-comp-time-period.umd.cjs  |   2 +-
 .../dist/dfa-toolkit-comp-time-period.umd.cjs.map                           |   2 +-
 23 files changed, 555 insertions(+), 499 deletions(-)

### 2026-02-09 17:58 · `9a535e7` · feat: enhance visualization settings handling in VisualizerPage

- Added a mechanism to ignore stale state changes when opening the visualization settings panel, improving user experience.
- Introduced a reference to manage the state of the drawer and visualization settings more effectively.
- Updated the logic for handling tab changes to prevent unintended drawer closure when settings are opened.

 src/app/[locale]/visualizer/page.tsx | 11 ++++++++++-
 1 file changed, 10 insertions(+), 1 deletion(-)

### 2026-02-09 17:00 · `499eb56` · feat: implement AreaSelect component with enhanced type definitions and API

- Introduced the AreaSelect component for selecting areas with a tree view interface.
- Added type definitions for AreaItem, AreaSelectApi, and AreaSelectProps to improve TypeScript support.
- Implemented fetch methods for loading area data, including support for fetching roots and children.
- Enhanced the component with loading states and error handling for better user experience.
- Updated styles for the component to ensure a consistent look and feel.

 packages/dfa-toolkit-comp-area/.gitignore                                   |   4 +-
 packages/dfa-toolkit-comp-area/dist/AreaSelect.d.ts                         |  46 +++++
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.js                | 280 +++++++++++++++++++++++++++++
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.js.map            |   1 +
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.umd.cjs           |   2 +
 packages/dfa-toolkit-comp-area/dist/dfa-toolkit-comp-area.umd.cjs.map       |   1 +
 packages/dfa-toolkit-comp-area/dist/index.d.ts                              |   2 +
 packages/dfa-toolkit-comp-area/dist/styles.css                              |   1 +
 packages/dfa-toolkit-comp-area/src/AreaSelect.tsx                           | 157 +++++++++++++---
 packages/dfa-toolkit-comp-area/src/index.ts                                 |   1 +
 packages/dfa-toolkit-comp-charts/.gitignore                                 |  26 +++
 packages/dfa-toolkit-comp-indicator/.gitignore                              |   4 +-
 packages/dfa-toolkit-comp-indicator/dist/IndicatorSelect.d.ts               |  40 +++++
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js      | 344 ++++++++++++++++++++++++++++++++++++
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.js.map  |   1 +
 packages/dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs |   2 +
 .../dfa-toolkit-comp-indicator/dist/dfa-toolkit-comp-indicator.umd.cjs.map  |   1 +
 packages/dfa-toolkit-comp-indicator/dist/index.d.ts                         |   1 +
 packages/dfa-toolkit-comp-indicator/dist/mock/indicatorData.d.ts            |  31 ++++
 packages/dfa-toolkit-comp-indicator/dist/styles.css                         |   1 +
 packages/dfa-toolkit-comp-indicator/src/IndicatorSelect.tsx                 | 115 ++++++++++--
 packages/dfa-toolkit-comp-indicator/src/index.ts                            |   1 +
 packages/dfa-toolkit-comp-list-view/.gitignore                              |   4 +-
 packages/dfa-toolkit-comp-list-view/dist/ListView.d.ts                      |  17 ++
 packages/dfa-toolkit-comp-list-view/dist/dfa-toolkit-comp-list-view.js      |  84 +++++++++
 packages/dfa-toolkit-comp-list-view/dist/dfa-toolkit-comp-list-view.js.map  |   1 +
 packages/dfa-toolkit-comp-list-view/dist/dfa-toolkit-comp-list-view.umd.cjs |   2 +
 .../dfa-toolkit-comp-list-view/dist/dfa-toolkit-comp-list-view.umd.cjs.map  |   1 +
 packages/dfa-toolkit-comp-list-view/dist/index.d.ts                         |   1 +
 packages/dfa-toolkit-comp-list-view/dist/styles.css                         |   1 +
 packages/dfa-toolkit-comp-search/.gitignore                                 |  26 +++
 packages/dfa-toolkit-comp-subgroup/.gitignore                               |   4 +-
 packages/dfa-toolkit-comp-subgroup/dist/SubgroupSelect.d.ts                 |  29 +++
 packages/dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.js        | 166 +++++++++++++++++
 packages/dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.js.map    |   1 +
 packages/dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.umd.cjs   |   2 +
 .../dfa-toolkit-comp-subgroup/dist/dfa-toolkit-comp-subgroup.umd.cjs.map    |   1 +
 packages/dfa-toolkit-comp-subgroup/dist/index.d.ts                          |   1 +
 packages/dfa-toolkit-comp-subgroup/dist/mock/subgroupData.d.ts              |   5 +
 packages/dfa-toolkit-comp-subgroup/dist/styles.css                          |   1 +
 packages/dfa-toolkit-comp-subgroup/src/SubgroupSelect.tsx                   |  30 +++-
 packages/dfa-toolkit-comp-time-period/.gitignore                            |   4 +-
 packages/dfa-toolkit-comp-time-period/dist/TimePeriodSelect.d.ts            |  31 ++++
 packages/dfa-toolkit-comp-time-period/dist/dfa-toolkit-comp-time-period.js  | 156 ++++++++++++++++
 .../dfa-toolkit-comp-time-period/dist/dfa-toolkit-comp-time-period.js.map   |   1 +
 .../dfa-toolkit-comp-time-period/dist/dfa-toolkit-comp-time-period.umd.cjs  |   2 +
 .../dist/dfa-toolkit-comp-time-period.umd.cjs.map                           |   1 +
 packages/dfa-toolkit-comp-time-period/dist/index.d.ts                       |   1 +
 packages/dfa-toolkit-comp-time-period/dist/mock/timePeriodData.d.ts         |   5 +
 packages/dfa-toolkit-comp-time-period/dist/styles.css                       |   1 +
 packages/dfa-toolkit-comp-time-period/src/TimePeriodSelect.tsx              |   9 +-
 packages/dfa-toolkit-comp-tree-view/.gitignore                              |   4 +-
 packages/dfa-toolkit-comp-tree-view/dist/TreeView.d.ts                      |  26 +++
 packages/dfa-toolkit-comp-tree-view/dist/dfa-toolkit-comp-tree-view.js      | 198 +++++++++++++++++++++
 packages/dfa-toolkit-comp-tree-view/dist/dfa-toolkit-comp-tree-view.js.map  |   1 +
 packages/dfa-toolkit-comp-tree-view/dist/dfa-toolkit-comp-tree-view.umd.cjs |   2 +
 .../dfa-toolkit-comp-tree-view/dist/dfa-toolkit-comp-tree-view.umd.cjs.map  |   1 +
 packages/dfa-toolkit-comp-tree-view/dist/index.d.ts                         |   1 +
 packages/dfa-toolkit-comp-tree-view/dist/styles.css                         |   1 +
 src/app/[locale]/visualizer/page.tsx                                        | 166 +++++++++++------
 src/app/api/dw/[dwId]/[...path]/route.ts                                    |  55 ++++++
 src/components/AreaSelectionModal.tsx                                       |  15 +-
 src/components/IndicatorSelectionModal.tsx                                  |   7 +-
 src/lib/api/data.ts                                                         |  27 ++-
 src/lib/api/referenceClient.ts                                              | 247 ++++++++++++++++++++++++++
 src/lib/constants.ts                                                        |  12 ++
 src/lib/visualizer/optionsCache.ts                                          |  79 +++++++++
 src/lib/visualizer/types.ts                                                 |   4 +-
 68 files changed, 2382 insertions(+), 114 deletions(-)

### 2026-02-09 12:31 · `54b2cc4` · fix: update entry points in dfa-toolkit-comp-search package for module compatibility

- Changed main and module entry points in package.json to use .mjs and .umd.js extensions.
- Updated exports to reflect the new entry points for better compatibility with module systems.

 packages/dfa-toolkit-comp-search/package.json | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)

### 2026-02-09 12:25 · `9af0517` · feat: refactor dfa-chart-component to dfa-toolkit-comp-charts

- Renamed package from `@dfa-toolkit/dfa-chart-component` to `dfa-toolkit-comp-charts` for consistency.
- Updated `next.config.ts`, `package.json`, and `package-lock.json` to reflect the new package name.
- Introduced new Vite configuration and TypeScript definitions for the `dfa-toolkit-comp-charts` package.
- Enhanced README with updated build instructions for the new package structure.
- Added initial implementation of chart rendering components and engine options for various chart types.

 README.md                                                                          |  4 ++--
 next.config.ts                                                                     |  2 +-
 package-lock.json                                                                  | 30 +++++++++++++++++++++++++-----
 package.json                                                                       |  4 ++--
 .../dist/ChartRendererWrapper.d.ts                                                 |  0
 .../dist/ChartRendererWrapper.d.ts.map                                             |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/engine.mjs          |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/engine.mjs.map      |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/engine/index.d.ts   |  0
 .../{dfa-chart-component => dfa-toolkit-comp-charts}/dist/engine/index.d.ts.map    |  0
 .../dist/engine/optionBuilders/area.d.ts                                           |  0
 .../dist/engine/optionBuilders/area.d.ts.map                                       |  0
 .../dist/engine/optionBuilders/bar.d.ts                                            |  0
 .../dist/engine/optionBuilders/bar.d.ts.map                                        |  0
 .../dist/engine/optionBuilders/cartesian.d.ts                                      |  0
 .../dist/engine/optionBuilders/cartesian.d.ts.map                                  |  0
 .../dist/engine/optionBuilders/line.d.ts                                           |  0
 .../dist/engine/optionBuilders/line.d.ts.map                                       |  0
 .../dist/engine/optionBuilders/pie.d.ts                                            |  0
 .../dist/engine/optionBuilders/pie.d.ts.map                                        |  0
 .../{dfa-chart-component => dfa-toolkit-comp-charts}/dist/engine/standalone.d.ts   |  0
 .../dist/engine/standalone.d.ts.map                                                |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/engine/types.d.ts   |  0
 .../{dfa-chart-component => dfa-toolkit-comp-charts}/dist/engine/types.d.ts.map    |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/index.d.ts          |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/index.d.ts.map      |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/index.mjs           |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/dist/index.mjs.map       |  0
 .../dist/styles/chart-container.css                                                |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/package.json             |  2 +-
 .../{dfa-chart-component => dfa-toolkit-comp-charts}/src/ChartRendererWrapper.tsx  |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/src/engine/index.ts      |  0
 .../src/engine/optionBuilders/area.ts                                              |  0
 .../src/engine/optionBuilders/bar.ts                                               |  0
 .../src/engine/optionBuilders/cartesian.ts                                         |  0
 .../src/engine/optionBuilders/line.ts                                              |  0
 .../src/engine/optionBuilders/pie.ts                                               |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/src/engine/standalone.ts |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/src/engine/types.ts      |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/src/index.ts             |  2 +-
 .../src/styles/chart-container.css                                                 |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/tsconfig.json            |  0
 packages/{dfa-chart-component => dfa-toolkit-comp-charts}/vite.config.ts           |  0
 src/components/visualizer/VisualizationTab.tsx                                     |  6 +++---
 src/lib/visualizer/chartTransform.ts                                               |  2 +-
 45 files changed, 36 insertions(+), 16 deletions(-)

### 2026-02-09 12:21 · `33acf16` · feat: introduce createChipSearch function and type definitions

- Added `createChipSearch` function to facilitate the creation of a chip-based search component.
- Included type definitions for `ChipSearchInstance` and `ChipSearchOptions` to enhance TypeScript support.
- Introduced source maps for better debugging and development experience.
- Updated the package structure to improve modularity and maintainability.

 packages/dfa-toolkit-comp-search/dist/createChipSearch.d.ts         |   3 +
 packages/dfa-toolkit-comp-search/dist/createChipSearch.d.ts.map     |   1 +
 packages/dfa-toolkit-comp-search/dist/index.d.ts                    |  75 +----
 packages/dfa-toolkit-comp-search/dist/index.d.ts.map                |   1 +
 packages/dfa-toolkit-comp-search/dist/index.js                      | 554 -------------------------------------
 packages/dfa-toolkit-comp-search/dist/index.js.map                  |   1 -
 packages/dfa-toolkit-comp-search/dist/index.mjs                     | 646 +++++++++++++++++---------------------------
 packages/dfa-toolkit-comp-search/dist/index.mjs.map                 |   2 +-
 packages/dfa-toolkit-comp-search/dist/index.umd.js                  |  37 +++
 packages/dfa-toolkit-comp-search/dist/index.umd.js.map              |   1 +
 packages/dfa-toolkit-comp-search/dist/mapDfaChipsToPayload.d.ts     |   7 +
 packages/dfa-toolkit-comp-search/dist/mapDfaChipsToPayload.d.ts.map |   1 +
 packages/dfa-toolkit-comp-search/dist/styles.css                    | 238 +---------------
 packages/dfa-toolkit-comp-search/dist/{index.d.mts => types.d.ts}   |  30 +-
 packages/dfa-toolkit-comp-search/dist/types.d.ts.map                |   1 +
 packages/dfa-toolkit-comp-search/dist/utils.d.ts                    |  13 +
 packages/dfa-toolkit-comp-search/dist/utils.d.ts.map                |   1 +
 17 files changed, 323 insertions(+), 1289 deletions(-)

### 2026-02-09 12:15 · `50f51dc` · feat: add Vite configuration and type definitions for dfa-chart-component

- Introduced a new Vite configuration file to streamline the build process and support TypeScript definitions.
- Added type definitions for ChartRendererWrapper, engine options, and various chart types (line, bar, area, pie).
- Implemented option builders for constructing chart configurations based on provided data and settings.
- Enhanced the overall structure of the dfa-chart-component package for better modularity and maintainability.

 {Packages => packages}/dfa-chart-component/dist/ChartRendererWrapper.d.ts                | 0
 {Packages => packages}/dfa-chart-component/dist/ChartRendererWrapper.d.ts.map            | 0
 {Packages => packages}/dfa-chart-component/dist/engine/index.d.ts                        | 0
 {Packages => packages}/dfa-chart-component/dist/engine/index.d.ts.map                    | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/area.d.ts          | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/area.d.ts.map      | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/bar.d.ts           | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/bar.d.ts.map       | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/cartesian.d.ts     | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/cartesian.d.ts.map | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/line.d.ts          | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/line.d.ts.map      | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/pie.d.ts           | 0
 {Packages => packages}/dfa-chart-component/dist/engine/optionBuilders/pie.d.ts.map       | 0
 {Packages => packages}/dfa-chart-component/dist/engine/standalone.d.ts                   | 0
 {Packages => packages}/dfa-chart-component/dist/engine/standalone.d.ts.map               | 0
 {Packages => packages}/dfa-chart-component/dist/engine/types.d.ts                        | 0
 {Packages => packages}/dfa-chart-component/dist/engine/types.d.ts.map                    | 0
 {Packages => packages}/dfa-chart-component/dist/index.d.ts.map                           | 0
 {Packages => packages}/dfa-chart-component/vite.config.ts                                | 0
 20 files changed, 0 insertions(+), 0 deletions(-)

### 2026-02-09 12:12 · `23841ae` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/chartRenderV1

### 2026-02-09 12:08 · `f8742ac` · feat: enhance Next.js configuration and update README for local development

- Added `transpilePackages` in `next.config.ts` to include multiple workspace packages for bundling.
- Expanded the README with prerequisites, setup instructions, and detailed local development steps.
- Updated package entry points in `dfa-chart-component` to use `.mjs` extensions for better compatibility.

 Packages/dfa-chart-component/vite.config.ts |  1 +
 README.md                                   | 68 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------
 next.config.ts                              | 11 +++++++++++
 packages/dfa-chart-component/package.json   | 12 ++++++------
 4 files changed, 78 insertions(+), 14 deletions(-)

### 2026-02-09 12:01 · `e896576` · feat: update dfa-chart-component and dfa-toolkit-comp-search packages

- Upgraded `@fortawesome/react-fontawesome` to version 3.1.1 in both `package.json` and `package-lock.json`.
- Refactored build scripts to utilize Vite for building both `dfa-chart-component` and `dfa-toolkit-comp-search`, replacing the previous `tsup` configuration.
- Introduced new Vite configuration files for both packages to streamline the build process and improve type definitions with `vite-plugin-dts`.
- Added new engine option builders for chart types (line, bar, area, pie) in the `dfa-chart-component` package.
- Updated entry points in `package.json` for both packages to reflect the new build structure.

 Packages/dfa-chart-component/dist/ChartRendererWrapper.d.ts                 |   24 +
 Packages/dfa-chart-component/dist/ChartRendererWrapper.d.ts.map             |    1 +
 Packages/dfa-chart-component/dist/engine/index.d.ts                         |   21 +
 Packages/dfa-chart-component/dist/engine/index.d.ts.map                     |    1 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/area.d.ts           |    4 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/area.d.ts.map       |    1 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/bar.d.ts            |    4 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/bar.d.ts.map        |    1 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/cartesian.d.ts      |   25 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/cartesian.d.ts.map  |    1 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/line.d.ts           |    4 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/line.d.ts.map       |    1 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/pie.d.ts            |    4 +
 Packages/dfa-chart-component/dist/engine/optionBuilders/pie.d.ts.map        |    1 +
 Packages/dfa-chart-component/dist/engine/standalone.d.ts                    |   24 +
 Packages/dfa-chart-component/dist/engine/standalone.d.ts.map                |    1 +
 .../dist/engine.d.ts => Packages/dfa-chart-component/dist/engine/types.d.ts |   41 +-
 Packages/dfa-chart-component/dist/engine/types.d.ts.map                     |    1 +
 Packages/dfa-chart-component/dist/index.d.ts.map                            |    1 +
 Packages/dfa-chart-component/vite.config.ts                                 |   41 +
 Packages/dfa-toolkit-comp-search/package.json                               |   16 +-
 Packages/dfa-toolkit-comp-search/src/index.ts                               |    1 +
 Packages/dfa-toolkit-comp-search/tsup.config.ts                             |   12 -
 Packages/dfa-toolkit-comp-search/vite.config.ts                             |   30 +
 package-lock.json                                                           | 5469 ++++++++++++++++++++++-------------
 package.json                                                                |    4 +-
 packages/dfa-chart-component/dist/chunk-365TTVLX.mjs                        |  354 ---
 packages/dfa-chart-component/dist/chunk-365TTVLX.mjs.map                    |    1 -
 packages/dfa-chart-component/dist/engine.d.mts                              |   93 -
 packages/dfa-chart-component/dist/engine.js                                 |  392 ---
 packages/dfa-chart-component/dist/engine.js.map                             |    1 -
 packages/dfa-chart-component/dist/engine.mjs                                |  312 +-
 packages/dfa-chart-component/dist/engine.mjs.map                            |    2 +-
 packages/dfa-chart-component/dist/index.d.mts                               |   58 -
 packages/dfa-chart-component/dist/index.d.ts                                |   62 +-
 packages/dfa-chart-component/dist/index.js                                  |  511 ----
 packages/dfa-chart-component/dist/index.js.map                              |    1 -
 packages/dfa-chart-component/dist/index.mjs                                 |  168 +-
 packages/dfa-chart-component/dist/index.mjs.map                             |    2 +-
 packages/dfa-chart-component/dist/styles/chart-container.css                |   10 +-
 packages/dfa-chart-component/package.json                                   |   19 +-
 packages/dfa-chart-component/src/index.ts                                   |    1 +
 packages/dfa-chart-component/tsup.config.ts                                 |   17 -
 43 files changed, 4015 insertions(+), 3723 deletions(-)

### 2026-02-09 01:22 · `27ad83f` · Removed redundant public folder

 public/dfa-components/dfa-search-component/search-component.css    | 238 ----------------
 public/dfa-components/dfa-search-component/search-component.js     | 678 ---------------------------------------------
 public/dfa-components/dfa-search-component/search-component.js.map |   7 -
 public/robots.txt                                                  |   3 -
 4 files changed, 926 deletions(-)

### 2026-02-09 01:16 · `901c39c` · Wired advanced search button

 src/components/LandingContent.tsx              | 15 +++++++++++++++
 src/components/visualizer/VisualizationTab.tsx | 36 ++++++++++++++++++++++++++++++++++++
 2 files changed, 51 insertions(+)

### 2026-02-09 01:05 · `2631990` · feat: update dfa-toolkit-comp-search package structure and dependencies

- Changed version from 1.0.0 to 0.1.0 and updated main entry points in package.json.
- Removed outdated README.md and vite.config.js files.
- Added tsup configuration for building the package.
- Updated TypeScript configuration to target ES2022 and adjusted compiler options.
- Cleaned up package-lock.json to reflect new dependencies and structure.

 Packages/dfa-toolkit-comp-search/README.md                                  |  480 ------
 Packages/dfa-toolkit-comp-search/dist/dfa-search-component.css              |    1 -
 Packages/dfa-toolkit-comp-search/dist/dfa-search-component.mjs              |  350 -----
 Packages/dfa-toolkit-comp-search/dist/dfa-search-component.umd.js           |   37 -
 Packages/dfa-toolkit-comp-search/dist/index.d.mts                           |   71 +
 Packages/dfa-toolkit-comp-search/dist/index.d.ts                            |   71 +
 Packages/dfa-toolkit-comp-search/{src/search-component.js => dist/index.js} |  412 ++---
 Packages/dfa-toolkit-comp-search/dist/index.js.map                          |    1 +
 Packages/dfa-toolkit-comp-search/dist/index.mjs                             |  526 +++++++
 Packages/dfa-toolkit-comp-search/dist/index.mjs.map                         |    1 +
 .../dfa-toolkit-comp-search/{src/search-component.css => dist/styles.css}   |    1 -
 Packages/dfa-toolkit-comp-search/package-lock.json                          | 2828 -----------------------------------
 Packages/dfa-toolkit-comp-search/package.json                               |   34 +-
 Packages/dfa-toolkit-comp-search/src/createChipSearch.ts                    |  567 +++++++
 Packages/dfa-toolkit-comp-search/src/index.ts                               |   24 +-
 Packages/dfa-toolkit-comp-search/src/mapDfaChipsToPayload.ts                |   28 +
 Packages/dfa-toolkit-comp-search/src/style.css.d.ts                         |    1 -
 Packages/dfa-toolkit-comp-search/src/styles.css                             |  237 +++
 Packages/dfa-toolkit-comp-search/src/types.ts                               |   60 +
 Packages/dfa-toolkit-comp-search/src/utils.ts                               |   88 ++
 Packages/dfa-toolkit-comp-search/tsconfig.json                              |   19 +-
 Packages/dfa-toolkit-comp-search/tsup.config.ts                             |   12 +
 Packages/dfa-toolkit-comp-search/vite.config.js                             |   25 -
 package-lock.json                                                           |  174 ++-
 src/app/[locale]/visualizer/page.tsx                                        |  269 +++-
 src/app/api/areas/route.ts                                                  |  400 ++---
 src/app/api/indicators/[identifier]/route.ts                                |   27 +
 src/app/api/options/[keyword]/route.ts                                      |  100 +-
 src/app/api/subgroups/route.ts                                              |   33 +
 src/app/api/time-periods/route.ts                                           |   30 +
 src/components/SubgroupSelectionModal.tsx                                   |   20 +-
 src/components/TileComponent.tsx                                            |    2 +-
 src/components/TimePeriodSelectionModal.tsx                                 |   20 +-
 src/components/VendorChipSearch.tsx                                         |    7 +-
 src/dummy_data/DummySubgroupData.ts                                         |    9 -
 src/dummy_data/DummyTileData.ts                                             |   28 -
 src/dummy_data/DummyTimePeriodData.ts                                       |    9 -
 src/lib/api/data.ts                                                         |  260 ++++
 src/lib/api/reference.ts                                                    |  258 ++++
 src/lib/visualizer/dataApiAdapter.ts                                        |   95 ++
 src/lib/visualizer/indicatorAdapter.ts                                      |   30 +
 src/lib/visualizer/sessionAdapter.ts                                        |   93 +-
 src/lib/visualizer/types.ts                                                 |   15 +
 tsconfig.tsbuildinfo                                                        |    2 +-
 44 files changed, 3276 insertions(+), 4479 deletions(-)

### 2026-02-06 14:23 · `390f795` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/chartRenderV1

### 2026-02-06 10:55 · `d98619f` · fix: correct file paths in package-lock.json for toolkit components

- Updated paths for `dfa-toolkit-comp-search`, `dfa-toolkit-comp-tree-view`, and `dfa-toolkit-comp-time-period` to ensure proper resolution of local dependencies.
- Swapped the entries for `dfa-toolkit-comp-tree-view` and `dfa-toolkit-comp-time-period` to reflect accurate package structure.

 package-lock.json | 8 +++-----
 1 file changed, 3 insertions(+), 5 deletions(-)

### 2026-02-06 10:54 · `6d92891` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/dfa-search-component-integration

### 2026-02-06 10:32 · `7b30524` · Add environment configuration and update package structure

- Created a new `.env.example` file to define environment variables for API configuration.
- Updated `.gitignore` to include `.env` files for local environment management.
- Modified `package.json` and `package-lock.json` to support workspaces and added a new dependency for the `@dfa-toolkit/dfa-chart-component`.
- Introduced the `dfa-chart-component` package with its own configuration files and initial implementation for chart rendering.

 .env.example                                                                |    5 +
 .gitignore                                                                  |    1 +
 package-lock.json                                                           | 8083 ++++++++++++++++++++---------------
 package.json                                                                |    3 +-
 packages/dfa-chart-component/dist/chunk-365TTVLX.mjs                        |  354 ++
 packages/dfa-chart-component/dist/chunk-365TTVLX.mjs.map                    |    1 +
 packages/dfa-chart-component/dist/engine.d.mts                              |   93 +
 packages/dfa-chart-component/dist/engine.d.ts                               |   93 +
 packages/dfa-chart-component/dist/engine.js                                 |  392 ++
 packages/dfa-chart-component/dist/engine.js.map                             |    1 +
 packages/dfa-chart-component/dist/engine.mjs                                |   18 +
 packages/dfa-chart-component/dist/engine.mjs.map                            |    1 +
 packages/dfa-chart-component/dist/index.d.mts                               |   58 +
 packages/dfa-chart-component/dist/index.d.ts                                |   58 +
 packages/dfa-chart-component/dist/index.js                                  |  511 +++
 packages/dfa-chart-component/dist/index.js.map                              |    1 +
 packages/dfa-chart-component/dist/index.mjs                                 |  133 +
 packages/dfa-chart-component/dist/index.mjs.map                             |    1 +
 .../dfa-chart-component/dist/styles/chart-container.css                     |    0
 packages/dfa-chart-component/package.json                                   |   40 +
 packages/dfa-chart-component/src/ChartRendererWrapper.tsx                   |   96 +
 {src/lib/chart-engine => packages/dfa-chart-component/src/engine}/index.ts  |    0
 .../dfa-chart-component/src/engine}/optionBuilders/area.ts                  |    0
 .../dfa-chart-component/src/engine}/optionBuilders/bar.ts                   |    0
 .../dfa-chart-component/src/engine}/optionBuilders/cartesian.ts             |    0
 .../dfa-chart-component/src/engine}/optionBuilders/line.ts                  |    0
 .../dfa-chart-component/src/engine}/optionBuilders/pie.ts                   |    0
 .../chart-engine => packages/dfa-chart-component/src/engine}/standalone.ts  |    0
 {src/lib/chart-engine => packages/dfa-chart-component/src/engine}/types.ts  |    0
 packages/dfa-chart-component/src/index.ts                                   |   21 +
 packages/dfa-chart-component/src/styles/chart-container.css                 |    9 +
 packages/dfa-chart-component/tsconfig.json                                  |   21 +
 packages/dfa-chart-component/tsup.config.ts                                 |   17 +
 public/dfa-components/dfa-chart-component/chart-component.js                |    2 -
 public/dfa-components/dfa-chart-component/chart-component.js.map            |    7 -
 public/dfa-components/dfa-search-component/search-component.js              |  672 ++-
 src/app/[locale]/layout.tsx                                                 |   17 +-
 src/app/[locale]/page.tsx                                                   |   42 +-
 src/app/[locale]/visualizer/page.tsx                                        |   62 +-
 src/app/layout.tsx                                                          |    3 +-
 src/components/Header.tsx                                                   |    9 +-
 src/components/LandingContent.tsx                                           |   51 +
 src/components/SignInButton.tsx                                             |    7 +-
 src/components/TileComponent.tsx                                            |    2 +-
 src/components/VendorChipSearch.tsx                                         |   24 +-
 src/components/visualizer/ChartRendererWrapper.tsx                          |  163 -
 src/components/visualizer/DataTableTab.tsx                                  |    2 +-
 src/components/visualizer/MetadataTab.tsx                                   |    2 +-
 src/components/visualizer/VisualizationTab.tsx                              |    9 +-
 src/contexts/CoreContext.tsx                                                |  141 +
 src/{data => dummy_data}/DummyTileData.ts                                   |    0
 src/{data => dummy_data}/visualizerMockData.ts                              |    0
 src/lib/api/core.ts                                                         |  132 +
 src/lib/api/types.ts                                                        |   30 +
 src/lib/constants.ts                                                        |   36 +-
 src/lib/visualizer/chartTransform.ts                                        |    2 +-
 src/lib/visualizer/sessionAdapter.ts                                        |    2 +-
 57 files changed, 7686 insertions(+), 3742 deletions(-)

### 2026-02-02 17:24 · `e73b6e0` · Add middleware for locale handling and redirect logic

- Implemented a new middleware in `src/middleware.ts` to manage locale detection and redirection based on user preferences and URL structure.
- Introduced a `RootPage` component in `src/app/page.tsx` to handle redirection to the default locale when accessing the root path.
- Updated `layout.tsx` to preload a new script for vendor search functionality.
- Enhanced loading state visuals in `VendorChipSearch.tsx` for improved user experience.

 src/app/layout.tsx                  |  3 ++-
 src/app/page.tsx                    | 10 ++++++++++
 src/components/VendorChipSearch.tsx | 22 ++++++++++++++++------
 middleware.ts => src/middleware.ts  | 15 ++++++++++-----
 4 files changed, 38 insertions(+), 12 deletions(-)

### 2026-02-02 10:26 · `3c15397` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/chartRenderV1

### 2026-01-30 17:12 · `327aab6` · Add esbuild as a development dependency in package-lock.json

- Introduced esbuild version 0.24.0 to enhance build performance.
- Updated package-lock.json to include various esbuild platform-specific modules for improved compatibility across different environments.

 package-lock.json | 467 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 467 insertions(+)

### 2026-01-30 16:20 · `0037318` · Refactor visualizer components and enhance functionality

- Added export functionality to the DataTableTab component with a new export menu.
- Improved type safety by defining TableRow type in DataTableTab.
- Updated ChartRendererWrapper to clarify useEffect dependencies.
- Removed unused FilterModal and FilterSidebar components to streamline the codebase.
- Enhanced ShareModal and VisualizationTab components with better type definitions and state management.

 src/components/visualizer/ChartRendererWrapper.tsx |    1 +
 src/components/visualizer/DataTableTab.tsx         |   34 +-
 src/components/visualizer/FilterModal.tsx          | 1151 ------------------------------------------------------------
 src/components/visualizer/FilterSidebar.tsx        |  453 ------------------------
 src/components/visualizer/ShareModal.tsx           |    5 +-
 src/components/visualizer/VisualizationTab.tsx     |   30 +-
 src/lib/chart-engine/index.ts                      |    1 -
 7 files changed, 51 insertions(+), 1624 deletions(-)

### 2026-01-30 16:05 · `1b4981c` · Refactor chart rendering and documentation structure

- Updated .gitignore to exclude the 'docs/' directory from version control.
- Modified TypeScript build info to enhance build management.
- Removed outdated documentation files: 'CHART_RENDERER_SPEC.md' and 'Chart.md'.
- Improved type definitions in chart engine option builders for better type safety.
- Enhanced the BasicSettingsTab and DataTableTab components for improved functionality and state management.
- Updated ChartRendererWrapper to ensure proper loading of ECharts library.

 .gitignore                                         |   2 +-
 docs/CHART_RENDERER_SPEC.md                        | 395 -------------------------------------------------------------
 docs/Chart.md                                      | 240 -------------------------------------
 src/components/visualizer/BasicSettingsTab.tsx     |   2 +-
 src/components/visualizer/ChartRendererWrapper.tsx |   6 +-
 src/components/visualizer/DataTableTab.tsx         |  78 ++++++------
 src/lib/chart-engine/index.ts                      |  23 ++--
 src/lib/chart-engine/optionBuilders/area.ts        |   6 +-
 src/lib/chart-engine/optionBuilders/bar.ts         |   6 +-
 src/lib/chart-engine/optionBuilders/line.ts        |   6 +-
 src/lib/chart-engine/optionBuilders/pie.ts         |   6 +-
 tsconfig.tsbuildinfo                               |   2 +-
 12 files changed, 76 insertions(+), 696 deletions(-)

### 2026-01-30 15:48 · `b3d3f42` · Update project configuration and add chart component styles

- Added 'docs/' to .gitignore to exclude documentation files from version control.
- Updated package.json to include 'esbuild' as a development dependency for improved build performance.
- Introduced a new TypeScript build info file for better build management.
- Created a new DFA Chart Component with associated CSS for styling the chart container.
- Implemented JavaScript and source map files for the chart component to enable rendering and debugging.

 .gitignore                                                       |    1 +
 package.json                                                     |    1 +
 public/dfa-components/dfa-chart-component/chart-component.css    |    9 +
 public/dfa-components/dfa-chart-component/chart-component.js     |    2 +
 public/dfa-components/dfa-chart-component/chart-component.js.map |    7 +
 src/app/[locale]/visualizer/page.tsx                             |  203 +------
 src/app/layout.tsx                                               |    3 +-
 src/components/visualizer/AppearanceTab.tsx                      |  259 +++++++++
 src/components/visualizer/BasicSettingsTab.tsx                   |  589 ++++++++++++++++++++
 src/components/visualizer/ChartRendererWrapper.tsx               |  115 +++-
 src/components/visualizer/FilterModal.tsx                        |  557 +++++++------------
 src/components/visualizer/FilterSidebar.tsx                      |   47 +-
 src/components/visualizer/FontControls.tsx                       |  109 ++++
 src/components/visualizer/TypographyTab.tsx                      |   39 ++
 src/components/visualizer/VisualizationSettings.tsx              | 1328 +---------------------------------------------
 src/components/visualizer/VisualizationSettingsConstants.ts      |   88 +++
 src/components/visualizer/VisualizationTab.tsx                   |   95 +---
 src/data/visualizerMockData.ts                                   |   15 +
 src/lib/chart-engine/optionBuilders/area.ts                      |   71 +--
 src/lib/chart-engine/optionBuilders/bar.ts                       |   85 +--
 src/lib/chart-engine/optionBuilders/cartesian.ts                 |  141 +++++
 src/lib/chart-engine/optionBuilders/line.ts                      |   77 +--
 src/lib/chart-engine/standalone.ts                               |   72 +++
 src/lib/constants.ts                                             |    2 +
 src/lib/visualizer/chartTransform.ts                             |   25 +-
 src/lib/visualizer/colorThemes.ts                                |   37 ++
 src/lib/visualizer/{configLayer.ts => defaultChartConfig.ts}     |    4 +-
 src/lib/visualizer/sessionAdapter.ts                             |   16 +-
 src/lib/visualizer/types.ts                                      |  114 ++++
 tsconfig.tsbuildinfo                                             |    1 +
 30 files changed, 1932 insertions(+), 2180 deletions(-)

### 2026-01-30 11:37 · `be9ac10` · Enhance visualizer functionality with chart rendering and filtering features

- Added ECharts and Lucide React as dependencies for chart rendering and icons.
- Introduced a new Chart Renderer system to facilitate reusable chart components.
- Implemented a Filter Sidebar and Filter Modal for dynamic filtering of visualizer data.
- Created a Data Table Tab to display filtered data in a tabular format.
- Established a Visualizer Layout component to manage theme context.
- Added comprehensive documentation for the chart renderer architecture and specifications.

 docs/CHART_RENDERER_SPEC.md                         |  395 +++++++++++++++++
 docs/Chart.md                                       |  240 ++++++++++
 package-lock.json                                   |   42 ++
 package.json                                        |    4 +-
 src/app/[locale]/visualizer/layout.tsx              |    9 +
 src/app/[locale]/visualizer/page.tsx                |  545 +++++++++++++++++++++--
 src/components/visualizer/ChartRendererWrapper.tsx  |   75 ++++
 src/components/visualizer/DataTableTab.tsx          |  220 ++++++++++
 src/components/visualizer/FilterModal.tsx           | 1314 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/visualizer/FilterSidebar.tsx         |  434 ++++++++++++++++++
 src/components/visualizer/MetadataTab.tsx           |   79 ++++
 src/components/visualizer/ShareModal.tsx            |  212 +++++++++
 src/components/visualizer/VisualizationSettings.tsx | 1410 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/visualizer/VisualizationTab.tsx      | 1038 +++++++++++++++++++++++++++++++++++++++++++
 src/contexts/ThemeContext.tsx                       |  143 ++++++
 src/data/visualizerMockData.ts                      |  426 ++++++++++++++++++
 src/lib/chart-engine/index.ts                       |   94 ++++
 src/lib/chart-engine/optionBuilders/area.ts         |   93 ++++
 src/lib/chart-engine/optionBuilders/bar.ts          |   89 ++++
 src/lib/chart-engine/optionBuilders/line.ts         |   90 ++++
 src/lib/chart-engine/optionBuilders/pie.ts          |   59 +++
 src/lib/chart-engine/types.ts                       |   58 +++
 src/lib/visualizer/chartTransform.ts                |  233 ++++++++++
 src/lib/visualizer/configLayer.ts                   |  103 +++++
 src/lib/visualizer/sessionAdapter.ts                |  131 ++++++
 src/lib/visualizer/types.ts                         |  104 +++++
 26 files changed, 7614 insertions(+), 26 deletions(-)

### 2026-01-28 12:49 · `0845f27` · Refactor vendor chip search component and update API integration

- Updated the search API endpoint to `GET /api/search?q=...` for improved clarity.
- Introduced a new CSS file for the vendor search component, enhancing styling and layout.
- Implemented a fetch interceptor to transform API responses for compatibility with the vendor component.
- Refactored the `VendorChipSearch` component to utilize constants for API URLs and session storage keys.
- Removed deprecated API route for keyword searches, streamlining the codebase.

 README.md                                                                   |  4 +-
 public/{vendor => dfa-components}/dfa-search-component/search-component.css | 15 +++++-
 public/dfa-components/dfa-search-component/search-component.js              | 38 +++++++++++++++
 public/dfa-components/dfa-search-component/search-component.js.map          |  7 +++
 public/vendor/dfa-search-component/search-component.js                      | 38 ---------------
 public/vendor/dfa-search-component/search-component.js.map                  |  8 ----
 src/app/[locale]/page.tsx                                                   |  2 +-
 src/app/[locale]/visualizer/page.tsx                                        |  5 +-
 src/app/api/search/keywords/route.ts                                        | 79 -------------------------------
 src/app/layout.tsx                                                          |  3 +-
 src/components/VendorChipSearch.tsx                                         | 94 +++++++++++++++++++++++++++++++------
 src/lib/constants.ts                                                        | 36 ++++++++++++++
 12 files changed, 181 insertions(+), 148 deletions(-)

### 2026-01-27 17:52 · `fdcdce0` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dt2026/dfa-toolkit-app-visualizer into feature/searchCompv1

### 2026-01-23 13:31 · `adbc967` · Refactor keyword search API to enhance functionality and error handling

- Removed hardcoded mock data and implemented a dynamic backend API call for keyword searches.
- Added configuration for API base URL and data warehouse ID.
- Introduced query validation to ensure a minimum query length before making requests.
- Enhanced error handling to log backend request failures and return an empty response in case of errors.
- Updated response handling to accommodate various potential data structures from the backend.

 src/app/api/search/keywords/route.ts | 92 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 1 file changed, 72 insertions(+), 20 deletions(-)

### 2026-01-21 15:08 · `02da9a9` · Refactor vendor chip search component and add source map

- Refactored the `createChipSearch` function for improved readability and performance.
- Updated the component to use `APIUrl` instead of `suggestionsUrl` for better clarity.
- Added a source map file for easier debugging of the search component.
- Removed deprecated code and streamlined the rendering logic for chips and suggestions.

 public/vendor/dfa-search-component/search-component.js     | 615 ++---------------------------------------------------
 public/vendor/dfa-search-component/search-component.js.map |   8 +
 src/app/[locale]/page.tsx                                  |   2 +-
 3 files changed, 25 insertions(+), 600 deletions(-)

### 2026-01-19 18:36 · `3bba99a` · Enhance vendor chip search component with new features and improvements

- Updated CSS to include flex display and gap for action buttons.
- Added disabled state styling for buttons.
- Introduced a new mapping function for chips to payload, allowing for better integration with various frameworks.
- Enhanced the createChipSearch function to support additional options like preloaded data and improved callback handling.
- Updated VendorChipSearch component to utilize new API and improve user experience with search and clear functionalities.

 public/vendor/dfa-search-component/search-component.css |   7 +++
 public/vendor/dfa-search-component/search-component.js  | 155 +++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/components/VendorChipSearch.tsx                     | 116 ++++++++++++++++++++++++------------------
 3 files changed, 209 insertions(+), 69 deletions(-)

### 2026-01-16 16:56 · `0f1b12e` · Update README.md to enhance project documentation

- Expanded project description to include Tailwind integration and demo features.
- Added details on locale-prefixed pages, routes, and search API behavior.
- Included scripts for development, build, and linting processes.
- Documented vendor chip search widget integration and its functionality.

 README.md | 49 ++++++++++++++++++++++++++++++++++++++++++++-----
 1 file changed, 44 insertions(+), 5 deletions(-)

### 2026-01-16 16:53 · `e9a9ac9` · Remove VSCode settings file to streamline project configuration

 .vscode/settings.json | 6 ------
 1 file changed, 6 deletions(-)

### 2026-01-16 16:48 · `124fae6` · Initialize Next.js project with locale-based routing and essential configurations

- Added .gitignore to exclude build artifacts and environment files.
- Created ESLint configuration for Next.js and TypeScript.
- Implemented middleware for locale detection and redirection.
- Set up Next.js configuration and environment type definitions.
- Added package.json and package-lock.json for project dependencies.
- Configured PostCSS with Tailwind CSS.
- Created global styles and layout for the application.
- Developed locale-aware routing with dynamic pages for different locales.
- Implemented a vendor chip search component for keyword suggestions.
- Added header and locale switcher components for navigation.
- Included a visualizer page to display search results.
- Established API route for keyword search functionality.
- Documented project setup in README.md.

 .gitignore                                              |   18 +
 .vscode/settings.json                                   |    6 +
 README.md                                               |   17 +
 eslint.config.mjs                                       |   10 +
 middleware.ts                                           |   64 +
 next-env.d.ts                                           |    6 +
 next.config.ts                                          |    8 +
 package-lock.json                                       | 6160 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 package.json                                            |   32 +
 postcss.config.mjs                                      |    7 +
 public/robots.txt                                       |    3 +
 public/vendor/dfa-search-component/search-component.css |  220 ++
 public/vendor/dfa-search-component/search-component.js  |  504 +++++
 src/app/[locale]/gallery/page.tsx                       |    9 +
 src/app/[locale]/layout.tsx                             |   25 +
 src/app/[locale]/page.tsx                               |   53 +
 src/app/[locale]/signin/page.tsx                        |   17 +
 src/app/[locale]/visualizer/page.tsx                    |   39 +
 src/app/api/search/keywords/route.ts                    |   27 +
 src/app/globals.css                                     |   61 +
 src/app/layout.tsx                                      |   25 +
 src/app/not-found.tsx                                   |    9 +
 src/components/Header.tsx                               |   50 +
 src/components/LocaleSwitcher.tsx                       |   42 +
 src/components/SignInButton.tsx                         |   19 +
 src/components/VendorChipSearch.tsx                     |  161 ++
 src/lib/fontawesome.ts                                  |   10 +
 src/lib/i18n/config.ts                                  |    9 +
 tailwind.config.ts                                      |   10 +
 tsconfig.json                                           |   25 +
 30 files changed, 7646 insertions(+)

---

## dfa-v6-dashboard

_No commits by you in this repo._

---

## dfa-v6-datamanager

### 2026-07-03 12:16 · `57bab92` · Merge pull request #384 in DFAV6/dfa-v6-datamanager from feature/ssologout to develop

* commit '78d0d32f24d900e670e9807c548a126d7fbce01a':
  updated version and changelog

### 2026-07-03 17:45 · `78d0d32` · updated version and changelog

 CHANGELOG.md | 3 +++
 VERSION.txt  | 2 +-
 2 files changed, 4 insertions(+), 1 deletion(-)

### 2026-07-03 12:09 · `fd3410a` · Merge pull request #383 in DFAV6/dfa-v6-datamanager from feature/ssologout to develop

* commit '2ed83736ed56106fde7070b6725f7e96d9820515':
  feat: implement session integrity check in SessionKeepAlive and streamline refresh cookie handling on 401 responses
  feat: enhance session management by implementing proactive refresh failure handling and secure cookie clearing on 401 responses

### 2026-07-03 17:38 · `2ed8373` · feat: implement session integrity check in SessionKeepAlive and streamline refresh cookie handling on 401 responses

 src/app/api/auth/refresh/route.ts    | 11 ++---------
 src/components/SessionKeepAlive.tsx  | 13 ++++++++++++-
 src/lib/server/authSessionCookies.ts |  4 ++++
 3 files changed, 18 insertions(+), 10 deletions(-)

### 2026-07-03 17:01 · `4a009de` · feat: enhance session management by implementing proactive refresh failure handling and secure cookie clearing on 401 responses

 src/app/api/auth/refresh/route.ts   | 13 ++++++++++++-
 src/components/Header.tsx           |  8 ++++++++
 src/components/SessionKeepAlive.tsx | 73 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------
 src/lib/auth/cookie.ts              |  4 +++-
 4 files changed, 86 insertions(+), 12 deletions(-)

### 2026-07-01 15:11 · `da3767b` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/ssologout

### 2026-06-29 16:28 · `e9d4b38` · fix(LocaleLoginPage): prevent SSO auto-redirect on cross-app SLO logout by checking session expiration

 src/app/[locale]/page.tsx           | 8 ++++++--
 src/components/SessionKeepAlive.tsx | 2 +-
 2 files changed, 7 insertions(+), 3 deletions(-)

### 2026-06-29 14:18 · `bbf04dd` · fix(SessionKeepAlive): improve polling logic to start unconditionally on mount, ensuring session management works seamlessly after client-side login navigation

 src/components/SessionKeepAlive.tsx | 17 +++++------------
 1 file changed, 5 insertions(+), 12 deletions(-)

### 2026-06-29 10:15 · `b88506d` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/ssologout

### 2026-06-29 10:14 · `7f40700` · fix(SessionKeepAlive): enhance session management by ensuring polling and refresh only occur for logged-in users

 src/components/SessionKeepAlive.tsx | 22 ++++++++++++++++++----
 1 file changed, 18 insertions(+), 4 deletions(-)

### 2026-06-29 10:14 · `e04b87d` · feat(SessionKeepAlive): add session management component and API for session status polling

 src/app/[locale]/layout.tsx                 |  2 ++
 src/app/api/auth/session-status/route.ts    | 55 +++++++++++++++++++++++++++++++++++++++++++++++
 src/components/SessionKeepAlive.tsx         | 81 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/lib/api/client.ts                       |  2 +-
 src/lib/i18n/translations/translations.json |  4 ++--
 src/lib/server/authSessionCookies.ts        |  4 ++--
 6 files changed, 143 insertions(+), 5 deletions(-)

### 2026-06-22 11:28 · `5915a9f` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/styleguide

### 2026-06-22 11:25 · `d7a1f25` · Refactor styleguide integration and update global styles. Migrate design tokens and Tailwind configuration to new @dfa-v6/styleguide package. Remove deprecated design-tokens package and adjust imports in layout.tsx to use the new styleguide. Update cursor rules for component class naming conventions.

 .cursorrules                                             |   4 +-
 next.config.ts                                           |   1 +
 package-lock.json                                        | 719 +++++++++----------------------------------------------
 packages/design-tokens/package.json                      |  16 --
 {src/app => packages/dfa-v6-styleguide}/globals.css      |   2 +-
 packages/dfa-v6-styleguide/package.json                  |  20 ++
 packages/dfa-v6-styleguide/postcss.config.mjs            |   6 +
 packages/dfa-v6-styleguide/tailwind.config.ts            | 122 ++++++++++
 packages/{design-tokens => dfa-v6-styleguide}/tokens.css |   0
 src/app/layout.tsx                                       |   2 +-
 tailwind.config.ts                                       | 116 +--------
 11 files changed, 266 insertions(+), 742 deletions(-)

### 2026-06-22 11:25 · `abf33ed` · Refactor styleguide integration and update global styles. Migrate design tokens and Tailwind configuration to new @dfa-v6/styleguide package. Remove deprecated design-tokens package and adjust imports in layout.tsx to use the new styleguide. Update cursor rules for component class naming conventions.

 .cursorrules                                             |   4 +-
 next.config.ts                                           |   1 +
 package-lock.json                                        | 719 +++++++++----------------------------------------------
 packages/design-tokens/package.json                      |  16 --
 {src/app => packages/dfa-v6-styleguide}/globals.css      |   2 +-
 packages/dfa-v6-styleguide/package.json                  |  20 ++
 packages/dfa-v6-styleguide/postcss.config.mjs            |   6 +
 packages/dfa-v6-styleguide/tailwind.config.ts            | 122 ++++++++++
 packages/{design-tokens => dfa-v6-styleguide}/tokens.css |   0
 src/app/layout.tsx                                       |   2 +-
 tailwind.config.ts                                       | 116 +--------
 11 files changed, 266 insertions(+), 742 deletions(-)

### 2026-06-18 15:57 · `8eafd49` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feat/curr_tp

### 2026-06-15 18:12 · `ffbad49` · Add sisomali adaptation to deployment configuration and update documentation

- Updated `build_spec.yaml` to include 'sisomali' in the `DEPLOY_ADAPTATIONS` variable.
- Modified `README.md` to reflect the new 'sisomali' adaptation in the architecture and deployment sections.
- Added new overlay files for 'sisomali', including `env-config.yaml`, `ingress.yaml`, and `kustomization.yaml` for Kubernetes deployment.
- Updated the output artifacts section to include the new manifest for 'sisomali'.

 build_spec.yaml                              |  7 +++++--
 oci_k8s/README.md                            | 34 +++++++++++++++++++++-------------
 oci_k8s/overlays/sisomali/env-config.yaml    | 26 ++++++++++++++++++++++++++
 oci_k8s/overlays/sisomali/ingress.yaml       | 24 ++++++++++++++++++++++++
 oci_k8s/overlays/sisomali/kustomization.yaml | 29 +++++++++++++++++++++++++++++
 5 files changed, 105 insertions(+), 15 deletions(-)

### 2026-06-12 16:36 · `05bde3f` · Update text styling for API key in ProductsConfigPanel to ensure consistent appearance with the DFA v6 styleguide.

 src/components/administration/ProductsConfigPanel.tsx | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-06-12 16:17 · `980b4f1` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/styleguide

### 2026-06-12 15:57 · `2cbf9e1` · Refactor pagination and review stage styles in globals.css; remove sign-in switch and update class names for consistency with DFA v6 styleguide.

 src/app/globals.css | 28 ++++++++++------------------
 1 file changed, 10 insertions(+), 18 deletions(-)

### 2026-06-12 14:32 · `9355ddf` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/styleguide

### 2026-06-12 11:46 · `642ba44` · Update cursor rules and global styles to align with DFA v6 styleguide; refactor component classes for consistency. Change app header to use brand variant and update card classes to remove 'dm-' prefix.

 .cursorrules                                          |  10 +++
 src/app/globals.css                                   | 250 +++++++++++++++++++++++++++++++++-------------------------
 src/components/Header.tsx                             |   2 +-
 src/components/administration/ProductsConfigPanel.tsx |   6 +-
 4 files changed, 155 insertions(+), 113 deletions(-)

### 2026-06-10 18:10 · `255e300` · Enhance authentication flow with return URL handling

- Introduced functions for validating and resolving return URLs to improve user experience during login and SSO processes.
- Updated middleware to handle return URLs for redirection after login.
- Refactored login page to utilize new return URL logic, ensuring users are redirected to the correct destination post-authentication.
- Added new utility functions for managing return URLs in session storage and validating paths.
- Improved CSS styles for scrollbar elements across various components for better UI consistency.

 src/app/[locale]/page.tsx          |  82 +++++++++++++++++++++++++++++-------
 src/app/auth/sso/callback/page.tsx |  32 ++++++++------
 src/app/globals.css                |  34 ++++++++++-----
 src/lib/api/client.ts              |  15 ++++++-
 src/lib/auth/returnUrl.ts          | 175 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/middleware.ts                  |  21 ++++++++--
 6 files changed, 315 insertions(+), 44 deletions(-)

### 2026-06-04 11:55 · `37bf5c5` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into develop

### 2026-06-04 11:53 · `a9209fb` · updated fallback key for help admin

 src/lib/constants.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

### 2026-06-02 18:25 · `ef1a5e7` · Add DM_API_SIGNING_PRIVATE_KEY to env-config.yaml for toolkit signing

 oci_k8s_test/env-config.yaml | 2 ++
 1 file changed, 2 insertions(+)

### 2026-06-02 14:14 · `d6127ba` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sso

### 2026-06-02 12:41 · `4d1e341` · Enhance SSO handling by incorporating application identifier key for redirect URLs. Update LocaleLoginPage to conditionally append app_key to SSO redirect links based on configuration. Introduce APP_ID_CONFIG_KEY in core API for better integration with backend application key.

 src/app/[locale]/page.tsx | 11 ++++++++---
 src/lib/api/core.ts       |  2 ++
 2 files changed, 10 insertions(+), 3 deletions(-)

### 2026-06-02 09:29 · `bf16a96` · removed redundant vars from env example

 .env.example | 5 +----
 1 file changed, 1 insertion(+), 4 deletions(-)

### 2026-06-01 16:26 · `e495182` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sso

### 2026-06-01 15:45 · `563d524` · Refactor SSO handling: Remove build-time SSO_ENABLED constant, update app configuration to read SSO mode at runtime, and adjust related components to utilize new ssoEnabled context value. Clean up unused SSO API routes and streamline logout process. Enhance permissions checks in data warehouse overview and sidebar components.

 .env.example                               |   4 +-
 src/app/[locale]/[dw_id]/overview/page.tsx | 173 ++++++++++++++++++++++++++++++++++++++++++---------------------------
 src/app/[locale]/page.tsx                  |   9 ++--
 src/app/api/auth/logout/route.ts           |  10 +++-
 src/app/api/auth/sso/exchange/route.ts     |  76 ------------------------------
 src/app/api/auth/sso/logout/route.ts       |  48 -------------------
 src/app/auth/sso/callback/page.tsx         |   2 +-
 src/components/Header.tsx                  |  33 +++++--------
 src/components/Sidebar.tsx                 |  77 +++++++++----------------------
 src/contexts/AppConfigContext.tsx          |   4 ++
 src/lib/api/core.ts                        |   2 +
 src/lib/auth/user.ts                       |   3 ++
 src/lib/constants.ts                       |   8 ----
 13 files changed, 163 insertions(+), 286 deletions(-)

### 2026-05-28 09:25 · `50e7745` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sso

### 2026-05-26 14:50 · `a44618f` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/helpupdate

### 2026-05-26 14:49 · `f03a737` · Enhance DFA Help Renderer with language support and improved type definitions

- Added `languages` prop to `DFAHelpRendererProps` to allow overriding global language settings and enable language tabs when more than one language is provided.
- Updated type definitions in `dfa-help.types.d.ts` to reflect the new `languages` prop.
- Refactored `DFAHelpRenderer` to utilize `useMemo` for performance optimization.
- Adjusted related TypeScript declaration maps for consistency.

 packages/dfa-help-view/dist/cjs/components/DFAHelpRenderer.d.ts.map |  2 +-
 packages/dfa-help-view/dist/cjs/index.js                            |  2 +-
 packages/dfa-help-view/dist/cjs/index.js.map                        |  2 +-
 packages/dfa-help-view/dist/cjs/types/dfa-help.types.d.ts           |  2 ++
 packages/dfa-help-view/dist/cjs/types/dfa-help.types.d.ts.map       |  2 +-
 packages/dfa-help-view/dist/esm/components/DFAHelpRenderer.d.ts.map |  2 +-
 packages/dfa-help-view/dist/esm/index.js                            |  2 +-
 packages/dfa-help-view/dist/esm/index.js.map                        |  2 +-
 packages/dfa-help-view/dist/esm/types/dfa-help.types.d.ts           |  2 ++
 packages/dfa-help-view/dist/esm/types/dfa-help.types.d.ts.map       |  2 +-
 packages/dfa-help-view/lib/components/DFAHelpRenderer.d.ts.map      |  2 +-
 packages/dfa-help-view/lib/components/DFAHelpRenderer.js            | 14 +++++++++----
 packages/dfa-help-view/lib/components/DFAHelpRenderer.js.map        |  2 +-
 packages/dfa-help-view/lib/types/dfa-help.types.d.ts                |  2 ++
 packages/dfa-help-view/lib/types/dfa-help.types.d.ts.map            |  2 +-
 packages/dfa-help-view/src/components/DFAHelpRenderer.tsx           | 14 ++++++++++---
 packages/dfa-help-view/src/types/dfa-help.types.ts                  |  2 ++
 packages/dfa-v6-comp-area/dist/styles.css                           |  2 +-
 packages/dfa-v6-comp-indicator/dist/styles.css                      |  2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map            |  2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map       |  2 +-
 src/components/BcMainToolbar.tsx                                    |  5 +++++
 src/components/DfaHelpProvider.tsx                                  | 39 ++++++++++++++++++++++++++++-------
 src/components/PageToolbar.tsx                                      | 22 +++-----------------
 src/components/ToolbarHelpButton.tsx                                | 50 +++++++++++++++++++++++++++++++++++++++++++++
 src/contexts/DfaHelpConfigContext.tsx                               | 37 +++++++++++++++++++++++++++++++++
 src/lib/helpKeys.ts                                                 | 41 ++++++++++++++++++++++++++++++++++---
 27 files changed, 209 insertions(+), 51 deletions(-)

### 2026-05-26 09:48 · `6311b8c` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sso

### 2026-05-25 15:46 · `e056cba` · Refactor login handling to remove LOCAL_LOGIN_ENABLED constant and simplify SSO logic. Update .env.example to reflect changes in login mode configuration.

 .env.example              |  4 +---
 src/app/[locale]/page.tsx | 57 +++++----------------------------------------------------
 src/lib/constants.ts      | 14 ++++----------
 3 files changed, 10 insertions(+), 65 deletions(-)

### 2026-05-25 11:22 · `ed7958f` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sso

### 2026-05-22 11:33 · `6318735` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sso

### 2026-05-22 09:16 · `d0fefe3` · SSO Logout

 src/app/api/auth/sso/logout/route.ts | 48 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/Header.tsx            | 31 ++++++++++++++++++++++++++-----
 src/lib/auth/user.ts                 | 11 +++++++++++
 3 files changed, 85 insertions(+), 5 deletions(-)

### 2026-05-20 17:57 · `0027d21` · Enhance login component with SSO support and new UI elements. Added renderAfterSubmit prop for custom content in sign-in card. Updated styles for SSO buttons and dividers. Modified environment variables for local login and SSO configuration. Improved locale login page logic for SSO handling.

 .env.example                                                  |    5 +
 packages/dfa-v6-comp-login/dist/Login.d.ts                    |    5 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js          | 3250 +++++++++++++++++++++++++------------------------
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.js.map      |    2 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs     |   40 +-
 packages/dfa-v6-comp-login/dist/dfa-v6-comp-login.umd.cjs.map |    2 +-
 packages/dfa-v6-comp-login/dist/styles.css                    |    2 +-
 packages/dfa-v6-comp-login/src/Login.tsx                      |    4 +
 packages/dfa-v6-comp-login/src/styles.css                     |  120 ++
 src/app/[locale]/page.tsx                                     |  393 +++---
 src/lib/auth/ssoProviders.ts                                  |   25 +
 src/lib/constants.ts                                          |   15 +
 12 files changed, 2058 insertions(+), 1805 deletions(-)

### 2026-05-19 14:58 · `4e8bdb6` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sso

### 2026-05-19 14:26 · `125c55e` · SSO implementation

 src/app/[locale]/page.tsx               | 250 ++++++++++++++++++++++++++++++++++++++++++++++++++----------------------
 src/app/api/auth/sso/exchange/route.ts  |  76 ++++++++++++++++++++++
 src/app/api/auth/sso/providers/route.ts |  28 ++++++++
 src/app/auth/sso/callback/page.tsx      |  81 ++++++++++++++++++++++++
 src/lib/api/client.ts                   |   9 +--
 src/lib/auth/signature.ts               |  10 ++-
 src/lib/server/dmAppSign.ts             |  10 ++-
 src/lib/server/dmUpstream.ts            |  25 ++++++--
 src/middleware.ts                       |   2 +-
 9 files changed, 394 insertions(+), 97 deletions(-)

### 2026-05-15 15:28 · `eb192fd` · Update the setup for dfa help

 src/lib/constants.ts | 6 ++++++
 src/lib/helpKeys.ts  | 8 +++++---
 2 files changed, 11 insertions(+), 3 deletions(-)

### 2026-05-15 15:26 · `36f0279` · updated constants

 src/lib/constants.ts | 3 ---
 1 file changed, 3 deletions(-)

### 2026-05-15 15:24 · `a8fef61` · Refactor translation import logic by removing unused APP_KEY from API URL construction. Simplified the import URL for translations.

 src/app/[locale]/translations/page.tsx | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)

### 2026-05-15 12:36 · `26301fc` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/sprint8

### 2026-05-15 12:31 · `41595cf` · FIxed a trailing slash inconsistency for the app-config patch api, updated translations, fixed a bug in import logic for system translations

 src/app/[locale]/translations/page.tsx      | 19 ++-----------------
 src/lib/api/core.ts                         |  7 ++-----
 src/lib/constants.ts                        |  3 +++
 src/lib/i18n/translations/translations.json |  6 +++---
 4 files changed, 10 insertions(+), 25 deletions(-)

### 2026-05-13 17:20 · `dab9050` · Refactor DFA Help integration to use updated API URLs

- Removed deprecated environment variables for the DFA Help API and replaced them with constants for better clarity and maintainability.
- Updated the `DfaHelpProvider` component to utilize the new `DFA_HELP_KEYDATA_URL`.
- Adjusted the `HelpAdminTab` component to use `DFA_HELP_ADMIN_URL` for API interactions, streamlining the configuration process.

 .env.example                                   |  5 -----
 src/components/DfaHelpProvider.tsx             |  2 +-
 src/components/administration/HelpAdminTab.tsx |  7 ++-----
 src/lib/constants.ts                           | 21 ++++++++++++---------
 4 files changed, 15 insertions(+), 20 deletions(-)

### 2026-05-13 16:50 · `4b8bebd` · Add DFA Help Admin package with comprehensive content management features

- Introduced the `dfa-help-admin` package, a React component for managing DFA Help Service content.
- Implemented features including adaptation selection, tree view navigation, multi-language support, and form management.
- Added installation and usage documentation, along with API integration details.
- Included build scripts and configuration for development and production environments.

 package-lock.json                                                   | 14642 ++++++++++++++++--------------------------
 packages/dfa-help-admin/DOCUMENTATION.md                            |   433 ++
 packages/dfa-help-admin/INSTALL.md                                  |   153 +
 packages/dfa-help-admin/PRD.md                                      |   290 +
 packages/dfa-help-admin/QUICK_REFERENCE.md                          |   259 +
 packages/dfa-help-admin/README.md                                   |   175 +
 packages/dfa-help-admin/build.sh                                    |    18 +
 packages/dfa-help-admin/dist/DFAHelpAdmin.d.ts                      |    12 +
 packages/dfa-help-admin/dist/DFAHelpService.d.ts                    |    12 +
 packages/dfa-help-admin/dist/components/Form.d.ts                   |    12 +
 packages/dfa-help-admin/dist/components/TreeView.d.ts               |    12 +
 packages/dfa-help-admin/dist/index.cjs                              |   913 +++
 packages/dfa-help-admin/dist/index.cjs.map                          |     1 +
 packages/dfa-help-admin/dist/index.d.ts                             |     2 +
 packages/dfa-help-admin/dist/index.esm.js                           |   183 +
 packages/dfa-help-admin/dist/index.esm.js.map                       |     1 +
 packages/dfa-help-admin/dist/index.js                               |   911 +++
 packages/dfa-help-admin/dist/index.js.map                           |     1 +
 packages/dfa-help-admin/dist/styles.css                             |   742 +++
 packages/dfa-help-admin/dist/types.d.ts                             |    72 +
 packages/dfa-help-admin/docs/README.md                              |    39 +
 packages/dfa-help-admin/docs/dfa-help-admin.md                      |   369 ++
 packages/dfa-help-admin/example-usage.md                            |   196 +
 packages/dfa-help-admin/package.json                                |    49 +
 packages/dfa-help-admin/rollup.config.js                            |    37 +
 packages/dfa-help-admin/src/DFAHelpAdmin.tsx                        |   443 ++
 packages/dfa-help-admin/src/components/Form.tsx                     |   986 +++
 packages/dfa-help-admin/src/components/TreeView.tsx                 |   218 +
 packages/dfa-help-admin/src/index.ts                                |    11 +
 packages/dfa-help-admin/src/styles.css                              |   742 +++
 packages/dfa-help-admin/src/types.ts                                |    81 +
 packages/dfa-help-admin/tsconfig.json                               |    25 +
 packages/dfa-help-view/.npmignore                                   |    18 +
 packages/dfa-help-view/CHANGELOG.md                                 |    59 +
 packages/dfa-help-view/README.md                                    |   837 +++
 packages/dfa-help-view/debug-test.jsx                               |    83 +
 packages/dfa-help-view/dist/cjs/components/DFAHelpRenderer.d.ts     |     5 +
 packages/dfa-help-view/dist/cjs/components/DFAHelpRenderer.d.ts.map |     1 +
 packages/dfa-help-view/dist/cjs/components/HelpPanel.d.ts           |     5 +
 packages/dfa-help-view/dist/cjs/components/HelpPanel.d.ts.map       |     1 +
 packages/dfa-help-view/dist/cjs/components/index.d.ts               |     3 +
 packages/dfa-help-view/dist/cjs/components/index.d.ts.map           |     1 +
 packages/dfa-help-view/dist/cjs/index.css                           |     1 +
 packages/dfa-help-view/dist/cjs/index.d.ts                          |     7 +
 packages/dfa-help-view/dist/cjs/index.d.ts.map                      |     1 +
 packages/dfa-help-view/dist/cjs/index.js                            |     2 +
 packages/dfa-help-view/dist/cjs/index.js.map                        |     1 +
 packages/dfa-help-view/dist/cjs/styles/index.d.ts                   |     2 +
 packages/dfa-help-view/dist/cjs/styles/index.d.ts.map               |     1 +
 packages/dfa-help-view/dist/cjs/types/dfa-help.types.d.ts           |    96 +
 packages/dfa-help-view/dist/cjs/types/dfa-help.types.d.ts.map       |     1 +
 packages/dfa-help-view/dist/cjs/types/index.d.ts                    |     2 +
 packages/dfa-help-view/dist/cjs/types/index.d.ts.map                |     1 +
 packages/dfa-help-view/dist/cjs/utils/dfa-help-init.d.ts            |    29 +
 packages/dfa-help-view/dist/cjs/utils/dfa-help-init.d.ts.map        |     1 +
 packages/dfa-help-view/dist/cjs/utils/index.d.ts                    |     2 +
 packages/dfa-help-view/dist/cjs/utils/index.d.ts.map                |     1 +
 packages/dfa-help-view/dist/esm/components/DFAHelpRenderer.d.ts     |     5 +
 packages/dfa-help-view/dist/esm/components/DFAHelpRenderer.d.ts.map |     1 +
 packages/dfa-help-view/dist/esm/components/HelpPanel.d.ts           |     5 +
 packages/dfa-help-view/dist/esm/components/HelpPanel.d.ts.map       |     1 +
 packages/dfa-help-view/dist/esm/components/index.d.ts               |     3 +
 packages/dfa-help-view/dist/esm/components/index.d.ts.map           |     1 +
 packages/dfa-help-view/dist/esm/index.css                           |     1 +
 packages/dfa-help-view/dist/esm/index.d.ts                          |     7 +
 packages/dfa-help-view/dist/esm/index.d.ts.map                      |     1 +
 packages/dfa-help-view/dist/esm/index.js                            |     2 +
 packages/dfa-help-view/dist/esm/index.js.map                        |     1 +
 packages/dfa-help-view/dist/esm/styles/index.d.ts                   |     2 +
 packages/dfa-help-view/dist/esm/styles/index.d.ts.map               |     1 +
 packages/dfa-help-view/dist/esm/types/dfa-help.types.d.ts           |    96 +
 packages/dfa-help-view/dist/esm/types/dfa-help.types.d.ts.map       |     1 +
 packages/dfa-help-view/dist/esm/types/index.d.ts                    |     2 +
 packages/dfa-help-view/dist/esm/types/index.d.ts.map                |     1 +
 packages/dfa-help-view/dist/esm/utils/dfa-help-init.d.ts            |    29 +
 packages/dfa-help-view/dist/esm/utils/dfa-help-init.d.ts.map        |     1 +
 packages/dfa-help-view/dist/esm/utils/index.d.ts                    |     2 +
 packages/dfa-help-view/dist/esm/utils/index.d.ts.map                |     1 +
 packages/dfa-help-view/docs/API_DEBUGGING_GUIDE.md                  |   217 +
 packages/dfa-help-view/docs/DESIGN_UPDATE_SUMMARY.md                |    70 +
 packages/dfa-help-view/docs/HOSTING_APP_INSTALLATION.md             |   134 +
 packages/dfa-help-view/docs/INSTALLATION_GUIDE.md                   |   144 +
 packages/dfa-help-view/docs/SOLUTION_SUMMARY.md                     |   119 +
 packages/dfa-help-view/docs/bug-fixes-summary.md                    |    57 +
 packages/dfa-help-view/docs/css-import-fix.md                       |   112 +
 packages/dfa-help-view/docs/dfa-help-view.md                        |  1950 ++++++
 packages/dfa-help-view/docs/font-buttons-debug.md                   |   221 +
 packages/dfa-help-view/docs/language-tabs-fix.md                    |   110 +
 packages/dfa-help-view/docs/navigation-features.md                  |   149 +
 packages/dfa-help-view/docs/related-keys-translations.md            |   214 +
 packages/dfa-help-view/install-dfa-help.js                          |    90 +
 packages/dfa-help-view/lib/components/DFAHelpRenderer.d.ts          |     5 +
 packages/dfa-help-view/lib/components/DFAHelpRenderer.d.ts.map      |     1 +
 packages/dfa-help-view/lib/components/DFAHelpRenderer.js            |   223 +
 packages/dfa-help-view/lib/components/DFAHelpRenderer.js.map        |     1 +
 packages/dfa-help-view/lib/components/HelpPanel.d.ts                |     5 +
 packages/dfa-help-view/lib/components/HelpPanel.d.ts.map            |     1 +
 packages/dfa-help-view/lib/components/HelpPanel.js                  |   142 +
 packages/dfa-help-view/lib/components/HelpPanel.js.map              |     1 +
 packages/dfa-help-view/lib/components/index.d.ts                    |     3 +
 packages/dfa-help-view/lib/components/index.d.ts.map                |     1 +
 packages/dfa-help-view/lib/components/index.js                      |     3 +
 packages/dfa-help-view/lib/components/index.js.map                  |     1 +
 packages/dfa-help-view/lib/index.d.ts                               |     7 +
 packages/dfa-help-view/lib/index.d.ts.map                           |     1 +
 packages/dfa-help-view/lib/index.js                                 |    12 +
 packages/dfa-help-view/lib/index.js.map                             |     1 +
 packages/dfa-help-view/lib/styles/index.d.ts                        |     2 +
 packages/dfa-help-view/lib/styles/index.d.ts.map                    |     1 +
 packages/dfa-help-view/lib/styles/index.js                          |     3 +
 packages/dfa-help-view/lib/styles/index.js.map                      |     1 +
 packages/dfa-help-view/lib/types/dfa-help.types.d.ts                |    96 +
 packages/dfa-help-view/lib/types/dfa-help.types.d.ts.map            |     1 +
 packages/dfa-help-view/lib/types/dfa-help.types.js                  |     2 +
 packages/dfa-help-view/lib/types/dfa-help.types.js.map              |     1 +
 packages/dfa-help-view/lib/types/index.d.ts                         |     2 +
 packages/dfa-help-view/lib/types/index.d.ts.map                     |     1 +
 packages/dfa-help-view/lib/types/index.js                           |     2 +
 packages/dfa-help-view/lib/types/index.js.map                       |     1 +
 packages/dfa-help-view/lib/utils/dfa-help-init.d.ts                 |    29 +
 packages/dfa-help-view/lib/utils/dfa-help-init.d.ts.map             |     1 +
 packages/dfa-help-view/lib/utils/dfa-help-init.js                   |    98 +
 packages/dfa-help-view/lib/utils/dfa-help-init.js.map               |     1 +
 packages/dfa-help-view/lib/utils/index.d.ts                         |     2 +
 packages/dfa-help-view/lib/utils/index.d.ts.map                     |     1 +
 packages/dfa-help-view/lib/utils/index.js                           |     2 +
 packages/dfa-help-view/lib/utils/index.js.map                       |     1 +
 packages/dfa-help-view/package.json                                 |    69 +
 packages/dfa-help-view/rollup.config.js                             |    66 +
 packages/dfa-help-view/src/components/DFAHelpRenderer.tsx           |   325 +
 packages/dfa-help-view/src/components/HelpPanel.tsx                 |   324 +
 packages/dfa-help-view/src/components/index.ts                      |     2 +
 packages/dfa-help-view/src/index.ts                                 |    23 +
 packages/dfa-help-view/src/styles/DFAHelpRenderer.module.css        |    59 +
 packages/dfa-help-view/src/styles/HelpPanel.module.css              |   372 ++
 packages/dfa-help-view/src/styles/globals.css                       |   130 +
 packages/dfa-help-view/src/styles/index.ts                          |     2 +
 packages/dfa-help-view/src/types/css-modules.d.ts                   |     9 +
 packages/dfa-help-view/src/types/dfa-help.types.ts                  |   105 +
 packages/dfa-help-view/src/types/index.ts                           |     1 +
 packages/dfa-help-view/src/utils/dfa-help-init.ts                   |   117 +
 packages/dfa-help-view/src/utils/index.ts                           |     1 +
 packages/dfa-help-view/styles.css                                   |   506 ++
 packages/dfa-help-view/test-installation.js                         |    64 +
 packages/dfa-help-view/tsconfig.build.json                          |    23 +
 packages/dfa-help-view/tsconfig.json                                |    41 +
 packages/dfa-help-view/verify-installation.js                       |    84 +
 147 files changed, 20962 insertions(+), 8969 deletions(-)

### 2026-05-13 16:26 · `84ac531` · fixes

 packages/dfa-help-admin | 1 -
 packages/dfa-help-view  | 1 -
 2 files changed, 2 deletions(-)

### 2026-05-13 16:23 · `96acb36` · Remove outdated DFA Help Tool documentation and refactor PageToolbar component to integrate DFAHelpRenderer for help functionality. The useDfaHelpPanel hook has been removed as part of this update.

 helptoolDoc.md                     | 159 --------------------------------------------------
 src/components/PageToolbar.tsx     |  42 ++++++--------
 src/components/useDfaHelpPanel.tsx | 245 -----------------------------------------------------------------------------
 3 files changed, 19 insertions(+), 427 deletions(-)

### 2026-05-13 16:13 · `357ef92` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into helpTool

### 2026-05-13 12:10 · `1776760` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/opt-docker

### 2026-05-13 09:22 · `443ca2f` · Add export and import functionality for language files

- Implemented `downloadLanguagesExport` function to handle language file exports.
- Enhanced `runExport` and `runImport` functions to manage file downloads and uploads, respectively.
- Added loading states for import and export buttons to improve user experience.
- Updated error handling and success notifications for import/export operations.

 src/app/[locale]/[dw_id]/languages/page.tsx | 115 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 1 file changed, 100 insertions(+), 15 deletions(-)

### 2026-05-12 14:07 · `fd403da` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/opt-docker

### 2026-05-12 09:21 · `484c489` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/opt-docker

### 2026-05-11 10:31 · `5078b8b` · Updated Dockerfile to be consistent with Docker.oci

 Dockerfile | 79 ++++++++++++++++++++++++++++++++++++++++++++-----------------------------------
 1 file changed, 44 insertions(+), 35 deletions(-)

### 2026-05-11 10:16 · `57201ae` · Merge branch 'develop' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-datamanager into feature/opt-docker

### 2026-05-11 10:10 · `ef2fcec` · Refactor Dockerfile and .dockerignore for improved build process and clarity. Added specific package.json copies for workspace dependencies in Dockerfile. Updated .dockerignore to exclude additional IDE files and documentation.

 .dockerignore  | 15 ++++++++++++++-
 Dockerfile     | 79 ++++++++++++++++++++++++++++++++++---------------------------------------------
 Dockerfile.oci | 78 +++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------------
 next.config.ts |  1 +
 4 files changed, 104 insertions(+), 69 deletions(-)

### 2026-05-08 15:21 · `2273f10` · Optimized Dockerfile for optimizing build time

 .dockerignore                             |  2 +-
 Dockerfile.oci                            | 37 ++++++++++++++++++++++++++++---------
 package.json                              |  6 +++---
 packages/dfa-email-templates/package.json |  2 +-
 4 files changed, 33 insertions(+), 14 deletions(-)

---

## dfa-v6-styleguide

### 2026-06-22 12:08 · `05d3933` · Update README.md to clarify PostCSS configuration usage for products

- Added a note about the `postcss.config.mjs` file, indicating that each product should maintain its own copy for processing the styleguide's `globals.css`.
- Updated the section on product-specific tokens to reflect the new structure and usage guidelines.

 README.md | 3 +++
 1 file changed, 3 insertions(+)

### 2026-06-22 11:27 · `52718cc` · Remove deprecated class catalog and migration map; add initial styleguide package files

- Deleted `CLASS_CATALOG.md` and `MIGRATION_MAP.md` as they are no longer needed.
- Introduced `package.json`, `globals.css`, `tailwind.config.ts`, and `postcss.config.mjs` for the new styleguide package.
- Updated import paths in `globals.css` to reflect the new structure.

 CLASS_CATALOG.md            |  94 ----------------------------------------------------------------
 MIGRATION_MAP.md            |  26 ------------------
 README.md                   |  65 +++++++++++++++++++++++++++++++++++++++++++++
 SYNC.md                     |  62 -------------------------------------------
 globals.css                 |   2 +-
 package.json                |  20 ++++++++++++++
 postcss.config.mjs          |   6 +++++
 scripts/sync-styleguide.ps1 |  73 --------------------------------------------------
 tailwind.config.ts          | 122 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 9 files changed, 214 insertions(+), 256 deletions(-)

### 2026-06-12 16:22 · `084a704` · Update class catalog and globals.css for review stage dots

- Added `review-stage-dot` class and its variants to `CLASS_CATALOG.md` for dataset list review stage indicators.
- Refactored CSS for review stage circles to `review-stage-dot` with updated styles for completed, active, and pending states in `globals.css`.

 CLASS_CATALOG.md |  1 +
 globals.css      | 18 +++++++++---------
 2 files changed, 10 insertions(+), 9 deletions(-)

### 2026-06-12 15:51 · `ec416e7` · Merge branch 'master' of https://git.communitysystemsfoundation.org/scm/dfav6/dfa-v6-styleguide

