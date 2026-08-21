import { AppShell, NavLink, Group } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconMessageCircle, IconDatabase, IconSettings } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { RouteName } from '../router/useHashRoute';

interface NavShellProps {
  readonly route: RouteName;
  readonly onNavigate: (route: RouteName) => void;
  readonly children: ReactNode;
}

const NAV_ITEMS: ReadonlyArray<{ readonly route: RouteName; readonly label: string; readonly icon: typeof IconMessageCircle }> = [
  { route: 'chat', label: 'Chat', icon: IconMessageCircle },
  { route: 'models', label: 'Models', icon: IconDatabase },
  { route: 'settings', label: 'Settings', icon: IconSettings },
];

export function NavShell({ route, onNavigate, children }: NavShellProps): ReactNode {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <AppShell
      navbar={isDesktop ? { width: 220, breakpoint: 'sm' } : undefined}
      footer={!isDesktop ? { height: 64 } : undefined}
      padding="md"
    >
      {isDesktop && (
        <AppShell.Navbar p="md" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.route}
              label={item.label}
              leftSection={<item.icon size={18} stroke={1.75} />}
              active={route === item.route}
              onClick={() => onNavigate(item.route)}
              component="button"
              style={{ borderLeft: route === item.route ? '2px solid var(--mantine-color-white)' : '2px solid transparent' }}
            />
          ))}
        </AppShell.Navbar>
      )}

      <AppShell.Main>{children}</AppShell.Main>

      {!isDesktop && (
        <AppShell.Footer>
          <Group grow h="100%" gap={0} component="nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.route}
                label={item.label}
                leftSection={<item.icon size={20} stroke={1.75} />}
                active={route === item.route}
                onClick={() => onNavigate(item.route)}
                component="button"
                style={{ flexDirection: 'column', justifyContent: 'center', height: '100%', minHeight: 44 }}
              />
            ))}
          </Group>
        </AppShell.Footer>
      )}
    </AppShell>
  );
}
