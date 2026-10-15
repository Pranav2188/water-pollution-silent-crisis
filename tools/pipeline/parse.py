"""Small helpers that turn sheet text into clean values."""

import datetime as dt
import re


def iso_date(text):
    """'2026-09-29' -> '2026-09-29'; anything else (including 'Not yet verified') -> None."""
    text = text or ""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text[:10]):
        return None
    try:
        return dt.date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def split_list(text, sep=" / "):
    """'A / B (confirm)' -> (['A', 'B'], True)."""
    if not text:
        return [], False
    confirm = "(confirm)" in text.lower()
    clean = re.sub(r"\s*\(confirm\)", "", text, flags=re.I)
    return [p.strip() for p in clean.split(sep) if p.strip()], confirm


def split_ids(text, prefix):
    """'SRC-01, SRC-12 and more' -> ['SRC-01', 'SRC-12']."""
    return re.findall(rf"{prefix}-\d+", text or "")


def numbers(text):
    """'4 / 15 (confirm)' -> [4, 15]."""
    return [int(n) for n in re.findall(r"\d+", text or "")]
