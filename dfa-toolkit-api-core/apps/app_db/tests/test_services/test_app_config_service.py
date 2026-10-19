"""
Unit tests for AppConfigService.
Uses Arrange-Act-Assert; database session is mocked.
"""
import pytest
from unittest.mock import MagicMock, patch

from apps.app_db.schemas.core import AppConfigPatchItemSchema
from apps.app_db.services.app_config import AppConfigService, _filter_config_dict_by_is_system


class TestGetConfigByKeyword:
    """Tests for AppConfigService.get_config_by_keyword."""

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_returns_config_dict_when_application_exists(self, mock_session_local):
        # Arrange: app exists, two config rows
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "myapp"

        mock_row1 = MagicMock()
        mock_row1.key_code = "theme"
        mock_row1.key_value = "dark"
        mock_row1.description = "Theme mode"
        mock_row1.is_system = False
        mock_row2 = MagicMock()
        mock_row2.key_code = "locale"
        mock_row2.key_value = "en"
        mock_row2.description = "Default locale"
        mock_row2.is_system = False

        # First query: SystemApplication.filter().first()
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app
        # Second query: SystemConfiguration.filter().all()
        q_config = MagicMock()
        q_config.filter.return_value.all.return_value = [mock_row1, mock_row2]
        mock_db.query.side_effect = [q_app, q_config]

        service = AppConfigService()

        # Act
        result = service.get_config_by_keyword("myapp")

        # Assert
        assert result == {
            "theme": {"value": "dark", "description": "Theme mode", "is_system": False},
            "locale": {"value": "en", "description": "Default locale", "is_system": False},
        }
        assert mock_db.close.called

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_returns_none_when_application_not_found(self, mock_session_local):
        # Arrange: no app for keyword
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = None
        mock_db.query.return_value = q_app

        service = AppConfigService()

        # Act
        result = service.get_config_by_keyword("nonexistent")

        # Assert
        assert result is None
        assert mock_db.query.call_count == 1
        assert mock_db.close.called

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_returns_empty_dict_when_app_has_no_config_rows(self, mock_session_local):
        # Arrange: app exists, zero config rows
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "emptyapp"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app
        q_config = MagicMock()
        q_config.filter.return_value.all.return_value = []
        mock_db.query.side_effect = [q_app, q_config]

        service = AppConfigService()

        # Act
        result = service.get_config_by_keyword("emptyapp")

        # Assert
        assert result == {}
        assert mock_db.close.called

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_closes_session_on_exception(self, mock_session_local):
        # Arrange: query raises
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_db.query.side_effect = RuntimeError("Connection failed")

        service = AppConfigService()

        # Act & Assert
        with pytest.raises(RuntimeError, match="Connection failed"):
            service.get_config_by_keyword("myapp")
        assert mock_db.close.called


