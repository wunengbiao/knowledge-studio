import { Outlet, useLocation } from 'react-router-dom'

// Derive a stable key per "page type" from the URL so navigating between
// different page kinds (home -> chat -> settings) remounts and replays the
// enter animation, while navigation within the same page kind (e.g. switching
// /chat/1 -> /chat/2) does NOT remount - preserving local state like draft
// input and scroll position.
function getPageKey(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'home'
  const [first] = segments
  if (first === 'kb') {
    const sub = segments[2]
    if (sub === 'search') return 'kb-search'
    if (sub === 'graph') return 'kb-graph'
    return 'kb-detail'
  }
  // /chat and /chat/:id render the same ChatPage component.
  if (first === 'chat') return 'chat'
  return first
}

export function AnimatedOutlet() {
  const location = useLocation()
  const pageKey = getPageKey(location.pathname)
  return (
    <div key={pageKey} className="page-enter h-full min-h-0">
      <Outlet />
    </div>
  )
}
