"""Key codes mirrored into each warehouse `db_configuration` on optimize / configuration_sync.

Default values for initial warehouse rows come from ``apps.shared.config.config.Settings`` (.env);
field names match ``key_code`` (logical app key ``DFA_DM``).
The same key set was historically marked with ``is_dw=1`` in migration ``060_sys_cfg_is_dw``.

``is_system`` on ``system_configuration`` marks rows that are treated as system-managed metadata
(see migration ``075_sys_cfg_is_system``); new seeds use ``IS_SYSTEM_KEY_CODES``.
"""

# Platform-level app_key for keys that apply to all products (e.g. SSO_ENABLED, IUS_GID_SEPARATOR).
PLATFORM_CONFIG_APP_KEY: str = "DFA_CORE"

# Keys stored under PLATFORM_CONFIG_APP_KEY and merged into every product's
# GET /app-config response.  PATCH /app-config routes these to DFA_CORE
# regardless of the caller's X-Api-Key.
GLOBAL_CONFIG_KEY_CODES: frozenset[str] = frozenset({"SSO_ENABLED", "IUS_GID_SEPARATOR"})


def is_global_config_key(key_code: str) -> bool:
    return key_code in GLOBAL_CONFIG_KEY_CODES


# Keys that get ``is_system=True`` on insert/reseed (aligned with migration 075 UPDATE).
IS_SYSTEM_KEY_CODES: frozenset[str] = frozenset({"APP_ID", "IUS_GID_SEPARATOR"})


def is_system_config_key(key_code: str) -> bool:
    return key_code in IS_SYSTEM_KEY_CODES


# Keys seeded to db_configuration (must stay aligned with Settings mirror fields and migration 060 UPDATE).
IS_DW_MIRROR_KEY_CODES: frozenset[str] = frozenset(
    {
        "AI_PROVIDER",
        "AI_API_KEY",
        "CURRENT_TIMEPERIOD",
        "IUS_DEF_VALIDATION",
        "IND_CLASSIFICATIONS_SETTINGS",
        "DEFAULT_SYSTEM_DW_SUBGROUP_GID",
        "DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID",
        "DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID",
        "DW_MAPS",
    }
)


def is_dw_mirror_key(key_code: str) -> bool:
    return key_code in IS_DW_MIRROR_KEY_CODES
