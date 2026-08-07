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

  // Two distinct concepts → two distinct labels:
  //  - cycleTheme      → 配色 (color scheme): "Theme" / 主题, shortcut tt
  //  - toggleDarkLight → 深浅色 (light/dark): "Toggle dark mode" / 切换深色模式,
  //    shortcut dd. Dashboard's old dd shortcut was removed from nav-config to
  //    avoid a collision, so dd uniquely toggles light/dark.
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
      name: t('Toggle dark mode'),
      shortcut: ['d', 'd'],
      section: t('Appearance'),
      perform: toggleDarkLight
    }
  ];

  useRegisterActions(themeActions, [theme, activeTheme, t]);
};

export default useThemeSwitching;
