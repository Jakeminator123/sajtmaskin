# app/page.tsx

Reason: Useful structural reference

```text
import React from "react";
import Image from "next/image";
import Link from "next/link";

import {createClient, starhiveApiToken, starhiveWorkspaceId} from "@/app/api/ClientFactory";
import {OnboardingStep} from "@/app/components/OnboardingStep";
import {StarhivePage} from "@/app/api/starhive/client/StarhivePage";
import {StarhiveTypeEnriched} from "@/app/api/starhive/client/StarhiveTypeEnriched";
import CodeBlock from "@/app/components/CodeBlock";

export default async function Home() {

    const workspaceIdSetupCompleted = starhiveWorkspaceId() !== undefined
    const apiKeySetupCompleted = starhiveApiToken() !== undefined

    let types: StarhivePage<StarhiveTypeEnriched> | undefined = undefined
    let schemaGenerated = false
    let client
    if (workspaceIdSetupCompleted && apiKeySetupCompleted) {
        client = createClient()
        types = await client.getTypesEnriched();
        if (client.decoders.size > 0) {
            schemaGenerated = true
        }
    }
    const typeCreationCompleted = types !== undefined && types.total > 0

    return (
        <>
            <div className="container mx-auto py-20">
                <Link href="https://www.starhive.com" style={{display: "block"}}>
                    <Image
                        src="/logo.svg"
                        alt="Logo"
                        width="250"
                        height="10"
                        className="relative"
                    />
                </Link>
                <h1 className="title">Build business apps
                    for <em>any</em> purpose in hours, not weeks</h1>
                <div className="text-2xl md:text-3xl pt-8 font-semibold text-blue-600">
                Starhive + Next.js starter
                </div>
                <div className="paragraph">
                    This is a demo page that helps you get started with your Next.js app using Starhive platform as
                    a backend.
                </div>
                <div className="paragraph">
                    Follow the onboarding steps to set up your workspace, define your types and auto generate domain
                    classes.
                </div>
                <div className="mx-auto">
                    <OnboardingStep title="Create an Account and Workspace" completed={workspaceIdSetupComp

// ... truncated
```
