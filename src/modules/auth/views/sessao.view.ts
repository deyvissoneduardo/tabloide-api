import type { LojistaView } from '../../lojistas/views/lojista.view';

export interface SessaoView {
  lojista: LojistaView;
  token: string;
  expiraEm: string;
}
