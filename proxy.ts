import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Cookie name for "user has a username" flag — avoids a DB query on every page load
const HAS_USERNAME_COOKIE = 'gs_hun';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Validate session server-side (required — never skip this)
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const hasUsernameCookie = request.cookies.get(HAS_USERNAME_COOKIE)?.value === '1'

  // --- Not logged-in guard: protect all app pages ---
  const protectedPrefixes = [
    '/dashboard', '/onboarding', '/gantt', '/profile',
    '/my-gantts', '/customization', '/help',
  ]
  if (!user && protectedPrefixes.some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // --- Logged in + visiting landing or auth pages → redirect to app ---
  if (user && (path === '/' || path.startsWith('/auth'))) {
    // If we already know they have a username, skip the DB query
    if (hasUsernameCookie) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (!profile?.username) {
      return NextResponse.redirect(new URL('/onboarding/username', request.url))
    }

    // Has username — set cookie and redirect to dashboard
    const redirectRes = NextResponse.redirect(new URL('/dashboard', request.url))
    redirectRes.cookies.set(HAS_USERNAME_COOKIE, '1', {
      maxAge: COOKIE_MAX_AGE,
      sameSite: 'strict',
      path: '/',
    })
    return redirectRes
  }

  // --- Logged in + visiting app pages (not onboarding) → ensure username exists ---
  if (user && !path.startsWith('/onboarding')) {
    if (!hasUsernameCookie) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

      if (!profile?.username) {
        return NextResponse.redirect(new URL('/onboarding/username', request.url))
      }

      // Username confirmed — cache it so future requests skip this query
      supabaseResponse.cookies.set(HAS_USERNAME_COOKIE, '1', {
        maxAge: COOKIE_MAX_AGE,
        sameSite: 'strict',
        path: '/',
      })
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/auth/:path*',
    '/onboarding/:path*',
    '/gantt/:path*',
    '/profile',
    '/profile/:path*',
    '/my-gantts',
    '/my-gantts/:path*',
    '/customization',
    '/customization/:path*',
    '/help',
    '/help/:path*',
  ],
}

