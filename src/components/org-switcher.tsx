'use client';

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useTranslation } from '@/lib/i18n';

// The Arion brand mark (from public/logo.svg), inlined so it inherits
// `currentColor` and stays visible on the sidebar-primary badge in every theme.
function BrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 1254 1254' className={className} fill='currentColor' aria-hidden='true'>
      <path d='M 799 196 L 718 329 L 502 691 L 499 692 L 500 694 L 487 716 L 484 717 L 485 719 L 431 808 L 431 810 L 446 803 L 467 796 L 490 791 L 517 788 L 539 788 L 559 790 L 583 795 L 608 804 L 627 814 L 651 831 L 670 849 L 687 870 L 700 890 L 714 917 L 727 950 L 734 973 L 740 998 L 740 1004 L 742 1008 L 738 908 L 738 762 L 744 638 L 752 540 L 767 407 L 782 298 Z' />
    </svg>
  );
}

export function OrgSwitcher() {
  const { t } = useTranslation();

  // Top-left is the brand: the real logo + product name. The signed-in user
  // lives in the sidebar footer.
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground'
        >
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg'>
            <BrandLogo className='size-5' />
          </div>
          <div className='flex flex-1 items-center text-left'>
            <span className='text-lg font-bold tracking-tight'>{t('Arion Agent')}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
