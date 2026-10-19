"""Schema and resolution contract tests for PATCH /dw/{dw_id}/data-points (unified upsert)."""
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from apps.datawarehouse.schemas.data import UnifiedDataPointUpsertItemSchema
from apps.app_db.schemas.dataset import DataPointInput, UnifiedUpsertRequest
from apps.app_db.services import dataset_service
from apps.app_db.services.dataset_service import UnifiedUpsertPreflightError
from apps.datawarehouse.services.data_service import DataService


class TestUnifiedDataPointUpsertItemSchema:
    """Request body aligns with POST /dw/{dw_id}/data field names (external aliases)."""

    def test_accepts_external_aliases_like_data_api(self):
        row = UnifiedDataPointUpsertItemSchema.model_validate(
            {
                "i_nid": 10,
                "u_nid": 20,
                "sg_nid": 30,
                "ar_nid": 5,
                "tp_nid": 2,
                "ic_nid": 6,
                "dt_value": 61.43,
                "data_entry_note": "note",
            }
        )
        assert row.indicator_nid == 10
        assert row.unit_nid == 20
        assert row.subgroup_val_nid == 30
        assert row.area_nid == 5
        assert row.timeperiod_nid == 2
        assert row.source_nid == 6
        assert row.footnote_nid is None
        assert row.dt_value == 61.43
        assert row.data_entry_note == "note"

    def test_accepts_optional_data_point_id_for_error_correlation(self):
        row = UnifiedDataPointUpsertItemSchema.model_validate(
            {
                "i_nid": 10,
                "u_nid": 20,
                "sg_nid": 30,
                "ar_nid": 5,
                "tp_nid": 2,
                "dt_value": 61.43,
                "data_point_id": 999,
            }
        )
        assert row.data_point_id == 999

    def test_accepts_minimal_edit_row_data_point_id_dt_value_footnote(self):
        row = UnifiedDataPointUpsertItemSchema.model_validate(
            {
                "data_point_id": 891,
                "dt_value": "3242",
                "footnote": "",
            }
        )
        assert row.data_point_id == 891
        assert row.dt_value == "3242"
        assert row.fn == ""

    def test_rejects_fn_nid_alias(self):
        with pytest.raises(ValidationError) as exc:
            UnifiedDataPointUpsertItemSchema.model_validate(
                {
                    "i_nid": 10,
                    "u_nid": 20,
                    "sg_nid": 30,
                    "ar_nid": 5,
                    "tp_nid": 2,
                    "fn_nid": -1,
                    "dt_value": 1.0,
                }
            )
        assert "fn_nid is not accepted" in str(exc.value)
        assert "`footnote`" in str(exc.value)

    def test_rejects_footnote_nid_key(self):
        with pytest.raises(ValidationError) as exc:
            UnifiedDataPointUpsertItemSchema.model_validate(
                {
                    "i_nid": 10,
                    "u_nid": 20,
                    "sg_nid": 30,
                    "ar_nid": 5,
                    "tp_nid": 2,
                    "footnote_nid": -1,
                    "dt_value": 1.0,
                }
            )
        assert "footnote_nid is not accepted" in str(exc.value)
        assert "`footnote`" in str(exc.value)

    def test_rejects_fn_gid(self):
        with pytest.raises(ValidationError) as exc:
            UnifiedDataPointUpsertItemSchema.model_validate(
                {
                    "i_nid": 10,
                    "u_nid": 20,
                    "sg_nid": 30,
                    "ar_nid": 5,
                    "tp_nid": 2,
                    "fn_gid": "x",
                    "dt_value": 1.0,
                }
            )
        assert "fn_gid is not accepted" in str(exc.value)

    def test_rejects_footnote_gid_key(self):
        with pytest.raises(ValidationError) as exc:
            UnifiedDataPointUpsertItemSchema.model_validate(
                {
                    "i_nid": 10,
                    "u_nid": 20,
                    "sg_nid": 30,
                    "ar_nid": 5,
                    "tp_nid": 2,
                    "footnote_gid": "x",
                    "dt_value": 1.0,
                }
            )
        assert "footnote_gid is not accepted" in str(exc.value)

    def test_rejects_legacy_fn_key(self):
        with pytest.raises(ValidationError) as exc:
            UnifiedDataPointUpsertItemSchema.model_validate(
                {
                    "i_nid": 1,
                    "u_nid": 1,
                    "sg_nid": 1,
                    "ar_nid": 1,
                    "tp_nid": 1,
                    "dt_value": 1.0,
                    "fn": "old key",
                }
            )
        assert "fn is not accepted" in str(exc.value)

    def test_accepts_footnote_caption_key(self):
        row = UnifiedDataPointUpsertItemSchema.model_validate(
            {
                "i_nid": 1,
                "u_nid": 1,
                "sg_nid": 1,
                "ar_nid": 1,
                "tp_nid": 1,
                "dt_value": 1.0,
                "footnote": "See methodology",
            }
        )
        assert row.fn == "See methodology"

    def test_accepts_legacy_internal_data_value_with_iusnid(self):
        row = UnifiedDataPointUpsertItemSchema.model_validate(
            {
                "iusnid": 23,
                "indicator_nid": 3,
                "unit_nid": 1,
                "subgroup_val_nid": 6,
                "area_nid": 100,
                "timeperiod_nid": 2,
                "data_value": 0.5,
            }
        )
        assert row.iusnid == 23
        assert row.data_value == 0.5
        assert row.dt_value is None

    def test_rejects_empty_observation(self):
        with pytest.raises(ValidationError) as exc:
            UnifiedDataPointUpsertItemSchema.model_validate(
                {
                    "i_nid": 1,
                    "u_nid": 1,
                    "sg_nid": 1,
                    "ar_nid": 1,
                    "tp_nid": 1,
                }
            )
        assert "dt_value" in str(exc.value).lower() or "observation" in str(exc.value).lower()

    def test_rejects_dt_value_with_data_value_both(self):
        with pytest.raises(ValidationError) as exc:
            UnifiedDataPointUpsertItemSchema.model_validate(
                {
                    "i_nid": 1,
                    "u_nid": 1,
                    "sg_nid": 1,
                    "ar_nid": 1,
                    "tp_nid": 1,
                    "dt_value": 1.0,
                    "data_value": 2.0,
                }
            )
        assert "not both" in str(exc.value).lower()

    def test_unified_request_wraps_rows(self):
        body = UnifiedUpsertRequest.model_validate(
            {
                "dataset_id": 1,
                "data_points": [
                    {"i_nid": 1, "u_nid": 1, "sg_nid": 1, "ar_nid": 2, "tp_nid": 3, "dt_value": 9},
                ],
            }
        )
        assert len(body.data_points) == 1
        assert body.data_points[0].dt_value == 9

    def test_unified_request_deleted_only(self):
        body = UnifiedUpsertRequest.model_validate(
            {
                "dataset_id": 1,
                "deleted": [{"data_point_id": 10}, {"data_point_id": 11}],
            }
        )
        assert body.data_points == []
        assert [x.data_point_id for x in body.deleted] == [10, 11]

    def test_unified_request_restore_only(self):
        body = UnifiedUpsertRequest.model_validate(
            {
                "dataset_id": 2,
                "restore": [{"data_point_id": 5}],
            }
        )
        assert body.restore[0].data_point_id == 5

    def test_unified_request_rejects_empty_actions(self):
        with pytest.raises(ValidationError):
            UnifiedUpsertRequest.model_validate({"dataset_id": 1})


