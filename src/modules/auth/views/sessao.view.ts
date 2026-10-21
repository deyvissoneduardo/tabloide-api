import type { LojistaView } from '../../lojistas/views/lojista.view';

export class SessaoView {
  lojista!: LojistaView;
  token!: string;
  expiraEm!: string;
}