class TestGetConfigByKeywordWithDwId:
    """get_config_by_keyword with dw_id: merge db_configuration (mirrored keys) with system_configuration."""

    @patch("apps.app_db.services.app_config.SystemDatawarehouseService")
    @patch("apps.app_db.services.app_config.fetch_ut_dw_configs")
    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_dw_id_merges_warehouse_over_mirrored_keys_when_mysql_ok(
        self, mock_session_local, mock_fetch, mock_dw_svc_class
    ):
        mock_fetch.return_value = {
            "CURRENT_TIMEPERIOD": {"value": "wh_tp", "description": "from dw"},
        }
        inst = MagicMock()
        mock_dw_svc_class.return_value = inst
        inst.get_mysql_warehouse_connection_params.return_value = {
            "db_host_address": "h",
            "db_port": 3306,
            "db_user": "u",
            "db_password": "p",
            "db_database": "dwdb",
            "db_source_type": "mysql",
        }

        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_app = MagicMock()
        mock_app.app_key = "myapp"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_app = MagicMock()
        row_app.key_code = "APP_NAME"
        row_app.key_value = "CoreApp"
        row_app.description = "title"
        row_app.is_system = False

        row_tp = MagicMock()
        row_tp.key_code = "CURRENT_TIMEPERIOD"
        row_tp.key_value = "core_tp"
        row_tp.description = None
        row_tp.is_system = False

        q_merge = MagicMock()
        q_merge.filter.return_value.all.return_value = [row_app, row_tp]
        mock_db.query.side_effect = [q_app, q_merge]

        service = AppConfigService()
        result = service.get_config_by_keyword("myapp", dw_id=7)

        assert result["APP_NAME"]["value"] == "CoreApp"
        assert result["APP_NAME"]["is_system"] is False
        assert result["CURRENT_TIMEPERIOD"]["value"] == "wh_tp"
        assert result["CURRENT_TIMEPERIOD"]["description"] == "from dw"
        mock_fetch.assert_called_once_with("myapp", inst.get_mysql_warehouse_connection_params.return_value)
        assert mock_db.query.call_count == 2

    @patch("apps.app_db.services.app_config.SystemDatawarehouseService")
    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_dw_merge_uses_core_only_when_no_mysql_params(self, mock_session_local, mock_dw_svc_class):
        inst = MagicMock()
        mock_dw_svc_class.return_value = inst
        inst.get_mysql_warehouse_connection_params.return_value = None

        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_app = MagicMock()
        mock_app.app_key = "myapp"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_x = MagicMock()
        row_x.key_code = "X"
        row_x.key_value = "vx"
        row_x.description = None
        row_x.is_system = False

        row_y = MagicMock()
        row_y.key_code = "Y"
        row_y.key_value = "vy"
        row_y.description = None
        row_y.is_system = False

        q_merge = MagicMock()
        q_merge.filter.return_value.all.return_value = [row_x, row_y]
        mock_db.query.side_effect = [q_app, q_merge]

        service = AppConfigService()
        result = service.get_config_by_keyword("myapp", dw_id=5)

        assert result["X"]["value"] == "vx"
        assert result["Y"]["value"] == "vy"
        assert mock_db.query.call_count == 2

    @patch("apps.app_db.services.app_config.SystemDatawarehouseService")
    @patch("apps.app_db.services.app_config.fetch_ut_dw_configs")
    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_dw_id_falls_back_when_fetch_raises(
        self, mock_session_local, mock_fetch, mock_dw_svc_class
    ):
        mock_fetch.side_effect = OSError("connection refused")
        inst = MagicMock()
        mock_dw_svc_class.return_value = inst
        inst.get_mysql_warehouse_connection_params.return_value = {
            "db_host_address": "h",
            "db_port": 3306,
            "db_user": "u",
            "db_password": "p",
            "db_database": "dwdb",
        }

        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_app = MagicMock()
        mock_app.app_key = "myapp"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row = MagicMock()
        row.key_code = "X"
        row.key_value = "y"
        row.description = None
        row.is_system = False
        q_merge = MagicMock()
        q_merge.filter.return_value.all.return_value = [row]
        mock_db.query.side_effect = [q_app, q_merge]

        service = AppConfigService()
        result = service.get_config_by_keyword("myapp", dw_id=2)

        assert result == {"X": {"value": "y", "description": None, "is_system": False}}
        assert mock_db.query.call_count == 2

    @patch("apps.app_db.services.app_config.SystemDatawarehouseService")
    @patch("apps.app_db.services.app_config.fetch_ut_dw_configs")
    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_dw_id_includes_warehouse_only_mirror_key(
        self, mock_session_local, mock_fetch, mock_dw_svc_class
    ):
        """Mirrored keys present only in db_configuration appear when absent from system_configuration."""
        mock_fetch.return_value = {
            "CURRENT_TIMEPERIOD": {"value": "wh_only_tp", "description": "wh desc"},
            "CUSTOM_X": {"value": "should_not_surface", "description": "x"},
        }
        inst = MagicMock()
        mock_dw_svc_class.return_value = inst
        inst.get_mysql_warehouse_connection_params.return_value = {
            "db_host_address": "h",
            "db_port": 3306,
            "db_user": "u",
            "db_password": "p",
            "db_database": "dwdb",
            "db_source_type": "mysql",
        }

        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_app = MagicMock()
        mock_app.app_key = "myapp"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_app = MagicMock()
        row_app.key_code = "APP_NAME"
        row_app.key_value = "CoreApp"
        row_app.description = "title"
        row_app.is_system = False

        q_merge = MagicMock()
        q_merge.filter.return_value.all.return_value = [row_app]
        mock_db.query.side_effect = [q_app, q_merge]

        service = AppConfigService()
        result = service.get_config_by_keyword("myapp", dw_id=7)

        assert result["APP_NAME"]["value"] == "CoreApp"
        assert result["CURRENT_TIMEPERIOD"]["value"] == "wh_only_tp"
        assert result["CURRENT_TIMEPERIOD"]["description"] == "wh desc"
        assert "CUSTOM_X" not in result
        assert len(result) == 2


