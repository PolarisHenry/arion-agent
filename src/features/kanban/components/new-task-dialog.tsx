'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTaskStore } from '../utils/store';
import { useTranslation } from '@/lib/i18n';

export default function NewTaskDialog() {
  const addTask = useTaskStore((state) => state.addTask);
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const { title, description } = Object.fromEntries(formData);

    if (typeof title !== 'string' || typeof description !== 'string') return;
    addTask(title, description);
  };

  return (
    <Dialog>
      <DialogTrigger render={<Button variant='secondary' size='sm' />}>
        + {t('Add New Task')}
      </DialogTrigger>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>{t('Add New Task')}</DialogTitle>
          <DialogDescription>{t('What do you want to get done today?')}</DialogDescription>
        </DialogHeader>
        <form id='task-form' className='grid gap-4 py-4' onSubmit={handleSubmit}>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Input
              id='title'
              name='title'
              placeholder={t('Task title...')}
              className='col-span-4'
            />
          </div>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Textarea
              id='description'
              name='description'
              placeholder={t('Description...')}
              className='col-span-4'
            />
          </div>
        </form>
        <DialogFooter>
          <DialogClose render={<Button type='submit' size='sm' form='task-form' />}>
            {t('Add Task')}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
