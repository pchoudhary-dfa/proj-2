from typing import Optional, List

from fastapi import FastAPI
from fastapi.routing import APIRouter

from dfa_mailer_service.core.config import EmailConfig
from dfa_mailer_service.adapters.fastapi_adapter import FastAPIAdapter


def create_router(config: Optional[EmailConfig] = None) -> APIRouter:
    """
    Create a single APIRouter that contains all DFA Mailer routes.

    This is the main entry point for FastAPI integration when the host
    application wants to include routers manually.
    """
    adapter = FastAPIAdapter(config=config or EmailConfig.from_env())
    routers: List[APIRouter] = adapter.create_routers()
    root = APIRouter()
    for router in routers:
        root.include_router(router)
    return root


def mount(app: FastAPI, config: Optional[EmailConfig] = None) -> None:
    """
    Mount DFA Mailer routes on the given FastAPI app with a single call.

    Example:
        from dfa_mailer_service.adapters.fastapi import mount
        from dfa_mailer_service.core.config import EmailConfig

        app = FastAPI()
        mount(app, EmailConfig.from_env())
    """
    effective_config = config or EmailConfig.from_env()
    router = create_router(effective_config)
    prefix = getattr(effective_config, "api_prefix", "/dfa-mailer")
    app.include_router(router, prefix=prefix)


