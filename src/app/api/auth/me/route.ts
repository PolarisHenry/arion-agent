import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { role, user as userTable } from '@/lib/auth-schema';
import { eq } from 'drizzle-orm';
import { ALL_PERMISSIONS } from '@/lib/rbac/permissions';
import { headers } from 'next/headers';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionUser = session.user;
  const [fullUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);

  let permissions: string[];

  if (fullUser && fullUser.ownerId === null) {
    // Master account — all permissions implicitly
    permissions = [...ALL_PERMISSIONS];
  } else if (fullUser?.roleId) {
    // Sub-account — resolve via assigned role
    const [roleRow] = await db.select().from(role).where(eq(role.id, fullUser.roleId)).limit(1);
    permissions = roleRow?.permissions ?? [];
  } else {
    permissions = [];
  }

  return NextResponse.json({
    user: {
      id: fullUser?.id ?? sessionUser.id,
      name: fullUser?.name ?? sessionUser.name,
      email: fullUser?.email ?? sessionUser.email,
      ownerId: fullUser?.ownerId ?? null,
      roleId: fullUser?.roleId ?? null
    },
    permissions
  });
}
