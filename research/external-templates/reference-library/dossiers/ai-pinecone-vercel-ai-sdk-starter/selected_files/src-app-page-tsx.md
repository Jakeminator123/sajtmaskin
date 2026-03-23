# src/app/page.tsx

Reason: Useful structural reference

```text
"use client";

import React, { useEffect, useRef, useState, FormEvent } from "react";
import { Context } from "@/components/Context";
import Header from "@/components/Header";
import Chat from "@/components/Chat";
import { useChat } from "ai/react";
import InstructionModal from "./components/InstructionModal";
import { AiFillGithub, AiOutlineInfoCircle } from "react-icons/ai";

const Page: React.FC = () => {
  const [gotMessages, setGotMessages] = useState(false);
  const [context, setContext] = useState<string[] | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    onFinish: async () => {
      setGotMessages(true);
    },
  });

  const prevMessagesLengthRef = useRef(messages.length);

  const handleMessageSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(e);
    setContext(null);
    setGotMessages(false);
  };

  useEffect(() => {
    const getContext = async () => {
      const response = await fetch("/api/context", {
        method: "POST",
        body: JSON.stringify({
          messages,
        }),
      });
      const { context } = await response.json();
      setContext(context.map((c: any) => c.id));
    };
    if (gotMessages && messages.length >= prevMessagesLengthRef.current) {
      getContext();
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, gotMessages]);

  return (
    <div className="flex flex-col justify-between h-screen bg-gray-800 p-2 mx-auto max-w-full">
      <Header className="my-5" />
      <a
        className="fixed left-4 top-4 md:right-14 md:top-6 text-xl text-white"
        href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpinecone-io%2Fpinecone-vercel-starter&env=OPENAI_API_KEY,PINECONE_API_KEY,PINECONE_CLOUD,PINECONE_REGION,PINECONE_INDEX&envDescription=API%20Keys%20needed%20to%20run%20the%20application&envLink=https%3A%2F%2Fdocs.pinecone.io%2Fdocs%2Fprojects%23api-keys&project-name=my-awesome-pinecone-vercel-project&repository-name=my-awesome-pinecone-vercel-project&demo-title=Pinecone%20%2B%20Vercel%20AI%20SDK%20Starter&demo-description=A%20Next.js%20starter%20chatbot%20using%20Vercel's%20AI%20SDK%20and%20implements%20the%20Retrieval-Augmented%20Generation%20(RAG)%20pattern%20wi

// ... truncated
```
