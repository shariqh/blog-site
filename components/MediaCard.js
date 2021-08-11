import Image from 'next/image'

const MediaCard = ({ isExternalSrc, src, subtext }) => {
  const classes = 'flex p-1 rounded-xl justify-center'

  return (
    <div className="flex flex-col text-center overflow-hidden">
      <div className="flex p-1 rounded-xl justify-center">
        <Image src={src} alt="" width="125" height="125" />
      </div>
      <subtext className="pt-2 text-gray-400 text-lg font-semibold">{subtext}</subtext>
    </div>
  )
}

export default MediaCard
