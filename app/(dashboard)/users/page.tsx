import { requireOwner } from '@/lib/auth';
import { listUsers } from '@/lib/users';
import { PageHeader } from '@/components/page-header';
import { UsersManager } from './users-manager';

export const metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await requireOwner();
  const users = await listUsers();
  return (
    <>
      <PageHeader title="Users" description="Owners manage everything. Agents work conversations and escalations and can read the knowledge base and prompts." />
      <UsersManager
        meId={me.id}
        users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active === 1, pending: u.has_password !== 1, createdAt: u.created_at, lastLoginAt: u.last_login_at }))}
      />
    </>
  );
}
