import { NextResponse } from 'next/server';
import { resolveServerAuth } from '@/lib/rbac/user-permissions';

export async function GET() {
  const resolved = await resolveServerAuth();
  if (resolved.status !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fullUser, permissions } = resolved;
  return NextResponse.json({
    user: {
      id: fullUser.id,
      name: fullUser.name,
      email: fullUser.email,
      ownerId: fullUser.ownerId,
      roleId: fullUser.roleId
    },
    permissions
  });
}
