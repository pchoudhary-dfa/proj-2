from apps.shared.utils.text import normalize_text


def test_normalize_text_none() -> None:
    assert normalize_text(None) == ""


def test_normalize_text_basic() -> None:
    assert normalize_text("  Hello   World ") == "hello world"


def test_normalize_text_ascii_fold() -> None:
    # "Café" -> "cafe" (best-effort ASCII folding)
    assert normalize_text("Café") == "cafe"

