export default function Youtube({ embedId }) {
  return (
    <>
      <iframe
        className="w-full h-[200px] sm:h-96"
        src={`https://www.youtube.com/embed/${embedId}`}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Embedded youtube"
      />
    </>
  )
}
