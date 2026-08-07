import { useMemo } from 'react';
import { useKBar, useRegisterActions, type Action } from 'kbar';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';
import { detectTimeConversion, isMathExpression, safeEval } from '@/lib/kbar-quick';

// quick action 的 keywords 与当前输入完全一致，fzf 得分最高，自然浮到结果顶部；
// priority 作为同分情况下的额外保险。
const QUICK_PRIORITY = 90;

async function copyResult(result: string, t: (key: string) => string) {
  try {
    await navigator.clipboard.writeText(result);
    toast.success(t('Result copied to clipboard'));
  } catch {
    toast.error(t('Something went wrong.'));
  }
}

// 根据当前搜索词，动态注入「计算结果 / 时间转换」命令。普通搜索词时返回空
// 数组，不影响现有导航 / 主题等结果。
const useQuickActions = () => {
  const { searchQuery } = useKBar((state) => ({ searchQuery: state.searchQuery }));
  const { t } = useTranslation();

  const actions = useMemo<Action[]>(() => {
    const q = searchQuery.trim();
    if (!q) return [];

    // 时间转换优先：纯数字时间戳不应被当成算式
    const time = detectTimeConversion(q);
    if (time) {
      return [
        {
          id: 'quick-time',
          name: time.name,
          keywords: q,
          section: t('Time'),
          subtitle: q,
          icon: <Icons.clock className='h-4 w-4' />,
          priority: QUICK_PRIORITY,
          perform: () => {
            void copyResult(time.result, t);
          }
        }
      ];
    }

    if (isMathExpression(q)) {
      const result = safeEval(q);
      if (result !== null) {
        return [
          {
            id: 'quick-calculator',
            name: `= ${result}`,
            keywords: q,
            section: t('Calculator'),
            subtitle: q,
            icon: <Icons.calculator className='h-4 w-4' />,
            priority: QUICK_PRIORITY,
            perform: () => {
              void copyResult(result, t);
            }
          }
        ];
      }
    }

    return [];
  }, [searchQuery, t]);

  useRegisterActions(actions, [actions]);
};

export default useQuickActions;