class TestDataPointInputFromResolvedRow:
    """Service maps resolver output into existing upsert model."""

    def test_resolved_shape_passes_datapoint_input(self):
        """Keys returned by DataService.resolve_unified_datapoint_upsert_item must satisfy DataPointInput."""
        row = {
            "iusnid": 1,
            "indicator_nid": 10,
            "unit_nid": 20,
            "subgroup_val_nid": 30,
            "area_nid": 5,
            "timeperiod_nid": 2,
            "source_nid": None,
            "footnote_nid": None,
            "data_value": 1.0,
            "textual_data_value": None,
            "data_entry_note": None,
        }
        inp = DataPointInput(**row)
        assert inp.iusnid == 1
        assert inp.data_value == 1.0


class TestUnifiedUpsertPreflight:
    """Batch validation before unified upsert commits (resolver messages + area gates)."""

    def test_resolution_detail_to_messages_splits_semicolon_lists(self):
        assert dataset_service._resolution_detail_to_messages("a; b") == ["a", "b"]
        assert dataset_service._resolution_detail_to_messages("single") == ["single"]
        assert dataset_service._resolution_detail_to_messages("") == ["Resolution failed"]

    @patch("apps.datawarehouse.db.datawarehouse.get_warehouse_session_from_id")
    @patch.object(dataset_service, "_assert_dataset_owner")
    @patch.object(DataService, "resolve_unified_datapoint_upsert_item", side_effect=ValueError("err A; err B"))
    def test_preflight_collects_resolver_failures_for_all_rows(
        self,
        _mock_resolve,
        mock_assert_owner,
        _mock_wh_sess,
    ):
        mock_assert_owner.return_value = MagicMock(dataset_status="DRAFT", workflow_id=None)
        payload = UnifiedUpsertRequest.model_validate(
            {
                "dataset_id": 1,
                "data_points": [
                    {
                        "i_nid": 1,
                        "u_nid": 1,
                        "sg_nid": 1,
                        "ar_nid": 1,
                        "tp_nid": 1,
                        "dt_value": 1.0,
                    },
                    {
                        "i_nid": 2,
                        "u_nid": 2,
                        "sg_nid": 2,
                        "ar_nid": 2,
                        "tp_nid": 2,
                        "dt_value": 2.0,
                    },
                ],
            }
        )
        with pytest.raises(UnifiedUpsertPreflightError) as ei:
            dataset_service.unified_upsert_data_points(
                db=MagicMock(),
                dw_id=1,
                user_id=1,
                payload=payload,
                locale="en",
            )
        fails = ei.value.failures
        assert len(fails) == 2
        assert fails[0] == {
            "index": 0,
            "data_point_id": None,
            "code": "DATAPOINT_RESOLVE",
            "messages": ["err A", "err B"],
        }
        assert fails[1]["index"] == 1
        assert fails[1]["data_point_id"] is None
        assert fails[1]["code"] == "DATAPOINT_RESOLVE"

    @patch.object(dataset_service, "upsert_data_points")
    @patch("apps.datawarehouse.db.datawarehouse.get_warehouse_session_from_id")
    @patch.object(dataset_service, "_assert_dataset_owner")
    @patch.object(DataService, "resolve_unified_datapoint_upsert_item")
    def test_hydrates_minimal_row_when_data_point_id_set(
        self,
        mock_resolve,
        mock_assert_owner,
        mock_wh_sess,
        mock_upsert,
    ):
        """Body may omit IUS/area/tp when data_point_id is set; service merges from dataset_data_point."""
        mock_assert_owner.return_value = MagicMock(dataset_status="DRAFT", workflow_id=None)
        mock_wh_sess.return_value.__enter__.return_value = MagicMock()

        class _StubDdp:
            data_point_id = 891
            iusnid = 100
            area_nid = 200
            timeperiod_nid = 300
            source_nid = None

        stub = _StubDdp()
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.all.return_value = [stub]

        def _resolve(dw_db, locale, item, *, resolve_footnote=False):
            assert item.iusnid == 100
            assert item.area_nid == 200
            assert item.timeperiod_nid == 300
            assert item.source_nid is None
            assert item.dt_value == "3242"
            assert item.data_point_id == 891
            return {
                "iusnid": 100,
                "indicator_nid": 10,
                "unit_nid": 20,
                "subgroup_val_nid": 30,
                "area_nid": 200,
                "timeperiod_nid": 300,
                "source_nid": None,
                "footnote_nid": None,
                "data_value": 3242.0,
                "textual_data_value": None,
                "data_entry_note": None,
            }

        mock_resolve.side_effect = _resolve
        from apps.app_db.schemas.dataset import DataPointUpsertResponse

        mock_upsert.return_value = DataPointUpsertResponse(
            dataset_id=18, inserted=0, updated=1, total=1,
            marked_deleted=0, restored=0,
        )

        payload = UnifiedUpsertRequest.model_validate(
            {
                "dataset_id": 18,
                "data_points": [
                    {
                        "data_point_id": 891,
                        "dt_value": "3242",
                        "footnote": "",
                    },
                ],
            }
        )
        out = dataset_service.unified_upsert_data_points(
            db=db,
            dw_id=1,
            user_id=1,
            payload=payload,
            locale="en",
        )
        mock_resolve.assert_called_once()
        mock_upsert.assert_called_once()
        cargs, ckwargs = mock_upsert.call_args
        assert ckwargs.get("commit") is False
        assert out.total == 1
        assert out.marked_deleted == 0
        assert out.restored == 0

    @patch("apps.datawarehouse.db.datawarehouse.get_warehouse_session_from_id")
    @patch.object(dataset_service, "_assert_dataset_owner")
    def test_unknown_data_point_id_preflight(
        self,
        mock_assert_owner,
        mock_wh_sess,
    ):
        mock_assert_owner.return_value = MagicMock(dataset_status="DRAFT", workflow_id=None)
        mock_wh_sess.return_value.__enter__.return_value = MagicMock()

        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.all.return_value = []

        payload = UnifiedUpsertRequest.model_validate(
            {
                "dataset_id": 18,
                "data_points": [
                    {"data_point_id": 99999, "dt_value": "1"},
                ],
            }
        )
        with pytest.raises(UnifiedUpsertPreflightError) as ei:
            dataset_service.unified_upsert_data_points(
                db=db,
                dw_id=1,
                user_id=1,
                payload=payload,
                locale="en",
            )
        assert len(ei.value.failures) == 1
        f0 = ei.value.failures[0]
        assert f0["index"] == 0
        assert f0["data_point_id"] == 99999
        assert f0["code"] == "DATAPOINT_RESOLVE"
        assert "not found" in f0["messages"][0].lower()


