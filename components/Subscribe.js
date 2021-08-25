import { useState, useRef } from 'react'
import Link from 'next/link'
import useSWR from 'swr'

import fetcher from '@/lib/fetcher'
import SuccessMessage from '@/components/SuccessMessage'
import ErrorMessage from '@/components/ErrorMessage'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function Subscribe() {
  const [form, setForm] = useState(false)
  const inputEl = useRef(null)
  const { data } = useSWR('/api/subscribers', fetcher)

  const subscribe = async (e) => {
    e.preventDefault()
    setForm({ state: 'loading' })

    const res = await fetch('/api/subscribe', {
      body: JSON.stringify({
        email: inputEl.current.value,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const { error } = await res.json()
    if (error) {
      setForm({
        state: 'error',
        message: error,
      })
      return
    }

    inputEl.current.value = ''
    setForm({
      state: 'success',
      message: `Hooray! You're now on the list.`,
    })
  }

  return (
    <div className="rounded-xl p-6 xl:p-4 my-4 xl:my-4 w-full bg-gray-50 dark:bg-gray-700">
      <p className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">
        Want more from me?
      </p>
      <p className="my-1 text-gray-800 dark:text-gray-200">
        Subscribe to my newsletter and get emails about leadership, tech, and early access to new
        articles.
      </p>
      <form className="relative my-4 xl:my-2" onSubmit={subscribe}>
        <input
          ref={inputEl}
          aria-label="Email for newsletter"
          placeholder="tim@apple.com"
          type="email"
          autoComplete="email"
          required
          className="px-4 py-2 mt-1 focus:ring-primary-500 focus:border-primary-500 block w-full border-gray-300 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <button
          className="flex items-center justify-center absolute xl:relative right-1 xl:right-0 top-1 px-4 font-bold h-8 bg-gray-100 dark:bg-gray-700 focus:bg-primary-200 text-gray-900 dark:text-gray-100 xl:border rounded w-28"
          type="submit"
        >
          {form.state === 'loading' ? <LoadingSpinner /> : 'Subscribe'}
        </button>
      </form>
      {form.state === 'error' ? (
        <ErrorMessage>{form.message}</ErrorMessage>
      ) : form.state === 'success' ? (
        <SuccessMessage>{form.message}</SuccessMessage>
      ) : null}
    </div>
  )
}
