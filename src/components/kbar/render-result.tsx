import { KBarResults, useMatches } from 'kbar';
import ResultItem from './result-item';
import { useTranslation } from '@/lib/i18n';

export default function RenderResults() {
  const { results, rootActionId } = useMatches();
  const { t } = useTranslation();

  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) =>
        typeof item === 'string' ? (
          <div className='text-muted-foreground px-4 py-2 text-sm uppercase'>{t(item)}</div>
        ) : (
          <ResultItem action={item} active={active} currentRootActionId={rootActionId ?? ''} />
        )
      }
    />
  );
}
