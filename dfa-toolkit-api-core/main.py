"""
FastAPI Application
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse

from apps.shared.config.config import settings
from apps.shared.middleware.error_handler import setup_exception_handlers
from apps.shared.middleware.logging import setup_logging

# Import app routers
from apps.app_db.router.api import router as core_router
from apps.datawarehouse.router.api import router as datawarehouse_router
from apps.app_dashboard.router.api import router as dashboard_router
from apps.shared.router.cache import router as cache_router

# DFA Help Service — package dir uses hyphens, so we add it to sys.path
import sys
from pathlib import Path
_help_pkg_dir = Path(__file__).resolve().parent / "apps" / "shared" / "packages" / "dfa-help-service"
if str(_help_pkg_dir) not in sys.path:
    sys.path.insert(0, str(_help_pkg_dir))

from dfa_help_service.api.routes import (  # noqa: E402
    router as help_router,
    get_help_service as _help_dep_placeholder,
)
from dfa_help_service.core.services import HelpService  # noqa: E402
from apps.app_db.services.help_storage import SQLAlchemyHelpStorage

_logger = logging.getLogger(__name__)

def _pkcs8_b64(value: str) -> str:
    """Accept a PKCS#8 private key as raw base64 or PEM; return the bare base64 body."""
    value = value.strip().strip("\"'").replace("\\n", "\n")
    lines = [ln.strip() for ln in value.splitlines() if ln.strip() and not ln.startswith("-----")]
    return "".join(lines)


# Development-only Swagger app-client credentials (see docs/APP_CLIENT_AUTH.md §9.2).
# Private keys come from DFA_*_API_SIGNING_PRIVATE_KEY; clients without one are not auto-signed.
_SWAGGER_DEV_CLIENTS: dict[str, dict[str, str]] = {
    api_key: {"app_key": app_key, "pkcs8_b64": _pkcs8_b64(private_key)}
    for api_key, app_key, private_key in (
        (settings.DFA_DM_FED_APP_API_KEY, settings.DFA_DM_APP_KEY, settings.DFA_DM_API_SIGNING_PRIVATE_KEY),
        (settings.DFA_VIZ_FED_APP_API_KEY, settings.DFA_VIZ_APP_KEY, settings.DFA_VIZ_API_SIGNING_PRIVATE_KEY),
        (settings.DFA_DASH_FED_APP_API_KEY, settings.DFA_DASH_APP_KEY, settings.DFA_DASH_API_SIGNING_PRIVATE_KEY),
    )
    if _pkcs8_b64(private_key or "")
}
_SWAGGER_DEV_DEFAULT_API_KEY = (
    settings.DFA_DM_FED_APP_API_KEY
    if settings.DFA_DM_FED_APP_API_KEY in _SWAGGER_DEV_CLIENTS
    else next(iter(_SWAGGER_DEV_CLIENTS), settings.DFA_DM_FED_APP_API_KEY)
)
_SWAGGER_DEV_API_KEY_HINT = ", ".join(
    f"{api_key} ({meta['app_key']})"
    for api_key, meta in _SWAGGER_DEV_CLIENTS.items()
) or "none (set DFA_*_API_SIGNING_PRIVATE_KEY to enable)"


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    # Start background job poller (DB mode only)
    poller_task = None
    mq = str(settings.BG_JOB_MQ_TYPE).strip().upper()
    if mq == "DB" and settings.BG_JOB_POLLER_ENABLED:
        from apps.shared.services.bg_job_poller import bg_job_poller_loop

        poller_task = asyncio.create_task(bg_job_poller_loop())
        _logger.info(
            "Started system_bg_job_queue poller (interval=%ss) poller_task=%s",
            settings.BG_JOB_POLL_INTERVAL_SEC,
            poller_task,
        )

    # Initialise persistent ProcessPoolExecutor for parallel XLSX export.
    # Workers are created on first submit; max_tasks_per_child=1 recycles each
    # subprocess after one chunk so memory does not grow across exports.
    from apps.shared.utils.export_pool import init_export_pool
    init_export_pool()

    yield

    if poller_task is not None:
        poller_task.cancel()
        try:
            await poller_task
        except asyncio.CancelledError:
            pass
        _logger.info("Stopped system_bg_job_queue poller")

    from apps.shared.utils.export_pool import shutdown_export_pool
    shutdown_export_pool()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    openapi_url="/openapi.json",
    docs_url=None,       # disabled — served via custom route below (for preauthorizeApiKey default)
    redoc_url="/redoc",
    tags_metadata=[
        {
            "name": "Health",
            "description": "Health check and API information endpoints",
        },
        {
            "name": "System Datawarehouses",
            "description": "Data warehouse creation and management endpoints",
        },
        {
            "name": "Data Warehouse",
            "description": "Data Warehouse application endpoints",
            "externalDocs": {
                "description": "Data Warehouse App Documentation",
            },
        },
        {
            "name": "Data Warehouse - Indicators",
            "description": "Indicator CRUD operations for data warehouses",
        },
        {
            "name": "Data Warehouse - Search",
            "description": "Smart search API for keywords (indicators, areas, subgroups, time periods)",
        },
        {
            "name": "Gallery",
            "description": "Per-user gallery (charts and tables)",
        },
        {
            "name": "Cache",
            "description": "Cache management (e.g. clear Redis cache)",
        },
        {
            "name": "Compute Engine - Formula Settings",
            "description": "Create, update, and delete TOTAL / PERCENT / MINUS / TIME formula configurations for a data warehouse.",
        },
        {
            "name": "Compute Engine - Process Management",
            "description": "Define compute processes, trigger executions against selected time periods and areas, and monitor or cancel running jobs.",
        },
        {
            "name": "Compute Engine - Execution Logs",
            "description": "Browse paginated execution logs, inspect job-level detail records, sync progress counters, and export results.",
        },
        {
            "name": "Insights",
            "description": "AI chart insights (OpenAI) via POST /dw/{dw_id}/insights",
        },
        {
            "name": "Logs",
            "description": "System audit logs — server errors (logs_server_error) and user transaction audit trail (logs_transaction).",
        },
        {"name": "Dashboard", "description": "Dashboard metadata CRUD, clone, publish, and name validation."},
        {"name": "Dashboard - Sections", "description": "Layout section management within a dashboard."},
        {"name": "Dashboard - Visualizations", "description": "Visualization CRUD and layout placement (backed by system_gallery + dash_gallery)."},
        {"name": "Dashboard - Themes", "description": "Header/footer theme management stored in system_configuration."},
        {"name": "Dashboard - Embed", "description": "Embed VO creation, tracking, and per-IP/domain view counters."},
        {"name": "Dashboard - User Areas", "description": "Per-dashboard user area ACL (stored in iam_user_role_content)."},
        {"name": "Dashboard - AI Analysis", "description": "AI-powered chart insights — cached per visualization + area combination."},
    ],
    lifespan=app_lifespan,
)


