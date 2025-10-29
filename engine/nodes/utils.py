"""Utilities shared by node template builders."""

from __future__ import annotations

import re
from collections.abc import Iterable

IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def ensure_identifier(value: str, *, fallback: str) -> str:
    """Return a valid JavaScript identifier derived from ``value``."""
    if IDENTIFIER_RE.match(value):
        return value
    candidate = to_pascal_case(value)
    if candidate and not candidate[0].isalpha():
        candidate = fallback + candidate
    return candidate or fallback


def to_pascal_case(value: str) -> str:
    tokens = _tokenise(value)
    if not tokens:
        return ""
    return "".join(token[:1].upper() + token[1:] for token in tokens)


def to_camel_case(value: str) -> str:
    tokens = _tokenise(value)
    if not tokens:
        return ""
    head, *tail = tokens
    return head.lower() + "".join(token[:1].upper() + token[1:] for token in tail)


def to_snake_case(value: str, *, fallback: str = "node") -> str:
    tokens = _tokenise(value)
    if not tokens:
        return fallback
    return "_".join(token.lower() for token in tokens)


def quote_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def bool_literal(value: bool) -> str:
    return "true" if value else "false"


def property_literal(name: str) -> str:
    if IDENTIFIER_RE.match(name):
        return name
    return quote_string(name)


def join_lines(lines: Iterable[str]) -> str:
    return "\n".join(lines) + "\n"


def _tokenise(value: str) -> list[str]:
    tokens = re.findall(r"[0-9A-Za-z]+", value)
    return tokens
