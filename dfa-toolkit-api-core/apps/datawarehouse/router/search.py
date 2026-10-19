"""
Search Router

Provides the smart search endpoint for querying DW search tables.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, Path, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from apps.shared.config.dependencies import get_optional_user
from apps.datawarehouse.db.datawarehouse import get_dw_db
from apps.shared.schemas.response import SuccessResponse
from apps.shared.schemas.search import (
    KeywordTypeEnum,
    SearchResponseData,
    SearchResponseMeta,
    SearchResultItem,
)
from apps.datawarehouse.services.search import SearchContext, SearchService
from apps.shared.utils.ngrams import generate_trigrams
from apps.shared.utils.response import success_response
from apps.shared.utils.text import normalize_text
from apps.shared.utils.cache import cache_get, cache_set
from apps.datawarehouse.constants import PATH_DW_ID, QUERY_Q, QUERY_KEYWORD_TYPES, QUERY_LIMIT
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.app_db.db.core import SessionLocal
from apps.shared.services.bg_job_dispatch import (
    JOB_TYPE_SYNC_SEARCH_INDEX,
    dispatch_bg_job,
)
from apps.shared.services.bg_job_status_service import (
    find_active_sync_search_job,
    get_celery_task_status,
    get_db_job_status,
)
from apps.shared.exceptions import BadRequest, Conflict
from apps.shared.config.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Data Warehouse - Search"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/search")

# Singleton service instance (stateless, safe to share)
_search_service = SearchService()

# Default language code if Accept-Language header is missing or invalid
DEFAULT_LANGUAGE_CODE = "en"


def parse_accept_language(accept_language: Optional[str]) -> str:
    """
    Parse Accept-Language header and extract the primary language code.
    
    Handles formats like:
    - "en"
    - "en-US"
    - "en-US,en;q=0.9,fr;q=0.8"
    
    Returns:
        2-3 character language code (e.g., "en", "fr")
    """
    if not accept_language:
        return DEFAULT_LANGUAGE_CODE
    
    # Take the first language (highest priority)
    # Format: "en-US,en;q=0.9" -> take "en-US"
    first_lang = accept_language.split(",")[0].strip()
    
    # Remove quality factor if present: "en;q=0.9" -> "en"
    first_lang = first_lang.split(";")[0].strip()
    
    # Extract base language: "en-US" -> "en"
    base_lang = first_lang.split("-")[0].strip().lower()
    
    # Validate: must be 2-3 alphabetic chars
    if len(base_lang) >= 2 and len(base_lang) <= 3 and base_lang.isalpha():
        return base_lang[:3]
    
    return DEFAULT_LANGUAGE_CODE


@router.get(
    "",
    summary="Smart search across keywords",
    description="""
Search for keywords (indicators, areas, subgroups, time periods) using smart/semantic matching.

The search uses a two-phase strategy:
- Exact canonical matching for precise queries
- Trigram-based fuzzy matching for typo tolerance
- Synonym fallback for abbreviations (e.g., "IMR" → "Infant Mortality Rate")

Results are ranked by relevance: exact matches > abbreviations > fuzzy matches.

**Language**: Determined from the `Accept-Language` header (defaults to "en").

