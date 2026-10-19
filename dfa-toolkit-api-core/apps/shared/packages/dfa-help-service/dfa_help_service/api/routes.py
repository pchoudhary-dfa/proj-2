"""
API routes for DFA Help Service.
"""

import json
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from .schemas import (
    AdaptationKeyRequest, KeyUpdateRequest,
    AdaptationResponse, KeyResponse, KeyDataResponse,
    APIResponse, ErrorResponse, StandardAPIResponse,
    AdaptationsResponse, KeysResponse, KeyDataDetailResponseWrapper,
    DeleteKeyResponse, UpdateKeyResponse, KeyResponseWithChildren,
    RelatedKeyResponse, TranslationResponse, KeyDataDetailResponse
)
from ..core.services import HelpService
from ..core.models import AdaptationKey

# Create router
router = APIRouter(prefix="/api", tags=["dfa-help-service"])

# ------------------------------------------------------------------
# Dependency injection — override via app.dependency_overrides[get_help_service]
# to provide a real storage-backed HelpService in production.
# ------------------------------------------------------------------

def get_help_service() -> HelpService:
    """
    FastAPI dependency placeholder.
    The host application MUST override this via app.dependency_overrides
    to inject a properly configured HelpService instance.
    """
    raise RuntimeError(
        "Help service not configured. "
        "Override get_help_service via app.dependency_overrides."
    )


