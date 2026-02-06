# Sajtmaskin Chat Flow Architecture

Complete flow from user input to v0 generation, including all prompt preprocessing.

## First Prompt (New Chat Creation)

```mermaid
flowchart TD
    subgraph userInput [1. User Input]
        Prompt["User types prompt"]
        Settings["Settings: theme, spec mode, model tier"]
    end

    subgraph chatInterface [2. ChatInterface.tsx]
        BuildPayload["buildMessagePayload()"]
        DSHint{"designSystemMode && isNewChat?"}
        AppendHint["Append DESIGN_SYSTEM_HINT_INITIAL"]
        SkipHint["No hint appended"]
        DSHint -->|Yes| AppendHint
        DSHint -->|No| SkipHint
        BuildPayload --> DSHint
    end

    subgraph pageLogic [3. builder/page.tsx]
        RequestCreate["requestCreateChat()"]
        DynInstr["applyDynamicInstructionsForNewChat()"]
        BaseInstr["Get DEFAULT_CUSTOM_INSTRUCTIONS"]
        SpecSuffix{"specMode?"}
        AddSpecRef["Append SPEC_FILE_INSTRUCTION"]
        SkipSpecRef["No spec reference"]
        CombineInstr["Combine: base + addendum + spec suffix"]
        CaptureSnap["captureInstructionSnapshot()"]
        CreateChat["createNewChat()"]
    end

    subgraph promptAssist [4. usePromptAssist.ts]
        GenDynamic["generateDynamicInstructions()"]
        DeepCheck{"deep brief enabled?"}
        
        subgraph deepPath [Deep Path]
            BriefAPI["/api/ai/brief -> GPT-5.2"]
            OnBrief{"specMode?"}
            BriefToSpec["briefToSpec() -> pendingSpecRef"]
            BuildFromBrief["buildDynamicInstructionAddendumFromBrief()"]
        end
        
        subgraph shallowPath [Shallow Path]
            BuildFromPrompt["buildDynamicInstructionAddendumFromPrompt()"]
        end
        
        DeepCheck -->|Yes| BriefAPI
        DeepCheck -->|No| BuildFromPrompt
        BriefAPI --> OnBrief
        OnBrief -->|Yes| BriefToSpec
        OnBrief -->|No| BuildFromBrief
        BriefToSpec --> BuildFromBrief
    end

    subgraph dynamicGuidance [5. promptAssist.ts - Dynamic Resolve]
        ResMotion["resolveMotionGuidance(tone, style)"]
        ResVisual["resolveVisualIdentityGuidance(palette, style, tone)"]
        ResQuality["resolveQualityBarGuidance(tone, style)"]
        Addendum["Formatted instruction addendum"]
        ResMotion --> Addendum
        ResVisual --> Addendum
        ResQuality --> Addendum
    end

    subgraph messaging [6. useV0ChatMessaging.ts]
        FormatPrompt["formatPromptForV0()"]
        BuildRequest["Build request body"]
        StreamAPI["POST /api/v0/chats/stream"]
    end

    subgraph v0api [7. v0 Platform API]
        V0Create["v0.chats.create()"]
        V0Stream["SSE stream response"]
        V0Done["Generation complete"]
    end

    subgraph postGen [8. Post-Generation]
        HandleComplete["handleGenerationComplete()"]
        PushSpec{"pendingSpecRef exists?"}
        PushFile["PUT /files -> sajtmaskin.spec.json LOCKED"]
        SkipPush["No spec push"]
        CSSValidate["validateCss()"]
        PostCheck["runPostGenerationChecks()"]
    end

    Prompt --> BuildPayload
    Settings --> BuildPayload
    AppendHint --> RequestCreate
    SkipHint --> RequestCreate
    RequestCreate --> DynInstr
    DynInstr --> GenDynamic
    GenDynamic --> DeepCheck
    BuildFromBrief --> dynamicGuidance
    BuildFromPrompt --> dynamicGuidance
    Addendum --> DynInstr
    DynInstr --> BaseInstr
    BaseInstr --> SpecSuffix
    SpecSuffix -->|Yes| AddSpecRef
    SpecSuffix -->|No| SkipSpecRef
    AddSpecRef --> CombineInstr
    SkipSpecRef --> CombineInstr
    CombineInstr --> CaptureSnap --> CreateChat
    CreateChat --> FormatPrompt --> BuildRequest --> StreamAPI
    StreamAPI --> V0Create --> V0Stream --> V0Done
    V0Done --> HandleComplete
    HandleComplete --> PushSpec
    PushSpec -->|Yes| PushFile
    PushSpec -->|No| SkipPush
    HandleComplete --> CSSValidate
    HandleComplete --> PostCheck
```

