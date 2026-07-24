'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import type { Product } from '../api/types';
import { notFound } from 'next/navigation';
import ProductForm from './product-form';
import { productByIdOptions } from '../api/queries';
import { useTranslation } from '@/lib/i18n';

type TProductViewPageProps = {
  productId: string;
};

export default function ProductViewPage({ productId }: TProductViewPageProps) {
  const { t } = useTranslation();

  if (productId === 'new') {
    return <ProductForm initialData={null} pageTitle={t('Create New Product')} />;
  }

  return <EditProductView productId={productId} />;
}

function EditProductView({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(productByIdOptions(productId));

  if (!data?.success || !data?.product) {
    notFound();
  }

  return <ProductForm initialData={data.product as Product} pageTitle={t('Edit Product')} />;
}
