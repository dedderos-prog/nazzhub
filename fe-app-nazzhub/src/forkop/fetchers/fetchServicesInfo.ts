import { NazzhubShellMethods } from '../methods';
import { logger } from '../services/logger.service';
import { store } from '../services/store.service';
import { refreshRuntimeUiState } from '../services/runtimeUiState.service';
import { Nazzhub } from '../types';

let latestServicesInfoRequestId = 0;

function getSettledMethodResponse<T>(
  scope: string,
  result: PromiseSettledResult<Nazzhub.MethodResponse<T>>,
): Nazzhub.MethodResponse<T> {
  if (result.status === 'fulfilled') {
    return result.value;
  }

  logger.error('[SERVICES_INFO]', `${scope} failed`, result.reason);

  return {
    success: false,
    error: result.reason instanceof Error ? result.reason.message : '',
  };
}

export async function fetchServicesInfo() {
  const requestId = ++latestServicesInfoRequestId;
  const uiState = await refreshRuntimeUiState({ force: true });

  if (requestId !== latestServicesInfoRequestId) {
    return;
  }

  if (uiState) {
    return uiState;
  }

  const [nazzhubResult, singboxResult] = await Promise.allSettled([
    NazzhubShellMethods.getStatus(),
    NazzhubShellMethods.getSingBoxStatus(),
  ]);

  if (requestId !== latestServicesInfoRequestId) {
    return;
  }

  const nazzhub = getSettledMethodResponse('getStatus', nazzhubResult);
  const singbox = getSettledMethodResponse('getSingBoxStatus', singboxResult);
  const previousData = store.get().servicesInfoWidget.data;

  store.set({
    servicesInfoWidget: {
      loading: false,
      failed: !nazzhub.success || !singbox.success,
      data: {
        singbox: singbox.success ? singbox.data.running : previousData.singbox,
        nazzhubRunning: nazzhub.success
          ? nazzhub.data.running
          : previousData.nazzhubRunning,
        nazzhubEnabled: nazzhub.success
          ? nazzhub.data.enabled
          : previousData.nazzhubEnabled,
        nazzhubStatus: nazzhub.success
          ? nazzhub.data.status
          : previousData.nazzhubStatus,
      },
    },
  });

  return undefined;
}
