"""Seed work_relationships for demo laws."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from loader.load_to_supabase import get_sb, upsert_relationship

sb = get_sb()

RELATIONSHIPS = [
    ("/akn/id/act/uu/2023/6", "mengubah", "/akn/id/act/uu/2003/13"),
    ("/akn/id/act/uu/2003/13", "diubah_oleh", "/akn/id/act/uu/2023/6"),
    ("/akn/id/act/uu/2019/16", "mengubah", "/akn/id/act/uu/1974/1"),
    ("/akn/id/act/uu/1974/1", "diubah_oleh", "/akn/id/act/uu/2019/16"),
]

inserted = 0
for src_uri, rel_code, tgt_uri in RELATIONSHIPS:
    if upsert_relationship(sb, src_uri, tgt_uri, rel_code):
        print(f"OK: {src_uri} -> {rel_code} -> {tgt_uri}")
        inserted += 1
    else:
        print(f"SKIP: {src_uri} -> {rel_code} -> {tgt_uri} (missing)")
print(f"\nProcessed: {inserted}")
