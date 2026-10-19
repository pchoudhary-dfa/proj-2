"""
Allowlists for GET /translations list search and sort.

Query parameter names are shared with datawarehouse via
`apps.datawarehouse.constants` (QUERY_SEARCH, QUERY_SEARCH_BY, etc.).
"""

# GET /translations — allowed `search_by` values (substring match, case-insensitive).
# - trans_code: translation code
# - default_text: master default_text column
# - translation_text: any resolved locale string in the row (i18n or fallback to default_text)
TRANSLATION_LIST_SEARCH_BY_FIELDS: tuple[str, ...] = (
    "trans_code",
    "default_text",
    "translation_text",
)

# GET /translations — allowed `sort_field` values.
# - id: effective master id after global+app merge
# - trans_code: translation code
# - default_text: master default_text
# - translation_text: resolved text for the first selected locale (same order as list response)
TRANSLATION_LIST_SORT_FIELDS: tuple[str, ...] = (
    "id",
    "trans_code",
    "default_text",
    "translation_text",
)
