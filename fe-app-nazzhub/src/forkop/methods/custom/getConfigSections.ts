import { Nazzhub } from '../../types';
import { NAZZHUB_UCI_PACKAGE } from '../../../constants';

export async function getConfigSections(): Promise<Nazzhub.ConfigSection[]> {
  return uci
    .load(NAZZHUB_UCI_PACKAGE)
    .then(() => uci.sections(NAZZHUB_UCI_PACKAGE));
}
