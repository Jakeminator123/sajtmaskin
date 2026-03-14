# Own-Engine Flow V2

Mermaid V2b for Sajtmaskin's own-engine lane.

This version is intentionally architect-focused:
- less UI detail
- clearer separation of responsibilities
- explicit data stores
- explicit preview-blocked state

```mermaid
flowchart TD
    A[Anvandarprompt] --> B[Builder/API ingress]

    subgraph L1[1. Orchestration Layer]
        B --> C[Prompt normalisering]
        C --> D[Context orchestration]
        D --> E[Runtime scaffold selection]
        E --> F[Capability inference]
        F --> G[System prompt assembly]
        G --> H[Model resolution]
    end

    subgraph L2[2. Generation Layer]
        H --> I[Own-engine generation pipeline]
        I --> J[Streamed AI output]
        J --> K{Output komplett?}
        K -->|Nej, blocker/fraga| K1[Awaiting input<br/>ingen version]
        K -->|Ja| L[Accumulated generation content]
    end

    subgraph L3[3. Finalization Layer]
        L --> M[Autofix]
        M --> N[Syntax validation + repair]
        N --> O[URL expansion + image materialization]
        O --> P[Parse generated files]
        P --> Q[Merge with scaffold or previous version]
        Q --> R[Import checks]
        R --> S[Preview preflight]
        S --> T[Project sanity checks]
        T --> U[Persist assistant message]
        U --> V[Persist version files]
    end

    subgraph L4[4. Runtime Preview Layer]
        V --> W{Preview preflight passed?}
        W -->|Ja| X[Generate own preview URL]
        W -->|Nej| Y[Version saved<br/>preview blocked]
        X --> Z[GET /api/preview-render]
        Z --> Z1[Load files from Postgres]
        Z1 --> Z2[Build self-contained preview HTML]
        Z2 --> Z3[iframe runtime preview]
    end

    subgraph L5[5. Post-Generation Control Layer]
        X --> AA[Post-checks]
        Y --> AA
        AA --> AB[Version diffing]
        AB --> AC[Preview health / SEO / route checks]
        AC --> AD[Quality gate sandbox]
        AD --> AE{Repair needed?}
        AE -->|Ja| AF[Autofix follow-up request]
        AF --> B
        AE -->|Nej| AG[Version accepted / readiness state]
    end

    subgraph L6[6. Deployment Layer]
        AG --> AH{Publish requested?}
        AH -->|Ja| AI[Load persisted version files]
        AI --> AJ[Pre-deploy fixes]
        AJ --> AK[Blob materialization]
        AK --> AL[Vercel deployment API]
        AL --> AM[Permanent deployed runtime]
    end

    subgraph DS[Data Stores]
        D1[(Project state)]
        D2[(Chat messages)]
        D3[(Version files)]
        D4[(Deployments)]
    end

    B --> D1
    U --> D2
    V --> D3
    AL --> D4

    classDef layer fill:#0f172a,stroke:#64748b,color:#e2e8f0
    classDef warn fill:#7f1d1d,stroke:#fca5a5,color:#fff1f2
    classDef ok fill:#052e16,stroke:#86efac,color:#ecfdf5
    classDef store fill:#1e293b,stroke:#cbd5e1,color:#f8fafc

    class C,D,E,F,G,H,I,J,L,M,N,O,P,Q,R,S,T,U,V,X,Z,Z1,Z2,Z3,AA,AB,AC,AD,AF,AI,AJ,AK,AL,AM layer
    class K1,Y warn
    class AG,AM ok
    class D1,D2,D3,D4 store
```

Short reading guide:
- `Project state` tracks builder/project-level state.
- `Chat messages` stores user/assistant conversation artifacts.
- `Version files` is the main source of truth for generated own-engine output.
- `Preview blocked` means a version exists, but no preview URL is emitted.
- `Permanent deployed runtime` is separate from preview and only happens after publish.
