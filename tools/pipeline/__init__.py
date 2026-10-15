"""Data pipeline: the sheet's CSV downloads (data/*.csv) -> checked JSON for the website.

Modules
    report.py    collects errors and warnings (errors stop the export)
    parse.py     small text helpers: dates, numbers, "A / B (confirm)" lists, IDs
    io.py        reading CSVs and writing JSON
    build.py     one build_* function per data set (sources, areas, authorities, ...)
    supabase.py  optional one-way copy to Supabase

tools/export_data.py is the command-line entry point. Standard library only.
"""

from .build import export  # noqa: F401
