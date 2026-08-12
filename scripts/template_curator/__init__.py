"""Backoffice tooling for safe Template (v0-mall) curation."""

from .catalog import (
    AddendumRecord,
    CatalogScope,
    CatalogSnapshot,
    CatalogValidationError,
    StructuralReference,
    TemplateRecord,
    compute_extractor_sha256,
    filter_records,
    load_catalog,
    parse_addenda_registry,
    read_extractor_source_relative_paths,
    scope_records,
    select_catalog,
)

__all__ = [
    "AddendumRecord",
    "CatalogScope",
    "CatalogSnapshot",
    "CatalogValidationError",
    "StructuralReference",
    "TemplateRecord",
    "compute_extractor_sha256",
    "filter_records",
    "load_catalog",
    "parse_addenda_registry",
    "read_extractor_source_relative_paths",
    "scope_records",
    "select_catalog",
]
