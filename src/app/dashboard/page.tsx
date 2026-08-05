import { redirect } from 'next/navigation';
import { resolveLandingPath } from '@/lib/rbac/user-permissions';

export default async function Dashboard() {
  redirect(await resolveLandingPath());
}
