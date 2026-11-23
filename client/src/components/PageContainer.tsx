import type { ReactNode } from 'react'

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      {children}
    </main>
  )
}
