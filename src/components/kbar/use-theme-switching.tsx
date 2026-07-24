import { useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';
import { useThemeConfig } from '@/components/themes/active-theme';
import { THEMES } from '@/components/themes/theme.config';
import { useTranslation } from '@/lib/i18n';

const useThemeSwitching = () => {
  const { theme, setTheme } = useTheme();
  const { activeTheme, setActiveTheme } = useThemeConfig();
  const { t } = useTranslation();

  const toggleDarkLight = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const cycleTheme = () => {
    const currentIndex = THEMES.findIndex((t) => t.value === activeTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setActiveTheme(THEMES[nextIndex].value);
  };

  const themeActions = [
    {
      id: 'cycleTheme',
      name: t('Theme'),
      shortcut: ['t', 't'],
      section: t('Theme'),
      perform: cycleTheme
    },
    {
      id: 'toggleDarkLight',
      name: t('Theme'),
      shortcut: ['d', 'd'],
      section: t('Theme'),
      perform: toggleDarkLight
    },
    {
      id: 'setLightTheme',
      name: t('Theme'),
      section: t('Theme'),
      perform: () => setTheme('light')
    },
    {
      id: 'setDarkTheme',
      name: t('Theme'),
      section: t('Theme'),
      perform: () => setTheme('dark')
    }
  ];

  useRegisterActions(themeActions, [theme, activeTheme, t]);
};

export default useThemeSwitching;
