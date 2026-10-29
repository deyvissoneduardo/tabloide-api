import type { Sequelize } from 'sequelize';
import type { CadastrarLojistaDto } from '../../src/modules/lojistas/dtos/cadastrar-lojista.dto';
import { StatusLojista } from '../../src/modules/lojistas/models/status-lojista';
import { ipNovo, type AppDeTeste } from '../helpers/app-de-teste';

/** Builder de dados de cadastro válidos (já normalizados, como saem do ValidationPipe). */
export function umCadastroDeLojista() {
  const dados: CadastrarLojistaDto = {
    nomeFantasia: 'Mercado Bom Preço',
    nomeResponsavel: 'Ana Souza',
    email: 'ana@bompreco.com.br',
    senha: 'senhaForte1',
    whatsapp: '+5511987654321',
    cnpj: null,
  };
  const builder = {
    comEmail(email: string) {
      dados.email = email;
      return builder;
    },
    comSenha(senha: string) {
      dados.senha = senha;
      return builder;
    },
    comCnpj(cnpj: string) {
      dados.cnpj = cnpj;
      return builder;
    },
    semCnpj() {
      dados.cnpj = null;
      return builder;
    },
    build(): CadastrarLojistaDto {
      return { ...dados };
    },
  };
  return builder;
}

let sequencia = 0;

export interface LojistaCriado {
  id: string;
  email: string;
  senha: string;
  token: string;
}

/** Cadastra pela rota real e ajusta o status por SQL, como o administrador faz. */
export function umLojista() {
  sequencia += 1;
  let email = `lojista${sequencia}@teste.com.br`;
  let status: StatusLojista = StatusLojista.AGUARDANDO_ATIVACAO;
  let configuracaoPagina: object | undefined;
  const senha = 'senhaForte1';

  const builder = {
    comEmail(valor: string) {
      email = valor;
      return builder;
    },
    comStatus(valor: StatusLojista) {
      status = valor;
      return builder;
    },
    /** RN46–RN48: grava o jsonb como está (formato interno, com paths), sem passar pela API. */
    comConfiguracaoPagina(valor: object) {
      configuracaoPagina = valor;
      return builder;
    },
    async criar(app: AppDeTeste, sequelize: Sequelize): Promise<LojistaCriado> {
      const resposta = await app
        .http()
        .post('/v1/auth/cadastro')
        .set('X-Forwarded-For', ipNovo())
        .send({ ...umCadastroDeLojista().comEmail(email).build(), whatsapp: '(11) 98765-4321' })
        .expect(201);
      const id: string = resposta.body.lojista.id;
      if (status !== StatusLojista.AGUARDANDO_ATIVACAO) await definirStatus(sequelize, id, status);
      if (configuracaoPagina) await definirConfiguracaoPagina(sequelize, id, configuracaoPagina);
      return { id, email, senha, token: resposta.body.token };
    },
  };
  return builder;
}

export function definirStatus(sequelize: Sequelize, lojistaId: string, status: StatusLojista) {
  return sequelize.query('UPDATE lojista_ativacoes SET status = :status WHERE lojista_id = :lojistaId', {
    replacements: { status, lojistaId },
  });
}

export function definirConfiguracaoPagina(sequelize: Sequelize, lojistaId: string, configuracao: object) {
  return sequelize.query(
    'UPDATE lojistas SET configuracao_pagina = CAST(:json AS jsonb) WHERE id = :lojistaId',
    {
      replacements: { json: JSON.stringify(configuracao), lojistaId },
    },
  );
}
