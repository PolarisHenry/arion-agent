import { useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';
import { useThemeConfig } from '@/components/themes/active-theme';
import { THEMES } from '@/components/themes/theme.config';
import { useTranslation } from '@/lib/i18n';

const useThemeSwitching = () => {
  const { setTheme, resolvedTheme } = useTheme();
  const { activeTheme, setActiveTheme } = useThemeConfig();
  const { t } = useTranslation();

  // Label + direction follow the actually-rendered theme (resolvedTheme), so the
  // action reads "Switch to dark mode" while you're in light, and vice versa.
  const isDark = resolvedTheme === 'dark';
  const toggleDarkLight = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const cycleTheme = () => {
    const currentIndex = THEMES.findIndex((t) => t.value === activeTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setActiveTheme(THEMES[nextIndex].value);
  };

  // Two distinct concepts → two distinct labels:
  //  - cycleTheme      → 配色 (color scheme): "Theme" / 主题, shortcut tt
  //  - toggleDarkLight → 深浅色 (light/dark): name flips with resolvedTheme
  //    ("Switch to dark mode" in light, "Switch to light mode" in dark),
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
      name: isDark ? t('Switch to light mode') : t('Switch to dark mode'),
      shortcut: ['d', 'd'],
      section: t('Appearance'),
      perform: toggleDarkLight
    }
  ];

  useRegisterActions(themeActions, [resolvedTheme, activeTheme, t]);
};

export default useThemeSwitching;
