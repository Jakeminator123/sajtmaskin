'use client';
import React from 'react';

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  // Simple markdown parser for basic formatting
  const renderContent = () => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentParagraph: string[] = [];
    let listItems: string[] = [];
    let inList = false;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        elements.push(
          <p key={elements.length} className="mb-4 text-pretty leading-relaxed">
            {currentParagraph.join(' ')}
          </p>
        );
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={elements.length} className="mb-4 ml-6 list-disc space-y-2">
            {listItems.map((item, i) => (
              <li key={i} className="text-pretty leading-relaxed">{item}</li>
            ))}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    };

    for (const line of lines) {
      // H1
      if (line.startsWith('# ')) {
        flushParagraph();
        flushList();
        elements.push(
          <h1 key={elements.length} className="mb-6 text-balance font-bold text-3xl sm:text-4xl">
            {line.slice(2)}
          </h1>
        );
      }
      // H2
      else if (line.startsWith('## ')) {
        flushParagraph();
        flushList();
        elements.push(
          <h2 key={elements.length} className="mb-4 mt-8 text-balance font-bold text-2xl sm:text-3xl">
            {line.slice(3)}
          </h2>
        );
      }
      // H3
      else if (line.startsWith('### ')) {
        flushParagraph();
        flushList();
        elements.push(
          <h3 key={elements.length} className="mb-3 mt-6 text-balance font-bold text-xl sm:text-2xl">
            {line.slice(4)}
          </h3>
        );
      }
      // List item
      else if (line.match(/^[-*]\s/)) {
        flushParagraph();
        inList = true;
        listItems.push(line.slice(2));
      }
      // Numbered list
      else if (line.match(/^\d+\.\s/)) {
        flushParagraph();
        if (!inList) {
          flushList();
        }
        const match = line.match(/^\d+\.\s(.*)$/);
        if (match) {
          listItems.push(match[1]);
          inList = true;
        }
      }
      // Empty line
      else if (line.trim() === '') {
        flushParagraph();
        if (inList) {
          flushList();
        }
      }
      // Regular text
      else {
        if (inList) {
          flushList();
        }
        currentParagraph.push(line);
      }
    }

    flushParagraph();
    flushList();

    return elements;
  };

  return <div className="prose prose-lg max-w-none">{renderContent()}</div>;
}
