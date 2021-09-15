import useSWR from 'swr'
import fetcher from '@/lib/fetcher'
import Goal from '@/components/Goal'

export default function Timeline() {
  const { data } = useSWR('/api/goals', fetcher)

  if (!data) {
    return null
  }

  return null

  // return data.tracks.map((track, index) => (
  //   <Track ranking={index + 1} key={track.songUrl} {...track} />
  // ))
}
