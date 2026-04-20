import React from 'react'
import type { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span>Documentation</span>,
  project: {
    link: 'https://github.com/your-org/your-repo'
  },
  docsRepositoryBase: 'https://github.com/your-org/your-repo/tree/main',
  footer: {
    text: 'Documentation'
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Documentation'
    }
  }
}

export default config
