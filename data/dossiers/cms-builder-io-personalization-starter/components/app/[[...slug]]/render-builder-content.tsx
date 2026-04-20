'use client';

import { BuilderComponent } from '@builder.io/react';

type Props = {
  model: string;
  content: any;
};

export function RenderBuilderContent({ model, content }: Props) {
  return <BuilderComponent model={model} content={content} />;
}
