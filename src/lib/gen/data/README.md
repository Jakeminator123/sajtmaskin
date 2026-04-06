# Generation Data

Small shared lookup tables for generation and registry-related helpers. Parent: [`../README.md`](../README.md).

## Indexed files

| File | What it does |
|------|-------------|
| `shadcn-components.ts` | Component metadata for the shadcn/ui registry and related tooling. |
| `lucide-icons.ts` | Icon name lookup data used by generation helpers and audits. |

## Notes

- The older docs-snippet knowledge-base / semantic-retrieval layer is no longer part of the active own-engine prompt path.
- If generation needs more library guidance in the future, prefer updating static prompt fragments or scaffold/context serialization rather than re-introducing a hidden docs-RAG layer by accident.
