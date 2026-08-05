import { redirect } from 'next/navigation';
import { resolveLandingPath } from '@/lib/rbac/user-permissions';

export default async function Page() {
  redirect(await resolveLandingPath());
}