def custom_openapi():
    """Custom OpenAPI schema generator"""
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description=settings.DESCRIPTION,
        routes=app.routes,
    )
    openapi_schema.setdefault("components", {})["securitySchemes"] = {
        "OAuth2PasswordBearer": {
            "type": "oauth2",
            "flows": {
                "password": {
                    "tokenUrl": "/auth/swagger-login",
                    "scopes": {}
                }
            }
        },
        "ApiKeyHeader": {
            "type": "apiKey",
            "in": "header",
            "name": "X-Api-Key",
            "description": (
                "App client API key — required for APP_CLIENT+ routes. "
                "Enter the api_key value from system_application_client. "
                f"Development Swagger auto-signs for: {_SWAGGER_DEV_API_KEY_HINT}."
            ),
        },
        "ApiTimestampHeader": {
            "type": "apiKey",
            "in": "header",
            "name": "X-Api-Timestamp",
            "description": "Unix timestamp (seconds). Auto-set in development Swagger.",
        },
        "ApiSignatureHeader": {
            "type": "apiKey",
            "in": "header",
            "name": "X-Api-Signature",
            "description": "Base64 Ed25519 signature of METHOD\\nPATH?QUERY\\nTIMESTAMP. Auto-set in development Swagger.",
        },
    }

    # Single security object = AND — Bearer + app-client headers sent together on Try it out.
    _swagger_security = {
        "OAuth2PasswordBearer": [],
        "ApiKeyHeader": [],
        "ApiTimestampHeader": [],
        "ApiSignatureHeader": [],
    }
    for path_item in openapi_schema.get("paths", {}).values():
        for operation in path_item.values():
            if isinstance(operation, dict):
                operation["security"] = [_swagger_security]
    _IUS_SCOPE_ENUM = ["ALL", "MAPPED", "UNMAPPED", "HAS_DATA", "NO_DATA", "DEFAULT"]
    scope_schema = {"type": "string", "enum": _IUS_SCOPE_ENUM, "nullable": True}
    for path, path_item in openapi_schema.get("paths", {}).items():
        if not path.endswith("/ius"):
            continue
        get_op = path_item.get("get")
        if not isinstance(get_op, dict):
            continue
        for p in get_op.get("parameters") or []:
            if isinstance(p, dict) and p.get("name") == "scope" and p.get("in") == "query":
                p["schema"] = scope_schema
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/docs", include_in_schema=False)
async def swagger_ui_html() -> HTMLResponse:
    """
    Custom Swagger UI that pre-fills app-client auth in development:
    X-Api-Key, X-Api-Timestamp, and X-Api-Signature (Ed25519, per request).
    """
    html = get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{settings.PROJECT_NAME} - Swagger UI",
        swagger_ui_parameters={"persistAuthorization": True},
    )
    body = html.body.decode("utf-8")

    if settings.ENVIRONMENT == "development" and _SWAGGER_DEV_CLIENTS:
        clients_json = json.dumps(_SWAGGER_DEV_CLIENTS)
        signing_script = f"""
<script>
(function () {{
  window.__dfaSwaggerDevDefaultApiKey = {json.dumps(_SWAGGER_DEV_DEFAULT_API_KEY)};
  window.__dfaSwaggerDevClients = {clients_json};
  var _keyPromises = {{}};

  function _b64ToBytes(b64) {{
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }}

  function _bytesToB64(bytes) {{
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }}

  function _resolveApiKey(req) {{
    var h = req.headers || {{}};
    var fromHeader = h["X-Api-Key"] || h["x-api-key"];
    if (fromHeader) return fromHeader;
    try {{
      var auth = window.ui.getState().get("auth").get("authorized");
      var fromAuth = auth && auth.getIn && auth.getIn(["ApiKeyHeader", "value"]);
      if (fromAuth) return fromAuth;
    }} catch (e) {{}}
    return window.__dfaSwaggerDevDefaultApiKey;
  }}

  function _getSigningKey(pkcs8B64) {{
    if (!_keyPromises[pkcs8B64]) {{
      _keyPromises[pkcs8B64] = crypto.subtle.importKey(
        "pkcs8",
        _b64ToBytes(pkcs8B64),
        {{ name: "Ed25519" }},
        false,
        ["sign"]
      );
    }}
    return _keyPromises[pkcs8B64];
  }}

  window.__dfaSwaggerSignRequest = async function (req) {{
    var apiKey = _resolveApiKey(req);
    var client = window.__dfaSwaggerDevClients[apiKey];
    if (!client) {{
      console.warn(
        "Swagger signing skipped — unknown X-Api-Key:",
        apiKey,
        "(known:",
        Object.keys(window.__dfaSwaggerDevClients).join(", "),
        ")"
      );
      return req;
    }}
    var url = new URL(req.url, window.location.origin);
    var pathWithQuery = url.pathname + (url.search || "");
    var method = (req.method || "GET").toUpperCase();
    var timestamp = String(Math.floor(Date.now() / 1000));
    var stringToSign = method + "\\n" + pathWithQuery + "\\n" + timestamp;
    var key = await _getSigningKey(client.pkcs8_b64);
    var sig = await crypto.subtle.sign(
      "Ed25519",
      key,
      new TextEncoder().encode(stringToSign)
    );
    req.headers = req.headers || {{}};
    req.headers["X-Api-Key"] = apiKey;
    req.headers["X-Api-Timestamp"] = timestamp;
    req.headers["X-Api-Signature"] = _bytesToB64(new Uint8Array(sig));
    return req;
  }};
}})();
</script>
"""
        body = body.replace(
            "    <script>\n    const ui = SwaggerUIBundle({",
            signing_script + "    <script>\n    const ui = window.ui = SwaggerUIBundle({",
        )
        body = body.replace(
            '"persistAuthorization": true,\n',
            '"persistAuthorization": true,\n'
            "    requestInterceptor: function (req) {\n"
            "      return window.__dfaSwaggerSignRequest(req);\n"
            "    },\n"
            "    onComplete: function () {\n"
            "      if (window.ui.preauthorizeApiKey) {\n"
            "        window.ui.preauthorizeApiKey(\n"
            '          "ApiKeyHeader", window.__dfaSwaggerDevDefaultApiKey\n'
            "        );\n"
            "      }\n"
            "      if (window.ui.authActions && window.ui.authActions.logout) {\n"
            "        window.ui.authActions.logout([\n"
            '          "ApiTimestampHeader", "ApiSignatureHeader"\n'
            "        ]);\n"
            "      }\n"
            "    },\n",
        )
    return HTMLResponse(content=body)


