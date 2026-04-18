/// <reference types="next-video/video-types/global" />

declare module '*.mp4' {
  const value: import('next-video').VideoMetadata
  export default value
}

declare module '*.webm' {
  const value: import('next-video').VideoMetadata
  export default value
}
