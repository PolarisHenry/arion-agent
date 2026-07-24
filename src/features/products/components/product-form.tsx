'use client';

import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createProductMutation, updateProductMutation } from '../api/mutations';
import type { Product } from '../api/types';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import * as z from 'zod';
import { productSchema, type ProductFormValues } from '@/features/products/schemas/product';
import { categoryOptions } from '@/features/products/constants/product-options';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';

export default function ProductForm({
  initialData,
  pageTitle
}: {
  initialData: Product | null;
  pageTitle: string;
}) {
  const router = useRouter();
  const isEdit = !!initialData;
  const { t } = useTranslation();

  const createMutation = useMutation({
    ...createProductMutation,
    onSuccess: () => {
      toast.success(t('Product created successfully'));
      router.push('/dashboard/product');
    },
    onError: (err: any) => {
      toast.error(localizeApiError(err?.message, t));
    }
  });

  const updateMutation = useMutation({
    ...updateProductMutation,
    onSuccess: () => {
      toast.success(t('Product updated successfully'));
      router.push('/dashboard/product');
    },
    onError: (err: any) => {
      toast.error(localizeApiError(err?.message, t));
    }
  });

  const form = useAppForm({
    defaultValues: {
      image: undefined,
      name: initialData?.name ?? '',
      category: initialData?.category ?? '',
      price: initialData?.price,
      description: initialData?.description ?? ''
    } as ProductFormValues,
    validators: {
      onSubmit: productSchema
    },
    onSubmit: ({ value }) => {
      const payload = {
        name: value.name,
        category: value.category,
        price: value.price!,
        description: value.description
      };

      if (isEdit) {
        updateMutation.mutate({ id: initialData.id, values: payload });
      } else {
        createMutation.mutate(payload);
      }
    }
  });

  const { FormTextField, FormSelectField, FormTextareaField, FormFileUploadField } =
    useFormFields<ProductFormValues>();

  return (
    <Card className='mx-auto w-full'>
      <CardHeader>
        <CardTitle className='text-left text-2xl font-bold'>{pageTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form.AppForm>
          <form.Form className='space-y-8'>
            <FormFileUploadField
              name='image'
              label={t('Product Image')}
              description={t('Upload a product image')}
              maxSize={5 * 1024 * 1024}
              maxFiles={4}
            />

            <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
              <FormTextField
                name='name'
                label={t('Product Name')}
                required
                placeholder={t('Enter product name')}
                validators={{
                  onBlur: z.string().min(2, t('Product name must be at least 2 characters.'))
                }}
              />

              <FormSelectField
                name='category'
                label={t('Category')}
                required
                options={categoryOptions.map((o) => ({ value: o.value, label: t(o.label) }))}
                placeholder={t('Select category')}
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
                step={0.01}
                placeholder={t('Enter price')}
                validators={{
                  onBlur: z.number({ message: t('Price is required') })
                }}
              />
            </div>

            <FormTextareaField
              name='description'
              label={t('Description')}
              required
              placeholder={t('Enter product description')}
              maxLength={500}
              rows={4}
              validators={{
                onBlur: z.string().min(10, t('Description must be at least 10 characters.'))
              }}
            />

            <div className='flex justify-end gap-2'>
              <Button type='button' variant='outline' onClick={() => router.back()}>
                {t('Back')}
              </Button>
              <form.SubmitButton>
                {isEdit ? t('Update Product') : t('Add Product')}
              </form.SubmitButton>
            </div>
          </form.Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
