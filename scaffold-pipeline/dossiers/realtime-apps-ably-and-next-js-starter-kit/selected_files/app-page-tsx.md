# app/page.tsx

Reason: Useful structural reference

```text
/**
 * Warning: Opening too many live preview tabs will slow down performance.
 * We recommend closing them after you're done.
 */
import React from "react";
import "./global.css";
import Sidebar from "../components/Sidebar";

const Home = () => {

  const pageId = "Start";

  return (
    <>
      <Sidebar pageId={pageId} />
      <div className="flex flex-col grow gap-6 pt-12 pr-12 pb-12 pl-12 rounded-2xl border-slate-100 border-t border-b border-l border-r border-solid border h-[864px] bg-slate-50">
        <div className="flex flex-row justify-center">
          <div className="flex flex-col justify-start items-start gap-4 h-[172px]">
            <div className="flex flex-row justify-center items-center gap-6 w-[264px]">
              <img
                width="96px"
                height="96px"
                src="/assets/AblyLogo.svg"
                alt="AblyLogo"
              />
              <div className="flex justify-center items-center h-6">
                <img
                  width="21.5px"
                  height="21.5px"
                  src="/assets/PlusSign.svg"
                  alt="plus"
                />
              </div>
              <img
                width="96px"
                height="96px"
                src="/assets/NextjsLogo.svg"
                alt="Next.js"
              />
            </div>
            <div className="font-manrope text-[18px] max-w-screen-sm text-slate-800 text-opacity-100 leading-6 font-light">
              <span className="text-black text-opacity-100 font-bold">
                At Ably we are big fans of Next.js&nbsp;
              </span>
              / This application demonstrates using some of the Ably fundamentals
              with Next.js. You can build features and use cases upon these
              fundamentals such as notifications, activity streams, chat, realtime
              visualisations and dashboards, and collaborative multiplayer
              experiences.
            </div>
            <div className="flex flex-col justify-start items-start gap-4 h-[488px]">
              <div className="flex flex-row justify-start items-start gap-4">
                <div className="flex flex-col justify-start items-start pt-6 pr-6 pb-6 pl-6 rounded-2xl h-[216px] bg-white">
                  <div className="flex flex-col justify-

// ... truncated
```