class TestUnifiedSoftDeleteOnlyPatch:
    @patch.object(dataset_service, "apply_datapoint_soft_delete_flags", return_value=(1, 2))
    @patch.object(dataset_service, "_assert_dataset_owner")
    def test_deleted_restore_without_data_points_commits_once(
        self,
        mock_assert_owner,
        mock_apply_flags,
    ):
        mock_assert_owner.return_value = MagicMock(dataset_status="DRAFT", workflow_id=None)
        db = MagicMock()
        payload = UnifiedUpsertRequest.model_validate(
            {
                "dataset_id": 7,
                "deleted": [{"data_point_id": 1}],
                "restore": [{"data_point_id": 2}],
            }
        )
        out = dataset_service.unified_upsert_data_points(
            db=db,
            dw_id=1,
            user_id=42,
            payload=payload,
            locale="en",
        )
        mock_apply_flags.assert_called_once_with(
            db,
            1,
            42,
            7,
            [1],
            [2],
            is_super_admin=False,
        )
        db.commit.assert_called_once()
        assert out.total == 0
        assert out.marked_deleted == 1
        assert out.restored == 2


class TestUtDataDeleteHelpers:
    @patch("apps.datawarehouse.db.datawarehouse.get_warehouse_session_from_id")
    def test_delete_ut_data_row_for_datapoint_uses_session_delete(
        self,
        mock_wh,
    ):
        from apps.app_db.models.core import DatasetDataPoint

        dp = MagicMock(spec=DatasetDataPoint)
        dp.data_point_id = 1
        dp.dataset_id = 2
        dp.iusnid = 10
        dp.area_nid = 20
        dp.timeperiod_nid = 30
        dp.source_nid = 7

        dw_db = MagicMock()
        mock_wh.return_value.__enter__.return_value = dw_db
        qm = MagicMock()
        dw_db.query.return_value = qm
        qm.filter.return_value = qm
        qm.delete.return_value = 1

        dataset_service._delete_ut_data_row_for_datapoint(99, dp)

        dw_db.commit.assert_called_once()
        qm.delete.assert_called_once_with(synchronize_session=False)

    @patch.object(dataset_service, "_delete_ut_data_row_for_datapoint")
    def test_delete_ut_data_for_soft_deleted_approved_only_is_deleted_rows(
        self,
        mock_one,
    ):
        db = MagicMock()
        a = MagicMock(is_deleted=True, review_status="APPROVED")
        b = MagicMock(is_deleted=False, review_status="APPROVED")
        c = MagicMock(is_deleted=True, review_status="PENDING_REVIEW")
        dataset_service._delete_ut_data_for_soft_deleted_approved_datapoints(db, 5, [a, b, c])
        mock_one.assert_called_once_with(5, a)
