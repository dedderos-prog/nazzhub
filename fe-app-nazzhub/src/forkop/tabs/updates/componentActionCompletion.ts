import type { Nazzhub } from '../../types';

export function shouldApplyCompletedComponentActionResult(
  result: Pick<Nazzhub.ComponentActionResult, 'action'>,
  notify: boolean,
) {
  return result.action !== 'check_update' || notify;
}
