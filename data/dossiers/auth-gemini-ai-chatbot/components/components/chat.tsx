"use client"

import { useChat } from "@ai-sdk/react"
import { useState } from "react"

export function Chat() {
  const [input, setInput] = useState("")
  const { messages, sendMessage, status } = useChat({
    api: "/api/chat",
  })

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 12 }}>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>{" "}
            {message.parts
              ?.filter((part) => part.type === "text")
              .map((part, index) => (
                <span key={index}>{part.text}</span>
              ))}
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!input.trim()) return
          sendMessage({ text: input })
          setInput("")
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something..."
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={status !== "ready"}>
          Send
        </button>
      </form>
    </div>
  )
}