# Setup middleware
setup_logging()
setup_exception_handlers(app)

# Session middleware (required by authlib for OIDC state/PKCE storage)
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# Add request context middleware for database logging
from apps.shared.middleware.request_context import RequestContextMiddleware
app.add_middleware(RequestContextMiddleware)

# IAM access control — resolves each route's access level and enforces
# PUBLIC / APP_CLIENT / AUTHENTICATED / PERMISSION rules.
from apps.shared.middleware.auth_middleware import AccessControlMiddleware
app.add_middleware(AccessControlMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include application routers with prefixes
# Tags are defined at the endpoint level for hierarchical organization
app.include_router(
    core_router,
    prefix=""
)

app.include_router(
    datawarehouse_router,
    prefix=""
)

app.include_router(dashboard_router, prefix="")

app.include_router(cache_router, prefix="")

from apps.shared.config.dependencies import get_db

# SSO — package-based wiring (dfa_sso_service)
# Routers are ALWAYS mounted; runtime SSO_ENABLED check is in each handler.
from apps.shared.packages.dfa_sso_service import SsoConfig, SsoService, initialize_tables
from apps.shared.packages.dfa_sso_service.core.config import get_sso_enabled
from apps.shared.packages.dfa_sso_service.core.discovery import SsoConfigError
from apps.shared.packages.dfa_sso_service.storage.sqlalchemy_storage import SqlAlchemySsoStorage
from apps.shared.packages.dfa_sso_service.adapters.fastapi import (
    create_sso_auth_router,
    create_sso_admin_router,
    get_sso_service as _sso_dep_placeholder,
    get_sso_user_id as _sso_user_id_placeholder,
    is_sso_enabled as _sso_enabled_placeholder,
)
from apps.app_db.services.sso_user_provider import DfaUserProvider
from apps.app_db.dependencies import get_app_key, get_current_user_id


_SSO_CALLBACK_PATH = "/auth/sso/callback"


def _get_sso_service(db=Depends(get_db)) -> SsoService:
    def _resolve_callback_url(ak: str) -> str:
        from apps.app_db.models.core import SystemApplicationClient

        row = (
            db.query(SystemApplicationClient)
            .filter(
                SystemApplicationClient.app_key == ak,
                SystemApplicationClient.app_type == "FED",
                SystemApplicationClient.status == "ACTIVE",
            )
            .order_by(SystemApplicationClient.id.asc())
            .first()
        )
        if row and row.origin_url:
            origin = row.origin_url.split(",")[0].strip().rstrip("/")
            if origin:
                return f"{origin}{_SSO_CALLBACK_PATH}"

        raise SsoConfigError(
            f"No origin_url configured for FED application '{ak}'. "
            "Set system_application_client.origin_url for this app_key."
        )

    def _check_sso_enabled(ak: str) -> bool:
        return get_sso_enabled(db, ak)

    def _resolve_provisioning_dw_id(
        return_to: str | None, app_key: str | None
    ) -> int | None:
        from apps.app_db.utils.sso_provisioning import extract_provisioning_dw_id

        return extract_provisioning_dw_id(return_to, app_key, db=db)

    config = SsoConfig(
        encryption_key=settings.PASSWORD_ENCRYPTION_KEY,
        callback_url_resolver=_resolve_callback_url,
        sso_enabled_checker=_check_sso_enabled,
        provisioning_dw_id_resolver=_resolve_provisioning_dw_id,
    )
    storage = SqlAlchemySsoStorage(db)
    user_provider = DfaUserProvider(db)
    return SsoService(storage=storage, user_provider=user_provider, config=config)


def _is_sso_enabled(db=Depends(get_db), app_key=Depends(get_app_key)) -> bool:
    return get_sso_enabled(db, app_key or settings.DEFAULT_APP_KEY)


app.dependency_overrides[_sso_dep_placeholder] = _get_sso_service
app.dependency_overrides[_sso_user_id_placeholder] = get_current_user_id
app.dependency_overrides[_sso_enabled_placeholder] = _is_sso_enabled
app.include_router(create_sso_auth_router(), prefix="")
app.include_router(create_sso_admin_router(), prefix="")

from apps.shared.packages.dfa_sso_service.core.claims import SsoClaimError
from apps.shared.middleware.error_handler import _emit
from apps.shared.utils.log_payload import stack_trace_from_exc
from apps.shared.utils.response import error_response
from fastapi import Request as _Request


@app.exception_handler(SsoClaimError)
async def _sso_claim_error(request: _Request, exc: SsoClaimError):
    msg = str(exc)
    status_code = getattr(exc, "http_status", 400)
    error_code = getattr(exc, "error_code", "SSO_CLAIM_ERROR")
    _emit(
        request,
        status_code=status_code,
        message=msg,
        error_code=error_code,
        exc=exc,
        stack_trace=stack_trace_from_exc(exc),
    )
    return error_response(
        message=msg,
        status_code=status_code,
        errors={"code": error_code},
    )


@app.exception_handler(SsoConfigError)
async def _sso_config_error(request: _Request, exc: SsoConfigError):
    msg = str(exc)
    status_code = getattr(exc, "http_status", 400)
    error_code = getattr(exc, "error_code", "SSO_CONFIG_ERROR")
    _emit(
        request,
        status_code=status_code,
        message=msg,
        error_code=error_code,
        exc=exc,
        stack_trace=stack_trace_from_exc(exc),
    )
    return error_response(
        message=msg,
        status_code=status_code,
        errors={"code": error_code},
    )

# Initialize SSO tables (create_all + seed default identity providers)
try:
    from sqlalchemy import create_engine as _sso_create_engine
    _sso_engine = _sso_create_engine(settings.get_database_url())
    initialize_tables(_sso_engine)
    _sso_engine.dispose()
except Exception as _sso_init_err:
    _logger.warning("SSO table initialization failed: %s", _sso_init_err)

# DFA Help Service — wire SQLAlchemy storage and mount at /help
def _get_help_service(db=Depends(get_db)) -> HelpService:
    storage = SQLAlchemyHelpStorage(db)
    return HelpService(storage)

app.dependency_overrides[_help_dep_placeholder] = _get_help_service
app.include_router(help_router, prefix="/help", tags=["dfa-help-service"])

# Initialize DFA Mailer (creates dfa_email_templates / dfa_email_logs in the core DB and mounts routers)
# Allow app to start even if DB connection fails (for debugging connectivity issues)
try:
    from apps.shared.services.dfa_mailer import init_mailer
    init_mailer(app, force_seed=True)
except Exception as e:
    print(f"WARNING: DFA Mailer initialization failed: {e}")
    print("Application will continue to start, but email functionality may not work.")
    print("This is expected if the database is not yet reachable.")
    import logging as _logging
    _logging.getLogger(__name__).warning("DFA Mailer initialization failed: %s", e, exc_info=True)


@app.get(
    "/",
    tags=["Health"],
    summary="API Information",
    description="Get API information and version details",
    response_description="API information including version and documentation links"
)
async def root():
    """
    Root endpoint that returns API information.
    
    Returns:
        - API version
        - Documentation links
    """
    from apps.shared.utils.response import success_response
    return success_response(
        message="DFA Toolkit API",
        data={
            "version": settings.VERSION,
            "docs": "/docs"
        }
    )


@app.get(
    "/health",
    tags=["Health"],
    summary="Health Check",
    description="Check if the API service is running and healthy",
    response_description="Health status of the service"
)
async def health():
    """
    Health check endpoint to verify service status.
    
    Returns:
        - Service health status
    """
    from apps.shared.utils.response import success_response
    return success_response(
        message="Service is healthy",
        data={"status": "healthy"}
    )
