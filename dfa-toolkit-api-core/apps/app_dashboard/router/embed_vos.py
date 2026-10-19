"""Embed VO routes — /dash/embed"""
from fastapi import APIRouter

from apps.shared.schemas.response import SuccessResponse

router = APIRouter(prefix="/dash/embed", tags=["Dashboard - Embed"])


@router.get("", response_model=SuccessResponse, summary="List embed VOs")
async def list_embed_vos():
    raise NotImplementedError


@router.post("", response_model=SuccessResponse, status_code=201, summary="Create embed VO")
async def create_embed_vo():
    raise NotImplementedError


@router.get("/{embed_id}", response_model=SuccessResponse, summary="Get embed VO")
async def get_embed_vo(embed_id: int):
    raise NotImplementedError


@router.delete("/{embed_id}", response_model=SuccessResponse, summary="Delete embed VO")
async def delete_embed_vo(embed_id: int):
    raise NotImplementedError


@router.post("/{embed_id}/track", response_model=SuccessResponse, summary="Track embed view")
async def track_embed_view(embed_id: int):
    raise NotImplementedError
