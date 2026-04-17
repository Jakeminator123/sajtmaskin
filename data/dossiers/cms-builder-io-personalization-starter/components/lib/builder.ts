import { builder } from '@builder.io/sdk';

const apiKey = process.env.NEXT_PUBLIC_BUILDER_API_KEY;

if (!apiKey) {
  throw new Error('Missing NEXT_PUBLIC_BUILDER_API_KEY');
}

builder.init(apiKey);

export { builder };
