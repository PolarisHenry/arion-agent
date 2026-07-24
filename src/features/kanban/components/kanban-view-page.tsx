'use client';

import PageContainer from '@/components/layout/page-container';
import { KanbanBoard } from './kanban-board';
import NewTaskDialog from './new-task-dialog';

export default function KanbanViewPage() {
  return (
    <PageContainer>
      <div className='mb-4 flex justify-end'>
        <NewTaskDialog />
      </div>
      <KanbanBoard />
    </PageContainer>
  );
}