## Follow-up Messages (Existing Chat)

```mermaid
flowchart TD
    UserMsg["User types follow-up"]
    
    subgraph ci [ChatInterface.tsx]
        NoHint["No DESIGN_SYSTEM_HINT appended"]
        NoDynamic["No dynamic instructions generated"]
    end
    
    subgraph send [useV0ChatMessaging.ts]
        Format["formatPromptForV0()"]
        SendMsg["POST /api/v0/chats/chatId/stream"]
    end
    
    subgraph v0 [v0 Platform API]
        V0Send["v0.chats.sendMessage()"]
        V0Context["v0 uses: chat history + system prompt + project files"]
        V0Spec["Reads sajtmaskin.spec.json if present"]
    end
    
    UserMsg --> NoHint --> NoDynamic --> Format --> SendMsg
    SendMsg --> V0Send --> V0Context
    V0Context --> V0Spec
```

## System Prompt Composition

```
+----------------------------------------------+
| DEFAULT_CUSTOM_INSTRUCTIONS (~1500 chars)    |
| - Tech Stack (Next.js, Tailwind, shadcn)     |
| - shadcn/ui Bootstrap Setup                  |
| - Component Usage                            |
| - Tailwind Best Practices                    |
| - Visual Identity                            |
| - Layout Patterns                            |
| - Motion & Interaction                       |
| - Visual Quality                             |
| - Images                                     |
| - Accessibility                              |
+----------------------------------------------+
|                                              |
| DYNAMIC ADDENDUM (~500-2000 chars)           |
| - Build Intent (template/website/app)        |
| - Project Context (title, tone, audience)    |
| - Pages & Sections (from brief)             |
| - Interaction & Motion (DYNAMIC)             |
| - Visual Identity (DYNAMIC)                  |
| - Quality Bar (DYNAMIC)                      |
| - Imagery guidance                           |
| - Technical Constraints                      |
| - Must Have / Avoid                          |
+----------------------------------------------+
|                                              |
| SPEC_FILE_INSTRUCTION (~150 chars)           |
| (only if spec mode active)                   |
| - Follow sajtmaskin.spec.json                |
| - Refer to spec for context                  |
+----------------------------------------------+

Total: ~2000-4000 chars (~500-1000 tokens)
```

## Block/Component Insertion Flow

```mermaid
flowchart TD
    Pick["User picks shadcn block"]
    
    subgraph picker [ShadcnBlockPicker]
        Fetch["Fetch registry item + dependencies"]
        Sections["Analyze current page sections"]
        Placement["User selects placement"]
    end
    
    subgraph prompt [shadcn-registry-utils.ts]
        BuildPrompt["buildShadcnBlockPrompt()"]
        ExistUI{"existingUiComponents provided?"}
        ExplicitList["Include explicit component list"]
        GenericCheck["Instruct v0 to check and create"]
        ImportMap["Add registry import mappings"]
        Files["Include registry file content"]
    end
    
    subgraph send [ChatInterface.tsx]
        Summary["User-friendly summary"]
        Technical["Technical instructions"]
        Send["sendMessagePayload()"]
    end
    
    Pick --> Fetch --> Sections --> Placement
    Placement --> BuildPrompt
    BuildPrompt --> ExistUI
    ExistUI -->|Yes| ExplicitList
    ExistUI -->|No| GenericCheck
    ExplicitList --> ImportMap
    GenericCheck --> ImportMap
    ImportMap --> Files
    Files --> Summary --> Technical --> Send
```

## Settings State

| Setting | Type | Default | Persisted | Location |
|---------|------|---------|-----------|----------|
| designTheme | DesignTheme | "blue" | localStorage | page.tsx |
| specMode | boolean | false | localStorage | page.tsx |
| modelTier | ModelTier | "v0-max" | URL param | page.tsx |
| enableThinking | boolean | true | localStorage | page.tsx |
| enableImageGenerations | boolean | true | localStorage | page.tsx |
| enableBlobMedia | boolean | true | localStorage | page.tsx |
| promptAssistDeep | boolean | true | state | page.tsx |
| promptAssistModel | string | "openai/gpt-5.2" | state | page.tsx |
| customInstructions | string | DEFAULT_CUSTOM_INSTRUCTIONS | localStorage (per chat) | page.tsx |
| showStructuredChat | boolean | false | localStorage | page.tsx |
