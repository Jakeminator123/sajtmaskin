export const settingsQuery = `*[_type == "settings"][0]`

export const pageBySlugQuery = `*[_type == "page" && slug.current == $slug][0]`

export const projectBySlugQuery = `*[_type == "project" && slug.current == $slug][0]`

export const allProjectsQuery = `*[_type == "project"] | order(publishedAt desc)`
