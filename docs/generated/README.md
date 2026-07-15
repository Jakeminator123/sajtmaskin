# Generated contract reference

Files in this directory are deterministic views of runtime registries, schemas
and policies. They help readers inspect identities and relationships without
turning Markdown into a second implementation.

- Run `npm run docs:generate` after changing a canonical source.
- Run `npm run docs:check` to verify committed output.
- Run `npm run docs:test` to verify source coverage and deterministic rendering.
- Never edit `*.generated.md` manually.

| Family       | Projection                                               | Owner relationship                                                    |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Capabilities | [`capabilities.generated.md`](capabilities.generated.md) | Dossier manifest capability projected through runtime selection rules |
| Dossiers     | [`dossiers.generated.md`](dossiers.generated.md)         | Dossier manifests validated/consumed by the runtime registry          |
| Scaffolds    | [`scaffolds.generated.md`](scaffolds.generated.md)       | Registered scaffold manifests                                         |
| Variants     | [`variants.generated.md`](variants.generated.md)         | Variant JSON consumed/validated by the variant registry               |
| Models       | [`models.generated.md`](models.generated.md)             | AI-model manifest validated by the runtime Zod loader                 |
| Policies     | [`policies.generated.md`](policies.generated.md)         | Manifest, env-policy, dossier env and control-plane owner projections |
| Schemas      | [`schemas.generated.md`](schemas.generated.md)           | Strict schema mirrors, validators and declared runtime/type owners    |

BuildSpec, generation modes, full preview policy and terminology stay
handwritten/owner-linked until a stable structured source can generate them
without duplicating TypeScript or creating a second glossary owner.
