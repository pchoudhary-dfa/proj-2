from apps.shared.utils.ngrams import generate_trigrams


def test_generate_trigrams_empty() -> None:
    assert generate_trigrams("") == set()


def test_generate_trigrams_padding() -> None:
    trigrams = generate_trigrams("abc")
    # padded: "  abc  " -> contains prefix/suffix trigrams
    assert "  a" in trigrams
    assert "abc" in trigrams
    assert "c  " in trigrams

