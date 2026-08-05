import { redirect } from 'next/navigation';
import { resolveServerAuth } from '@/lib/rbac/user-permissions';
import { getFirstAccessiblePath } from '@/lib/rbac/nav-access';
import { PERMISSIONS } from '@/lib/rbac/permissions';

// Server-side guard for the homepage route. The parallel slots + layout below
// provide the UI; this page renders nothing on success (returns null) and only
// exists to keep users without dashboard:view off this route (direct URL / bookmark).
export default async function Page() {
  const resolved = await resolveServerAuth();
  if (resolved.status !== 'authenticated') {
    redirect('/sign-in');
  }
  if (!resolved.permissions.includes(PERMISSIONS.DASHBOARD_VIEW)) {
    redirect(getFirstAccessiblePath(resolved.permissions) ?? '/no-access');
  }
  return null;
}
