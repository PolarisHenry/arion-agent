'use client';

import { useState } from 'react';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import * as z from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SheetFormValues = {
  name: string;
  category: string;
  price: number | undefined;
  description: string;
};

type DialogFormValues = {
  rating: number;
  feedback: string;
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const categoryOptions = [
  { value: 'beauty', label: 'Beauty Products' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'home', label: 'Home & Garden' },
  { value: 'sports', label: 'Sports & Outdoors' }
];

// ---------------------------------------------------------------------------
// Sheet Form
// ---------------------------------------------------------------------------

function SheetFormSection() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const form = useAppForm({
    defaultValues: {
      name: '',
      category: '',
      price: undefined,
      description: ''
    } as SheetFormValues,
    onSubmit: ({ value }) => {
      toast.success(t('Product created successfully!'), {
        description: `${value.name}${t(' has been added.')}`
      });
      setOpen(false);
      form.reset();
    }
  });

  const { FormTextField, FormSelectField, FormTextareaField } = useFormFields<SheetFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Sheet Form')}</CardTitle>
        <CardDescription>
          {t(
            'A product creation form inside a Sheet. The submit button lives in the SheetFooter, outside the form element, connected via the HTML form attribute.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button />}>
            <Icons.add className='mr-2 h-4 w-4' />
            {t('Add Product')}
          </SheetTrigger>
          <SheetContent className='flex flex-col'>
            <SheetHeader>
              <SheetTitle>{t('New Product')}</SheetTitle>
              <SheetDescription>
                {t('Fill in the details below to create a new product.')}
              </SheetDescription>
            </SheetHeader>

            <form.AppForm>
              <form.Form id='sheet-form-id' className='space-y-4 p-0 md:p-0'>
                <FormTextField
                  name='name'
                  label={t('Product Name')}
                  required
                  placeholder={t('Enter product name')}
                  validators={{
                    onBlur: z.string().min(2, t('Product name must be at least 2 characters'))
                  }}
                />

                <FormSelectField
                  name='category'
                  label={t('Category')}
                  required
                  options={categoryOptions.map((o) => ({ value: o.value, label: t(o.label) }))}
                  placeholder={t('Select a category')}
                  validators={{
                    onBlur: z.string().min(1, t('Please select a category'))
                  }}
                />

                <FormTextField
                  name='price'
                  label={t('Price')}
                  required
                  type='number'
                  min={0}
                  step='0.01'
                  placeholder={t('0.00')}
                  validators={{
                    onBlur: z.number().min(0.01, t('Price must be greater than 0'))
                  }}
                />

                <FormTextareaField
                  name='description'
                  label={t('Description')}
                  required
                  placeholder={t('Enter product description')}
                  maxLength={500}
                  rows={4}
                  validators={{
                    onBlur: z.string().min(10, t('Description must be at least 10 characters'))
                  }}
                />
              </form.Form>
            </form.AppForm>

            <SheetFooter className='pt-4'>
              <Button type='button' variant='outline' onClick={() => setOpen(false)}>
                {t('Cancel')}
              </Button>
              <Button type='submit' form='sheet-form-id'>
                {t('Create Product')}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dialog Form
// ---------------------------------------------------------------------------

function DialogFormSection() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const form = useAppForm({
    defaultValues: {
      rating: 5,
      feedback: ''
    } as DialogFormValues,
    onSubmit: ({ value }) => {
      toast.success(t('Feedback submitted!'), {
        description: `${t('Rating: ')}${value.rating}/10${t('/10. Thank you!')}`
      });
      setOpen(false);
      form.reset();
    }
  });

  const { FormSliderField, FormTextareaField } = useFormFields<DialogFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Dialog Form')}</CardTitle>
        <CardDescription>
          {t(
            'A quick feedback form inside a Dialog. Uses composed field components from useFormFields with the submit button in the DialogFooter.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant='outline' />}>
            <Icons.send className='mr-2 h-4 w-4' />
            {t('Send Feedback')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Quick Feedback')}</DialogTitle>
              <DialogDescription>
                {t('Rate your experience and leave a comment.')}
              </DialogDescription>
            </DialogHeader>

            <form.AppForm>
              <form.Form id='dialog-form-id' className='space-y-4 py-2'>
                <FormSliderField
                  name='rating'
                  label={t('Rating')}
                  description={t('Rate your experience (0-10)')}
                  min={0}
                  max={10}
                  step={1}
                />

                <FormTextareaField
                  name='feedback'
                  label={t('Feedback')}
                  required
                  placeholder={t('Tell us what you think...')}
                  maxLength={300}
                  rows={3}
                  validators={{
                    onBlur: z.string().min(5, t('Feedback must be at least 5 characters'))
                  }}
                />
              </form.Form>
            </form.AppForm>

            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setOpen(false)}>
                {t('Cancel')}
              </Button>
              <Button type='submit' form='dialog-form-id'>
                {t('Submit Feedback')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Toast Demo
// ---------------------------------------------------------------------------

function ToastDemoSection() {
  const { t } = useTranslation();

  return (
    <Card className='md:col-span-2'>
      <CardHeader>
        <CardTitle>{t('Toast Notifications')}</CardTitle>
        <CardDescription>
          {t('Trigger different toast variants to preview notification styles.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-wrap gap-2'>
        <Button variant='outline' onClick={() => toast(t('Default toast notification'))}>
          {t('Default')}
        </Button>
        <Button
          variant='outline'
          onClick={() => toast.success(t('Action completed successfully!'))}
        >
          <Icons.circleCheck className='mr-2 h-4 w-4' />
          {t('Success')}
        </Button>
        <Button variant='outline' onClick={() => toast.error(t('Something went wrong.'))}>
          <Icons.circleX className='mr-2 h-4 w-4' />
          {t('Error')}
        </Button>
        <Button
          variant='outline'
          onClick={() => toast.warning(t('Please review before continuing.'))}
        >
          <Icons.warning className='mr-2 h-4 w-4' />
          {t('Warning')}
        </Button>
        <Button variant='outline' onClick={() => toast.info(t('Here is some useful information.'))}>
          <Icons.info className='mr-2 h-4 w-4' />
          {t('Info')}
        </Button>
        <Button
          variant='outline'
          onClick={() =>
            toast.promise(new Promise((resolve) => setTimeout(resolve, 2000)), {
              loading: t('Loading...'),
              success: t('Data loaded!'),
              error: t('Failed to load.')
            })
          }
        >
          <Icons.spinner className='mr-2 h-4 w-4' />
          {t('Promise')}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Demo
// ---------------------------------------------------------------------------

export default function SheetFormDemo() {
  return (
    <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
      <SheetFormSection />
      <DialogFormSection />
      <ToastDemoSection />
    </div>
  );
}