@router.get("/adaptations", response_model=AdaptationsResponse)
async def get_adaptations(
    help_service: HelpService = Depends(get_help_service)
):
    """
    Get all adaptations.
    
    Returns:
        List of all available adaptations
    """
    try:
        adaptations = help_service.get_adaptations()
        
        # Convert to response models
        adaptations_data = []
        for adaptation in adaptations:
            adaptations_data.append(AdaptationResponse(
                id=adaptation.id,
                code=adaptation.code,
                name=adaptation.name,
                desc=adaptation.desc,
                created_at=adaptation.created_at.isoformat() if adaptation.created_at else None,
                updated_at=adaptation.updated_at.isoformat() if adaptation.updated_at else None
            ))
        
        return AdaptationsResponse(
            data=adaptations_data,
            message="Adaptations retrieved successfully",
            status=200,
            success=True
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keys/{adaptation_id}", response_model=KeysResponse)
async def get_adaptation_keys(
    adaptation_id: int,
    help_service: HelpService = Depends(get_help_service)
):
    """
    Get all keys for a specific adaptation as a hierarchical tree.

    When a single canonical ``*_ROOT`` key exists, its children are returned
    at the top level so Help Admin does not show a redundant adaptation node.
    Otherwise root keys (parent_id is None) appear at the top level.
    """
    try:
        all_keys = help_service.get_adaptation_keys(adaptation_id)

        # Pre-fetch i18n titles for all keys in one pass (keyed by key id).
        titles_by_id: dict[int, str] = {}
        for key in all_keys:
            i18n_data = help_service.storage.get_key_i18n_data(key.id)
            if i18n_data:
                en_i18n = next((i for i in i18n_data if i.locale == "en"), None)
                titles_by_id[key.id] = (en_i18n.title or "") if en_i18n else ""
            else:
                titles_by_id[key.id] = ""

        def _parse_related_keys(raw: str | None) -> list[RelatedKeyResponse]:
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
                if not isinstance(parsed, list):
                    return []
                out: list[RelatedKeyResponse] = []
                for item in parsed:
                    if isinstance(item, dict) and "key" in item:
                        out.append(RelatedKeyResponse(key=item["key"]))
                    elif isinstance(item, str):
                        out.append(RelatedKeyResponse(key=item))
                return out
            except Exception:
                return []

        def _build_node(key_obj) -> KeyResponseWithChildren:
            children = [
                _build_node(child)
                for child in all_keys
                if child.parent_id == key_obj.id
            ]
            return KeyResponseWithChildren(
                id=key_obj.id,
                key=key_obj.key,
                parent_id=key_obj.parent_id,
                title=titles_by_id.get(key_obj.id, ""),
                code=key_obj.code,
                related_keys=_parse_related_keys(key_obj.related_keys),
                children=children,
            )

        root_keys = [k for k in all_keys if not k.parent_id]
        if (
            len(root_keys) == 1
            and root_keys[0].key
            and str(root_keys[0].key).endswith("_ROOT")
        ):
            top_nodes = [
                _build_node(child)
                for child in all_keys
                if child.parent_id == root_keys[0].id
            ]
        else:
            top_nodes = [_build_node(k) for k in root_keys]

        return KeysResponse(
            data=top_nodes,
            message="Keys retrieved successfully",
            status=200,
            success=True,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keydata/{key_id}", response_model=KeyDataDetailResponseWrapper)
async def get_key_data(
    key_id: str,
    help_service: HelpService = Depends(get_help_service)
):
    """
    Get detailed information for a specific key.
    
    Accepts either a numeric ID or a string help-key (e.g. 'DM-DATAWAREHOUSE-INDICATORS').
    
    Args:
        key_id: Numeric ID or string key identifier
        
    Returns:
        Detailed key data including translations
    """
    try:
        # Try numeric ID first; fall back to string key lookup
        if key_id.isdigit():
            key_data = help_service.get_key_data(int(key_id))
        else:
            key_obj = help_service.storage.get_key_by_string(key_id)
            if not key_obj:
                raise ValueError(f"Key '{key_id}' not found")
            key_data = help_service.get_key_data(key_obj.id)
        
        # Convert to new response format
        translations = []
        for i18n in key_data.i18n_data:
            translations.append(TranslationResponse(
                locale=i18n.locale,
                title=i18n.title,
                desc=i18n.desc,
                purpose=i18n.purpose
            ))
        
        # Build related keys with translations (if related_keys JSON is present)
        related_keys_enriched: List[RelatedKeyResponse] = []
        try:
            if key_data.key.related_keys:
                parsed_related = json.loads(key_data.key.related_keys)
                if isinstance(parsed_related, list):
                    for rel in parsed_related:
                        # Determine related key identifier string
                        if isinstance(rel, dict) and 'key' in rel:
                            rel_key_str = rel['key']
                        elif isinstance(rel, str):
                            rel_key_str = rel
                        else:
                            continue

                        # Find the related key by its `key` string within same adaptation
                        related_key_obj: AdaptationKey | None = next(
                            (k for k in help_service.storage.get_adaptation_keys(key_data.key.adaptation_id)
                             if k.key == rel_key_str),
                            None
                        )

                        translations: List[TranslationResponse] = []
                        if related_key_obj:
                            # Fetch i18n for related key and map to TranslationResponse (locale/title only for brevity)
                            rel_i18n_list = help_service.storage.get_key_i18n_data(related_key_obj.id)
                            for rel_i18n in rel_i18n_list:
                                translations.append(TranslationResponse(
                                    locale=rel_i18n.locale,
                                    title=rel_i18n.title
                                ))

                        related_keys_enriched.append(RelatedKeyResponse(
                            key=rel_key_str,
                            translations=translations
                        ))
        except Exception:
            # Silently ignore parsing/lookup errors; keep related_keys empty
            related_keys_enriched = []

        response_data = KeyDataDetailResponse(
            id=key_data.key.id,
            code=key_data.key.code,
            key=key_data.key.key,
            parentKey=key_data.key.key,  # TODO: Implement parent key logic
            parent_id=key_data.key.parent_id,
            title="",  # TODO: Get title from i18n
            translations=translations,
            related_keys=related_keys_enriched
        )
        
        return KeyDataDetailResponseWrapper(
            data=response_data,
            message="Key Data retrieved successfully",
            status=200,
            success=True
        )
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create", response_model=KeyResponse)
async def create_key(
    request: AdaptationKeyRequest,
    help_service: HelpService = Depends(get_help_service)
):
    """
    Create a new key.
    
    Args:
        request: Key creation request data
        
    Returns:
        Created key information
    """
    try:
        key = help_service.create_key(request.dict())
        return KeyResponse(
            id=key.id,
            adaptation_id=key.adaptation_id,
            key=key.key,
            code=key.code,
            related_keys=[],
            parent_id=key.parent_id,
            created_at=key.created_at.isoformat() if key.created_at else None,
            updated_at=key.updated_at.isoformat() if key.updated_at else None
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/update/{key_id}", response_model=UpdateKeyResponse)
async def update_key(
    key_id: int,
    request: KeyUpdateRequest,
    help_service: HelpService = Depends(get_help_service)
):
    """
    Update key data.
    
    Args:
        key_id: ID of the key to update
        request: Key update request data
        
    Returns:
        Updated key information
    """
    try:
        # Set the ID from path parameter
        request.id = key_id
        
        key = help_service.update_key(request.dict())
        
        key_details = {
            "id": key.id,
            "code": key.code,
            "key": key.key,
            "parent_id": key.parent_id,
            "related_keys": key.related_keys,
            "title": ""  # TODO: Get title from i18n
        }
        
        return UpdateKeyResponse(
            data={"key_details": key_details},
            message="Key updated successfully",
            status=200,
            success=True
        )
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{key_id}", response_model=DeleteKeyResponse)
async def delete_key(
    key_id: int,
    help_service: HelpService = Depends(get_help_service)
):
    """
    Delete a key.
    
    Args:
        key_id: ID of the key to delete
        
    Returns:
        Success response
    """
    try:
        # Get key details before deletion
        key = help_service.storage.get_key(key_id)
        if not key:
            raise HTTPException(status_code=404, detail=f"Key {key_id} not found")
        
        result = help_service.delete_key(key_id)
        
        if result:
            key_details = {
                "id": key.id,
                "code": key.code,
                "key": key.key,
                "parent_id": key.parent_id,
                "related_keys": key.related_keys,
                "title": ""  # TODO: Get title from i18n
            }
            
            return DeleteKeyResponse(
                data={"key_details": key_details},
                message="Key deleted successfully",
                status=200,
                success=True
            )
        else:
            raise HTTPException(status_code=404, detail=f"Key {key_id} not found")
            
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=APIResponse)
async def health_check():
    """
    Health check endpoint.
    
    Returns:
        Service health status
    """
    return APIResponse(
        success=True,
        message="DFA Help Service is running",
        data={"version": "2.0.0", "status": "healthy"}
    )
