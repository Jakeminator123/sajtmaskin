export const notionConfig = {
  rootPageId: process.env.NOTION_ROOT_PAGE_ID || '',
  token: process.env.NOTION_TOKEN || '',
}

export function assertNotionConfig() {
  if (!notionConfig.rootPageId) {
    throw new Error('Missing NOTION_ROOT_PAGE_ID')
  }
}
