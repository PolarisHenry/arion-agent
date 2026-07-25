'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { createLlmModelMutation, updateLlmModelMutation } from '../api/mutations';
import { probeLlmModels } from '../api/service';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { llmModelKeys } from '../api/queries';
import {
  LLM_PROVIDER_PRESETS,
  type LlmModel,
  type LlmProvider,
  type LlmModelMutationPayload
} from '../api/types';

interface LlmModelFormSheetProps {
  model?: LlmModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LlmModelFormSheet({ model, open, onOpenChange }: LlmModelFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = !!model;

  const [name, setName] = useState(model?.name ?? '');
  const [provider, setProvider] = useState<LlmProvider>(model?.provider ?? 'deepseek');
  const [baseUrl, setBaseUrl] = useState(model?.baseUrl ?? LLM_PROVIDER_PRESETS[0].baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState(model?.modelName ?? '');
  const [temperature, setTemperature] = useState(String(model?.temperature ?? 0.7));
  const [maxTokens, setMaxTokens] = useState(String(model?.maxTokens ?? 8192));
  const [loopMaxTokens, setLoopMaxTokens] = useState(
    model?.loopMaxTokens != null ? String(model.loopMaxTokens) : ''
  );
  const [isActive, setIsActive] = useState(model?.isActive ?? true);

  // Model dropdown state — list is fetched on demand from the provider's
  // /models endpoint (server-side probe keeps the key out of the browser).
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [probePending, setProbePending] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const createMutation = useMutation({
    ...createLlmModelMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: llmModelKeys.all });
      toast.success(t('LLM model created successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });
  const updateMutation = useMutation({
    ...updateLlmModelMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: llmModelKeys.all });
      toast.success(t('LLM model updated successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const onProviderChange = (p: LlmProvider) => {
    setProvider(p);
    const preset = LLM_PROVIDER_PRESETS.find((x) => x.provider === p);
    if (preset && preset.baseUrl) setBaseUrl(preset.baseUrl);
  };

  const fetchModels = useCallback(async () => {
    if (!baseUrl.trim()) return;
    // Create flow needs a typed key (nothing stored yet); edit flow can fall
    // back to the stored key via modelId.
    if (!isEdit && !apiKey.trim()) {
      setProbeError(t('Enter API Key to fetch models'));
      setModelOptions([]);
      return;
    }
    setProbePending(true);
    setProbeError(null);
    try {
      const res = await probeLlmModels({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        modelId: isEdit ? model?.id : undefined
      });
      setModelOptions(res.models ?? []);
      if ((res.models ?? []).length === 0) setProbeError(t('No models returned'));
    } catch (err: any) {
      setProbeError(localizeApiError(err?.message, t));
      setModelOptions([]);
    } finally {
      setProbePending(false);
    }
  }, [baseUrl, apiKey, isEdit, model?.id, t]);

  const onPickerOpenChange = (next: boolean) => {
    setModelOpen(next);
    // Auto-fetch on first open when we have enough to try and haven't already.
    if (next && modelOptions.length === 0 && !probePending && (isEdit || apiKey.trim())) {
      void fetchModels();
    }
  };

  const handleSubmit = () => {
    // apiKey is required only on create — editing leaves it blank to keep the
    // current key (handled below by deleting it from the payload).
    if (!name.trim() || !modelName.trim()) return;
    if (!isEdit && !apiKey.trim()) return;
    const loopBudget = loopMaxTokens.trim() === '' ? null : Number(loopMaxTokens);
    const payload: LlmModelMutationPayload = {
      name: name.trim(),
      provider,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      modelName: modelName.trim(),
      temperature: Number(temperature),
      maxTokens: Number(maxTokens),
      loopMaxTokens: loopBudget,
      isActive
    };
    if (isEdit && model) {
      const values: Partial<LlmModelMutationPayload> = { ...payload };
      if (!apiKey.trim()) delete values.apiKey;
      updateMutation.mutate({ id: model.id, values });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = isEdit
    ? name.trim() !== '' && modelName.trim() !== ''
    : name.trim() !== '' && modelName.trim() !== '' && apiKey.trim() !== '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='gap-0 sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('Edit LLM Model') : t('Create LLM Model')}</SheetTitle>
          <SheetDescription>{t('Manage LLM models')}</SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-5 overflow-y-auto px-6 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='llm-name'>{t('name')}</Label>
            <Input
              id='llm-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. DeepSeek Production')}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='llm-provider'>{t('Provider')}</Label>
            <Select value={provider} onValueChange={(v) => v && onProviderChange(v as LlmProvider)}>
              <SelectTrigger id='llm-provider'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROVIDER_PRESETS.map((p) => (
                  <SelectItem key={p.provider} value={p.provider}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='llm-baseurl'>{t('Base URL')}</Label>
            <Input id='llm-baseurl' value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='llm-apikey'>{t('API Key')}</Label>
            <Input
              id='llm-apikey'
              type='password'
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? model?.apiKeyMasked : 'sk-...'}
            />
            {isEdit && (
              <p className='text-muted-foreground text-xs'>
                {t('Leave blank to keep current key')}
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <Label htmlFor='llm-modelname'>{t('Model')}</Label>
            </div>
            <div className='flex gap-2'>
              <Input
                id='llm-modelname'
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder='deepseek-chat / gpt-4o / claude-sonnet-4-5'
                className='flex-1'
              />
              <Popover open={modelOpen} onOpenChange={onPickerOpenChange}>
                <PopoverTrigger
                  render={
                    <Button
                      variant='outline'
                      size='icon'
                      type='button'
                      disabled={!baseUrl.trim()}
                      aria-label={t('Select model')}
                    />
                  }
                >
                  {probePending ? (
                    <Icons.spinner className='h-4 w-4 animate-spin' />
                  ) : (
                    <Icons.chevronsUpDown className='h-4 w-4' />
                  )}
                </PopoverTrigger>
                <PopoverContent className='w-80 p-0' align='end'>
                  <Command>
                    <CommandInput placeholder={t('Search models')} />
                    <CommandList>
                      <CommandEmpty>
                        {probePending ? t('Loading') : (probeError ?? t('No models found'))}
                      </CommandEmpty>
                      <CommandGroup>
                        {modelOptions.map((m) => (
                          <CommandItem
                            key={m}
                            value={m}
                            onSelect={() => {
                              setModelName(m);
                              setModelOpen(false);
                            }}
                          >
                            <Icons.check
                              className={
                                m === modelName ? 'h-4 w-4 opacity-100' : 'h-4 w-4 opacity-0'
                              }
                            />
                            {m}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  <div className='flex items-center justify-between gap-2 border-t px-2 py-1.5'>
                    <span className='text-muted-foreground truncate text-xs'>
                      {probeError ?? t('Auto-fetched from provider')}
                    </span>
                    <Button
                      variant='ghost'
                      size='sm'
                      type='button'
                      onClick={() => void fetchModels()}
                      disabled={probePending || !baseUrl.trim()}
                    >
                      {t('Refresh')}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('Click the list icon to pick, or type manually')}
            </p>
          </div>

          {/* — 生成参数 — */}
          <div className='space-y-3'>
            <div className='text-muted-foreground text-xs font-semibold'>{t('Generation')}</div>
            <div className='space-y-2'>
              <Label htmlFor='llm-temp'>{t('Temperature')}</Label>
              <Input
                id='llm-temp'
                type='number'
                step='0.1'
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
              <p className='text-muted-foreground text-xs'>{t('Temperature hint')}</p>
            </div>
          </div>

          {/* — 用量上限 — */}
          <div className='space-y-3'>
            <div className='text-muted-foreground text-xs font-semibold'>{t('Limits')}</div>
            <div className='space-y-2'>
              <Label htmlFor='llm-maxtok'>{t('Max Tokens')}</Label>
              <Input
                id='llm-maxtok'
                type='number'
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
              <p className='text-muted-foreground text-xs'>{t('Max Tokens hint')}</p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='llm-loopbudget'>{t('Loop token budget')}</Label>
              <Input
                id='llm-loopbudget'
                type='number'
                value={loopMaxTokens}
                onChange={(e) => setLoopMaxTokens(e.target.value)}
                placeholder={t('Default (auto)')}
              />
              <p className='text-muted-foreground text-xs'>{t('Loop token budget hint')}</p>
            </div>
          </div>

          <label className='flex cursor-pointer items-center gap-2'>
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
            <span className='text-sm'>{t('Active')}</span>
          </label>
        </div>

        <SheetFooter className='flex-row justify-end gap-2 px-6'>
          <Button variant='outline' type='button' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending} disabled={!canSubmit}>
            <Icons.check /> {isEdit ? t('Update') : t('Create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function LlmModelFormSheetTrigger() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> {t('Create LLM Model')}
      </Button>
      {open && <LlmModelFormSheet model={null} open={open} onOpenChange={setOpen} />}
    </>
  );
}