class TestFilterConfigDictByIsSystem:
    """Tests for _filter_config_dict_by_is_system."""

    def test_none_returns_same_mapping(self):
        cfg = {"a": {"value": "1", "is_system": True}}
        out = _filter_config_dict_by_is_system(cfg, None)
        assert out is cfg

    def test_true_keeps_only_system_keys(self):
        cfg = {
            "SYS": {"value": "1", "description": None, "is_system": True},
            "OTHER": {"value": "2", "description": None, "is_system": False},
        }
        out = _filter_config_dict_by_is_system(cfg, True)
        assert out == {"SYS": cfg["SYS"]}

    def test_false_keeps_only_non_system_keys(self):
        cfg = {
            "SYS": {"value": "1", "description": None, "is_system": True},
            "OTHER": {"value": "2", "description": None, "is_system": False},
        }
        out = _filter_config_dict_by_is_system(cfg, False)
        assert out == {"OTHER": cfg["OTHER"]}


class TestGetConfigByKeywordIsSystemFilter:
    """get_config_by_keyword with is_system filter."""

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_core_config_filtered_by_is_system(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "myapp"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        mock_row1 = MagicMock()
        mock_row1.key_code = "APP_ID"
        mock_row1.key_value = "1"
        mock_row1.description = None
        mock_row1.is_system = True
        mock_row2 = MagicMock()
        mock_row2.key_code = "APP_NAME"
        mock_row2.key_value = "X"
        mock_row2.description = None
        mock_row2.is_system = False

        q_config = MagicMock()
        q_config.filter.return_value.all.return_value = [mock_row1, mock_row2]
        mock_db.query.side_effect = [q_app, q_config]

        service = AppConfigService()
        result = service.get_config_by_keyword("myapp", is_system=True)

        assert result == {
            "APP_ID": {"value": "1", "description": None, "is_system": True},
        }
        assert mock_db.close.called


class TestPatchConfigByAppKey:
    """Tests for AppConfigService.patch_config_by_app_key."""

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_updates_existing_keys_only(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_DASH"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_name = MagicMock()
        row_name.key_code = "APP_NAME"
        row_name.key_value = "Old Name"
        row_name.description = None
        row_name.is_system = False

        q_config = MagicMock()
        q_config.filter.return_value.all.return_value = [row_name]
        mock_db.query.side_effect = [q_app, q_config]

        service = AppConfigService()
        payload = {
            "APP_NAME": AppConfigPatchItemSchema(
                value="DFA Dashboard",
                description="Application title",
            ),
            "MISSING_KEY": AppConfigPatchItemSchema(
                value="x",
                description="y",
            ),
        }

        result = service.patch_config_by_app_key("DFA_DASH", payload=payload)

        assert result is not None
        assert result["requested_count"] == 2
        assert result["updated_count"] == 1
        assert result["updated_keys"] == ["APP_NAME"]
        assert result["missing_keys"] == ["MISSING_KEY"]
        assert row_name.key_value == "DFA Dashboard"
        assert row_name.description == "Application title"
        assert row_name.is_system is False
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_updates_is_system_when_provided(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_DM"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row = MagicMock()
        row.key_code = "APP_ID"
        row.key_value = "1"
        row.description = None
        row.is_system = True

        q_config = MagicMock()
        q_config.filter.return_value.all.return_value = [row]
        mock_db.query.side_effect = [q_app, q_config]

        service = AppConfigService()
        result = service.patch_config_by_app_key(
            "DFA_DM",
            payload={
                "APP_ID": AppConfigPatchItemSchema(value="1", description=None, is_system=False),
            },
        )

        assert result is not None
        assert row.is_system is False

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_returns_none_when_app_not_found(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = None
        mock_db.query.return_value = q_app

        service = AppConfigService()
        payload = {
            "APP_NAME": AppConfigPatchItemSchema(
                value="x",
                description="y",
            )
        }
        result = service.patch_config_by_app_key("UNKNOWN", payload=payload)

        assert result is None
        assert mock_db.close.called

    @patch("apps.app_db.services.app_config.upsert_ut_dw_config")
    @patch("apps.app_db.services.app_config.SystemDatawarehouseService")
    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_dw_maps_to_warehouse_when_dw_id_set(
        self, mock_session_local, mock_dw_svc_class, mock_upsert
    ):
        mock_upsert.return_value = True
        inst = MagicMock()
        mock_dw_svc_class.return_value = inst
        inst.get_mysql_warehouse_connection_params.return_value = {
            "db_host_address": "h",
            "db_port": 3306,
            "db_user": "u",
            "db_password": "p",
            "db_database": "dwdb",
        }

        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_app = MagicMock()
        mock_app.app_key = "DFA_VIZ"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_maps = MagicMock()
        row_maps.key_code = "DW_MAPS"
        row_maps.key_value = "{}"
        row_maps.description = "maps"
        row_maps.is_system = False

        q_core = MagicMock()
        q_core.filter.return_value.all.return_value = [row_maps]
        mock_db.query.side_effect = [q_app, q_core]

        service = AppConfigService()
        payload = {
            "DW_MAPS": AppConfigPatchItemSchema(
                value='{"L1":{"_default":["/getmap/test.json"]}}',
                description="maps",
            ),
        }
        result = service.patch_config_by_app_key("DFA_VIZ", payload=payload, dw_id=4)

        assert result is not None
        assert result["updated_keys"] == ["DW_MAPS"]
        assert result["missing_keys"] == []
        mock_upsert.assert_called_once()
        assert mock_upsert.call_args[0][1] == "DW_MAPS"
        assert not mock_db.commit.called

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_dfa_dml_url_updates_system_when_dw_id_set(
        self, mock_session_local
    ):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_app = MagicMock()
        mock_app.app_key = "DFA_VIZ"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_dml = MagicMock()
        row_dml.key_code = "DFA_DML_URL"
        row_dml.key_value = ""
        row_dml.description = "dml"
        row_dml.is_system = False

        q_config = MagicMock()
        q_config.filter.return_value.all.return_value = [row_dml]
        mock_db.query.side_effect = [q_app, q_config]

        service = AppConfigService()
        result = service.patch_config_by_app_key(
            "DFA_VIZ",
            payload={
                "DFA_DML_URL": AppConfigPatchItemSchema(
                    value="https://dml.example.com",
                    description="dml",
                ),
            },
            dw_id=4,
        )

        assert result is not None
        assert result["updated_keys"] == ["DFA_DML_URL"]
        assert row_dml.key_value == "https://dml.example.com"
        assert mock_db.commit.called


class TestGlobalConfigOverlay:
    """GET /app-config merges platform-wide keys from DFA_CORE into product responses."""

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_get_overlays_sso_enabled_from_dfa_core(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_VIZ"

        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_name = MagicMock()
        row_name.key_code = "APP_NAME"
        row_name.key_value = "Viz"
        row_name.description = "name"
        row_name.is_system = False

        q_product = MagicMock()
        q_product.filter.return_value.all.return_value = [row_name]

        row_sso = MagicMock()
        row_sso.key_code = "SSO_ENABLED"
        row_sso.key_value = "true"
        row_sso.description = "sso"
        row_sso.is_system = False

        q_global = MagicMock()
        q_global.filter.return_value.all.return_value = [row_sso]

        mock_db.query.side_effect = [q_app, q_product, q_global]

        service = AppConfigService()
        result = service.get_config_by_keyword("DFA_VIZ")

        assert result is not None
        assert "SSO_ENABLED" in result
        assert result["SSO_ENABLED"]["value"] == "true"
        assert "APP_NAME" in result

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_get_does_not_overlay_when_app_is_dfa_core(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_CORE"

        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_sso = MagicMock()
        row_sso.key_code = "SSO_ENABLED"
        row_sso.key_value = "true"
        row_sso.description = "sso"
        row_sso.is_system = False

        q_config = MagicMock()
        q_config.filter.return_value.all.return_value = [row_sso]

        mock_db.query.side_effect = [q_app, q_config]

        service = AppConfigService()
        result = service.get_config_by_keyword("DFA_CORE")

        assert result is not None
        assert result["SSO_ENABLED"]["value"] == "true"
        # Only 2 queries: app lookup + product config (no extra global overlay)
        assert mock_db.query.call_count == 2


class TestPatchGlobalKeyRouting:
    """PATCH /app-config routes SSO_ENABLED to DFA_CORE regardless of caller's app_key."""

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_sso_enabled_updates_dfa_core_row(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_DM"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_sso = MagicMock()
        row_sso.key_code = "SSO_ENABLED"
        row_sso.key_value = "false"
        row_sso.description = "sso"
        row_sso.is_system = False

        q_global = MagicMock()
        q_global.filter.return_value.all.return_value = [row_sso]

        mock_db.query.side_effect = [q_app, q_global]

        service = AppConfigService()
        result = service.patch_config_by_app_key(
            "DFA_DM",
            payload={
                "SSO_ENABLED": AppConfigPatchItemSchema(
                    value="true",
                    description="sso toggle",
                ),
            },
        )

        assert result is not None
        assert "SSO_ENABLED" in result["updated_keys"]
        assert row_sso.key_value == "true"
        assert mock_db.commit.called

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_mixes_global_and_product_keys(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_DM"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_sso = MagicMock()
        row_sso.key_code = "SSO_ENABLED"
        row_sso.key_value = "false"
        q_global = MagicMock()
        q_global.filter.return_value.all.return_value = [row_sso]

        row_name = MagicMock()
        row_name.key_code = "APP_NAME"
        row_name.key_value = "Old"
        row_name.description = "name"
        row_name.is_system = False
        q_product = MagicMock()
        q_product.filter.return_value.all.return_value = [row_name]

        mock_db.query.side_effect = [q_app, q_global, q_product]

        service = AppConfigService()
        result = service.patch_config_by_app_key(
            "DFA_DM",
            payload={
                "SSO_ENABLED": AppConfigPatchItemSchema(value="true", description="sso"),
                "APP_NAME": AppConfigPatchItemSchema(value="New DM", description="name"),
            },
        )

        assert result is not None
        assert sorted(result["updated_keys"]) == ["APP_NAME", "SSO_ENABLED"]
        assert result["updated_count"] == 2
        assert row_sso.key_value == "true"
        assert row_name.key_value == "New DM"

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_get_overlays_ius_gid_separator_from_dfa_core(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_DM"

        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_name = MagicMock()
        row_name.key_code = "APP_NAME"
        row_name.key_value = "DM"
        row_name.description = "name"
        row_name.is_system = False

        q_product = MagicMock()
        q_product.filter.return_value.all.return_value = [row_name]

        row_sep = MagicMock()
        row_sep.key_code = "IUS_GID_SEPARATOR"
        row_sep.key_value = "~"
        row_sep.description = "sep"
        row_sep.is_system = True

        q_global = MagicMock()
        q_global.filter.return_value.all.return_value = [
            MagicMock(key_code="SSO_ENABLED", key_value="false", description="", is_system=False),
            row_sep,
        ]

        mock_db.query.side_effect = [q_app, q_product, q_global]

        service = AppConfigService()
        result = service.get_config_by_keyword("DFA_DM")

        assert result is not None
        assert result["IUS_GID_SEPARATOR"]["value"] == "~"

    @patch("apps.app_db.services.app_config.SessionLocal")
    def test_patch_ius_gid_separator_updates_dfa_core_row(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        mock_app = MagicMock()
        mock_app.app_key = "DFA_DM"
        q_app = MagicMock()
        q_app.filter.return_value.first.return_value = mock_app

        row_sep = MagicMock()
        row_sep.key_code = "IUS_GID_SEPARATOR"
        row_sep.key_value = "|"
        row_sep.description = "sep"
        row_sep.is_system = True

        q_global = MagicMock()
        q_global.filter.return_value.all.return_value = [row_sep]

        mock_db.query.side_effect = [q_app, q_global]

        service = AppConfigService()
        result = service.patch_config_by_app_key(
            "DFA_DM",
            payload={
                "IUS_GID_SEPARATOR": AppConfigPatchItemSchema(value="~", description="sep"),
            },
        )

        assert result is not None
        assert "IUS_GID_SEPARATOR" in result["updated_keys"]
        assert row_sep.key_value == "~"
        assert mock_db.commit.called
