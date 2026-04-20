import Video from 'next-video'

async function getVideoById(id: string) {
  return {
    id,
    title: 'Video',
    src: 'https://stream.mux.com/VIDEO_PLAYBACK_ID.m3u8',
  }
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const video = await getVideoById(id)

  return (
    <main>
      <h1>{video.title}</h1>
      <Video
        src={video.src}
        controls
        playsInline
      />
    </main>
  )
}
