"""
Debug-only router: seed test data into a data warehouse by dw_id.
Only registered when DEBUG=true; otherwise this router is not included and the endpoint does not appear.
"""
import logging
from fastapi import APIRouter, Depends, Path, status
from fastapi import HTTPException

from apps.shared.schemas.response import SuccessResponse, ErrorResponse
from apps.shared.utils.response import success_response, error_response, identifier_not_found_response
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.datawarehouse.db.datawarehouse import validate_dw_id

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Debug"])
BASE_PATH = f"/{DATAWAREHOUSES_BASE_PATH}"


@router.post(
    f"{BASE_PATH}/{{dw_id}}/seed-test-data",
    summary="Seed test data (DEBUG only)",
    description="Seed 10 rows per table into the data warehouse. Only available when DEBUG=true.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Test data seeded successfully", "model": SuccessResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        500: {"description": "Seed failed", "model": ErrorResponse},
    },
)
async def seed_test_data(
    dw_id: str = Path(..., description="Data warehouse identifier (ID or database name)"),
    _: str = Depends(validate_dw_id),
):
    from apps.datawarehouse.scripts.seed_test_data import seed_warehouse_by_id
    seed_warehouse_by_id(dw_id)
    return success_response(
        message="Test data seeded successfully",
        data={"dw_id": dw_id},
    )
