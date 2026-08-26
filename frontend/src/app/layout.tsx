import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CC - indirect | AI Coding Assistant',
  description: 'AI-powered coding assistant. Describe what you want — it writes, runs, debugs, and deploys.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
