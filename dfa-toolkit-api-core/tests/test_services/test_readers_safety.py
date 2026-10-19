import pytest

from apps.datawarehouse.services.search_index.readers import UtIndicatorReader


class _StubDialect:
    name = "postgresql"


class _StubBind:
    dialect = _StubDialect()


class _StubSession:
    def get_bind(self):
        return _StubBind()


def test_readers_reject_unsafe_language_code() -> None:
    # Arrange
    reader = UtIndicatorReader()
    dw_db = _StubSession()

    # Act / Assert
    with pytest.raises(ValueError):
        list(reader.read(dw_db=dw_db, language_code="en;DROP TABLE x"))  # type: ignore[arg-type]

