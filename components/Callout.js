import Link from '@/components/Link'

export default function Callout({ text, linkText, link, postLinkText }) {
  return (
    <div className="flex p-2 border dark:border-gray-500 bg-gray-50 dark:bg-gray-600 rounded-xl">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0 mt-[2px] pr-1 h-6 w-6 text-primary-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>
        {text}&nbsp;
        <Link href={link}>{linkText}</Link>
        {postLinkText}
      </span>
    </div>
  )
}
