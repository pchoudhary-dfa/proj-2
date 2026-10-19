"""
Utility functions for gap-based display order reordering.

This module provides generic functions to maintain unique display orders
when updating records in database tables, supporting both regular tables
and multi-locale tables used in the datawarehouse.
"""
import logging
from typing import Any, Dict, List, Optional, Union
from sqlalchemy.orm import Session

from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE = "apps.shared.utils.display_order"


def reorder_display_orders(
    db_session: Session,
    model_class: type,
    order_column_name: str,
    pk_column_name: str,
    updated_record_id: int,
    new_order: Union[int, float],
    old_order: Union[int, float],
    additional_filters: Optional[Dict[str, Any]] = None
) -> None:
    """
    Generic gap-based reordering for display orders.
    Only updates records that are actually affected by the order change.
    
    Args:
        db_session: SQLAlchemy database session
        model_class: SQLAlchemy model class
        order_column_name: Name of the order column (e.g., 'subgroup_type_order')
        pk_column_name: Name of the primary key column (e.g., 'subgroup_type_nid')
        updated_record_id: ID of the record being updated
        new_order: New order value for the record
        old_order: Previous order value of the record
        additional_filters: Optional additional filters to apply (for scoped reordering)
    """
    if new_order == old_order:
        return  # No change needed
    
    # Get the order column and primary key column objects
    order_column = getattr(model_class, order_column_name)
    pk_column = getattr(model_class, pk_column_name)
    
    # Build base query with additional filters if provided
    base_query = db_session.query(model_class)
    if additional_filters:
        for column_name, value in additional_filters.items():
            filter_column = getattr(model_class, column_name)
            base_query = base_query.filter(filter_column == value)
    
    if new_order > old_order:
        # Moving down: shift records between old_order+1 and new_order up by 1
        affected_query = base_query.filter(
            pk_column != updated_record_id,
            order_column > old_order,
            order_column <= new_order
        )
        affected_query.update({
            order_column: order_column - 1
        }, synchronize_session=False)
        
        logger.debug(f"Gap reordering: moved {affected_query.count()} records up (order -= 1) "
                    f"for range ({old_order}, {new_order}]")
    else:
        # Moving up: shift records between new_order and old_order-1 down by 1
        affected_query = base_query.filter(
            pk_column != updated_record_id,
            order_column >= new_order,
            order_column < old_order
        )
        affected_query.update({
            order_column: order_column + 1
        }, synchronize_session=False)
        
        logger.debug(f"Gap reordering: moved {affected_query.count()} records down (order += 1) "
                    f"for range [{new_order}, {old_order})")


def reorder_display_orders_multi_locale(
    dw_db: Session,
    dw_id: str,
    model_class_factory: type,
    order_column_name: str,
    pk_column_name: str,
    updated_record_id: int,
    new_order: Union[int, float],
    old_order: Union[int, float],
    additional_filters: Optional[Dict[str, Any]] = None
) -> None:
    """
    Gap-based reordering for multi-locale tables (like SubgroupCategory).
    Applies the same reordering logic to all locale tables for consistency.
    
    Args:
        dw_db: Data warehouse database session
        dw_id: Data warehouse identifier (used to get language codes)
        model_class_factory: Locale model factory (e.g., SubgroupCategory)
        order_column_name: Name of the order column
        pk_column_name: Name of the primary key column
        updated_record_id: ID of the record being updated
        new_order: New order value for the record
        old_order: Previous order value of the record
        additional_filters: Optional additional filters to apply
    """
    if new_order == old_order:
        return  # No change needed
    
    # Import here to avoid circular imports
    from apps.datawarehouse.services.language_service import get_dw_language_codes
    
    # Get all language codes for this data warehouse
    language_codes = get_dw_language_codes(dw_id)
    
    logger.info(f"Applying gap-based reordering to {len(language_codes)} locale tables "
               f"for record {updated_record_id}: {old_order} -> {new_order}")
    
    # Apply reordering to each locale table
    for lang_code in language_codes:
        try:
            # Get the locale-specific model class
            locale_model_class = model_class_factory(lang_code)
            
            # Apply reordering to this locale table
            reorder_display_orders(
                db_session=dw_db,
                model_class=locale_model_class,
                order_column_name=order_column_name,
                pk_column_name=pk_column_name,
                updated_record_id=updated_record_id,
                new_order=new_order,
                old_order=old_order,
                additional_filters=additional_filters
            )
            
            logger.debug(f"Applied reordering to locale table: {locale_model_class.__tablename__}")
            
        except Exception as e:
            log_background_incident(
                f"Failed to apply reordering to locale {lang_code}: {e}",
                error_code="DISPLAY_ORDER_REORDER_LOCALE_FAILED",
                exc=e,
                source=_SOURCE,
            )
            raise


def reorder_display_orders_scoped(
    db_session: Session,
    model_class: type,
    order_column_name: str,
    pk_column_name: str,
    scope_column_name: str,
    scope_value: Any,
    updated_record_id: int,
    new_order: Union[int, float],
    old_order: Union[int, float]
) -> None:
    """
    Convenience function for scoped reordering (e.g., within a category).
    
    Args:
        db_session: SQLAlchemy database session
        model_class: SQLAlchemy model class
        order_column_name: Name of the order column
        pk_column_name: Name of the primary key column
        scope_column_name: Name of the scope column (e.g., 'subgroup_type_nid')
        scope_value: Value to filter by for the scope
        updated_record_id: ID of the record being updated
        new_order: New order value for the record
        old_order: Previous order value of the record
    """
    additional_filters = {scope_column_name: scope_value}
    
    reorder_display_orders(
        db_session=db_session,
        model_class=model_class,
        order_column_name=order_column_name,
        pk_column_name=pk_column_name,
        updated_record_id=updated_record_id,
        new_order=new_order,
        old_order=old_order,
        additional_filters=additional_filters
    )