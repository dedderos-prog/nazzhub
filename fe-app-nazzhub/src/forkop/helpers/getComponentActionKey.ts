import type { StoreType } from '../services/store.service';
import type { Nazzhub } from '../types';

export type UpdatesActionKey = keyof StoreType['updatesActions'];

const componentActionKeyMap: Record<string, UpdatesActionKey> = {
  'nazzhub:check_update': 'nazzhubCheck',
  'nazzhub:install': 'nazzhubInstall',
  'sing_box:check_update': 'singBoxCheck',
  'sing_box:install': 'singBoxInstall',
  'sing_box:install_extended': 'singBoxInstallExtended',
  'sing_box:install_extended_compressed': 'singBoxInstallExtendedCompressed',
  'sing_box:install_tiny': 'singBoxInstallTiny',
  'sing_box:install_stable': 'singBoxInstallStable',
  'zapret:check_update': 'zapretCheck',
  'zapret:install': 'zapretInstall',
  'zapret:remove': 'zapretRemove',
  'zapret2:check_update': 'zapret2Check',
  'zapret2:install': 'zapret2Install',
  'zapret2:remove': 'zapret2Remove',
  'byedpi:check_update': 'byedpiCheck',
  'byedpi:install': 'byedpiInstall',
  'byedpi:remove': 'byedpiRemove',
};

export function getComponentActionKey(
  component: Nazzhub.ComponentName,
  action: Nazzhub.ComponentAction,
): UpdatesActionKey | undefined {
  return componentActionKeyMap[`${component}:${action}`];
}
