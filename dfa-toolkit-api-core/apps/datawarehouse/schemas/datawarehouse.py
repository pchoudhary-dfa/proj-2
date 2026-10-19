"""
Data warehouse API schemas - re-exports from split modules for backward compatibility.
Prefer importing from the specific module, e.g. apps.datawarehouse.schemas.indicator.
"""
from apps.datawarehouse.schemas.indicator import (
    IndicatorCreateSchema,
    IndicatorUpdateSchema,
    MetadataItemSchema,
    IndicatorResponseSchema,
)
from apps.datawarehouse.schemas.unit import (
    UnitCreateSchema,
    UnitUpdateSchema,
    UnitResponseSchema,
)
from apps.datawarehouse.schemas.indicator_classification import (
    IndicatorClassificationCreateSchema,
    IndicatorClassificationUpdateSchema,
)
from apps.datawarehouse.schemas.sg_categories import (
    SgCategoryCreateSchema,
    SgCategoryUpdateSchema,
    SgCategoryMultipleDeleteSchema,
    SgCategoryAssociationCountRequestSchema,
    SgCategoryResponseSchema,
    SgValRecordSchema,
    SgCategoryWithValuesResponseSchema,
    SgCategoryValueCreateSchema,
)
from apps.datawarehouse.schemas.sg_vals import (
    SgValDimensionItemSchema,
    SgValResponseSchema,
    SgValCreateItemSchema,
    SgValCreateSchema,
)
from apps.datawarehouse.schemas.area import (
    AreaResponseSchema,
    AreaParentResponseSchema,
    AreaLevelResponseSchema,
    AreaCreateSchema,
    AreaUpdateSchema,
)
from apps.datawarehouse.schemas.time_period import (
    TimePeriodCreateSchema,
    TimePeriodUpdateSchema,
    TimePeriodMultipleDeleteSchema,
    TimePeriodAssociationCountRequestSchema,
    TimePeriodResponseSchema,
)
from apps.datawarehouse.schemas.ius import IUSResponseSchema
from apps.datawarehouse.schemas.indicator_metadata import (
    MetadataCategoryResponseSchema,
    IndicatorMetadataUpdateItemSchema,
    IndicatorMetadataUpdateRequestSchema,
    IndicatorMetadataUpdateSchema,
)

__all__ = [
    "IndicatorCreateSchema",
    "IndicatorUpdateSchema",
    "MetadataItemSchema",
    "IndicatorResponseSchema",
    "UnitCreateSchema",
    "UnitUpdateSchema",
    "UnitResponseSchema",
    "IndicatorClassificationCreateSchema",
    "IndicatorClassificationUpdateSchema",
    "SgCategoryCreateSchema",
    "SgCategoryUpdateSchema",
    "SgCategoryMultipleDeleteSchema",
    "SgCategoryAssociationCountRequestSchema",
    "SgCategoryResponseSchema",
    "SgValRecordSchema",
    "SgCategoryWithValuesResponseSchema",
    "SgCategoryValueCreateSchema",
    "SgValDimensionItemSchema",
    "SgValResponseSchema",
    "SgValCreateItemSchema",
    "SgValCreateSchema",
    "AreaResponseSchema",
    "AreaParentResponseSchema",
    "AreaLevelResponseSchema",
    "AreaCreateSchema",
    "AreaUpdateSchema",
    "TimePeriodCreateSchema",
    "TimePeriodUpdateSchema",
    "TimePeriodMultipleDeleteSchema",
    "TimePeriodAssociationCountRequestSchema",
    "TimePeriodResponseSchema",
    "IUSResponseSchema",
    "MetadataCategoryResponseSchema",
    "IndicatorMetadataUpdateItemSchema",
    "IndicatorMetadataUpdateRequestSchema",
    "IndicatorMetadataUpdateSchema",
]