**Meta**: `meta.count` is the number of results returned; `meta.limit` is the applied `limit` query parameter.
    """,
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def search(
    dw_id: str = Path(
        ...,
        description="Data warehouse identifier",
        examples=["dw_default"],
        alias=PATH_DW_ID,
    ),
    q: str = Query(
        ...,
        min_length=3,
        max_length=255,
        description="Search query string (min 3 chars)",
        examples=["GDP", "mortality rate", "IMR"],
        alias=QUERY_Q,
    ),
    keyword_types: Optional[List[KeywordTypeEnum]] = Query(
        default=None,
        description="Optional filter for specific keyword types",
        alias=QUERY_KEYWORD_TYPES,
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
        description="Maximum number of results to return (1-100)",
        alias=QUERY_LIMIT,
    ),
    accept_language: Optional[str] = Header(
        default=None,
        alias="Accept-Language",
        description="Language preference (e.g., 'en-US,en;q=0.9')",
    ),
    dw_db: Session = Depends(get_dw_db),
    user: Optional[dict] = Depends(get_optional_user),
):
    # Parse language from Accept-Language header
    language_code = parse_accept_language(accept_language)
    
    # Normalize query using same logic as indexing
    normalized_query = normalize_text(q)
    
    # Handle empty normalized query
    if not normalized_query:
        empty_payload = SearchResponseData(results=[]).model_dump()
        return success_response(
            message="Search completed",
            data=empty_payload,
            meta=SearchResponseMeta(count=0, limit=limit).model_dump(),
        )

    # Cache key: dw_id, normalized query, language, keyword_types, limit
    keyword_types_str = ",".join(sorted(t.value for t in keyword_types)) if keyword_types else "all"
    cache_key = f"dw:search:{dw_id}:{normalized_query}:{language_code}:{keyword_types_str}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)
    
    # Generate trigrams for fuzzy matching
    query_trigrams = generate_trigrams(normalized_query)
    
    # Build search context
    context = SearchContext(
        query=q,
        normalized_query=normalized_query,
        query_trigrams=frozenset(query_trigrams),
        language_code=language_code,
        keyword_types=tuple(keyword_types) if keyword_types else None,
        limit=limit,
    )
    
    # Execute search
    candidates = _search_service.search(dw_db, context)
    
    # Transform to response format: keywordId is entity id (indicator_nid, area_nid, etc.)
    # so the frontend can link to the actual entity, not search_keywords.id
    results = [
        SearchResultItem(
            keywordId=c.entity_id,
            keywordType=c.keyword_type,
            displayText=c.canonical_text,
        )
        for c in candidates
    ]
    
    payload = SearchResponseData(results=results).model_dump()
    meta = SearchResponseMeta(count=len(results), limit=limit).model_dump()
    body = {
        "success": True,
        "message": "Search completed",
        "data": payload,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Search completed",
        data=payload,
        meta=meta,
    )


@router.post(
    "/sync",
    summary="Sync search index (create tables + rebuild)",
    description=(
        "Dispatches a background job that ensures search tables exist and "
        "rebuilds the full search index from UT data. Requires authenticated user."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def sync_search_index(
    dw_id: str = Path(
        ...,
        description="Data warehouse identifier",
        examples=["dw_default"],
        alias=PATH_DW_ID,
    ),
    user: Optional[dict] = Depends(get_optional_user),
):
    job_payload = {"dw_id": dw_id}
    with SessionLocal() as core_db:
        # Optional: prevent duplicate jobs in DB mode
        if settings.BG_JOB_MQ_TYPE == "DB":
            active_job = find_active_sync_search_job(core_db, dw_id)
            if active_job:
                raise Conflict(
                    f"Search sync is already in progress (job_id={active_job['db_job_id']})"
                )

        result = dispatch_bg_job(
            db=core_db,
            job_type=JOB_TYPE_SYNC_SEARCH_INDEX,
            payload=job_payload,
            dw_id=dw_id,
        )
    logger.info("Search sync job dispatched for dw_id=%s result=%s", dw_id, result)
    return success_response(
        message="Search sync job has been queued",
        data={
            "dw_id": dw_id,
            "job_type": JOB_TYPE_SYNC_SEARCH_INDEX,
            "db_job_id": result.db_job_id,
            "celery_task_id": result.celery_task_id,
        },
        status_code=status.HTTP_202_ACCEPTED,
    )


@router.get(
    "/sync/status",
    summary="Poll search sync job status",
    description=(
        "Query the status of a background search sync job. "
        "Accepts either db_job_id (DB mode) or celery_task_id (Celery mode). "
        "Returns job_status: pending | processing | completed | failed."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def get_sync_status(
    dw_id: str = Path(
        ...,
        description="Data warehouse identifier",
        examples=["dw_default"],
        alias=PATH_DW_ID,
    ),
    db_job_id: Optional[int] = Query(
        default=None,
        description="DB job queue ID (for BG_JOB_MQ_TYPE=DB)",
    ),
    celery_task_id: Optional[str] = Query(
        default=None,
        description="Celery task UUID (for BG_JOB_MQ_TYPE=CELERY)",
    ),
    user: Optional[dict] = Depends(get_optional_user),
):
    if not db_job_id and not celery_task_id:
        raise BadRequest("Either db_job_id or celery_task_id is required")

    if db_job_id and celery_task_id:
        raise BadRequest("Provide only one of db_job_id or celery_task_id, not both")

    if db_job_id:
        with SessionLocal() as core_db:
            status_data = get_db_job_status(
                core_db,
                job_id=db_job_id,
                dw_id=dw_id,
                job_type=JOB_TYPE_SYNC_SEARCH_INDEX,
            )
    else:
        status_data = get_celery_task_status(celery_task_id)
        # Add job_type for consistency
        status_data["job_type"] = JOB_TYPE_SYNC_SEARCH_INDEX

    return success_response(
        message="Job status retrieved",
        data=status_data,
    )


@router.get(
    "/sync/active",
    summary="Get active search sync job",
    description=(
        "Returns the currently active search sync job for this warehouse, if any. "
        "Used to resume UI polling after page refresh. DB mode only."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def get_active_sync_job(
    dw_id: str = Path(
        ...,
        description="Data warehouse identifier",
        examples=["dw_default"],
        alias=PATH_DW_ID,
    ),
    user: Optional[dict] = Depends(get_optional_user),
):
    if settings.BG_JOB_MQ_TYPE != "DB":
        return success_response(
            message="Active job lookup only available in DB mode",
            data=None,
        )

    with SessionLocal() as core_db:
        active_job = find_active_sync_search_job(core_db, dw_id)

    return success_response(
        message="Active job retrieved" if active_job else "No active job",
        data=active_job,
    )
