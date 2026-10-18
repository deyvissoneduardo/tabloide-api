import { Column, DataType, Model, PrimaryKey, Sequelize, Table } from 'sequelize-typescript';
import { registrarHooksDeTenant, TenantScopeViolationError } from '../../src/database/tenant-scope.hooks';
import { TenantScoped } from '../../src/database/tenant-scoped.decorator';
import { encerrarBanco, iniciarBanco, type BancoDeTeste } from '../helpers/banco-de-teste';

@TenantScoped()
@Table({ tableName: 'notas_de_teste', timestamps: false })
class NotaDeTeste extends Model {
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare id: number;

  @Column(DataType.TEXT)
  declare tenantId: string;

  @Column(DataType.TEXT)
  declare texto: string;
}

describe('Funcionalidade: Trava de tenant contra um Postgres real (RNF04)', () => {
  let banco: BancoDeTeste;
  let sequelize: Sequelize;
  const consultas: string[] = [];

  beforeAll(async () => {
    banco = await iniciarBanco();
    await banco.sequelize.query(`
      CREATE TABLE notas_de_teste (id int PRIMARY KEY, tenant_id text NOT NULL, texto text NOT NULL);
      INSERT INTO notas_de_teste VALUES (1, 'A', 'nota de A'), (2, 'B', 'nota de B');
    `);
    sequelize = new Sequelize(banco.url, {
      models: [NotaDeTeste],
      define: { underscored: true },
      logging: (sql) => consultas.push(sql),
    });
    registrarHooksDeTenant(sequelize);
  });
  beforeEach(() => {
    consultas.length = 0;
  });
  afterAll(async () => {
    await sequelize?.close();
    await encerrarBanco(banco);
  });

  describe('Cenário: consulta sem tenantId', () => {
    it('Então lança antes de chegar ao banco', async () => {
      await expect(NotaDeTeste.findAll({ where: { id: 2 } })).rejects.toBeInstanceOf(
        TenantScopeViolationError,
      );
      expect(consultas).toEqual([]);
    });
  });

  describe('Cenário: consulta com tenantId', () => {
    it('Então devolve só as linhas do tenant', async () => {
      const notas = await NotaDeTeste.findAll({ where: { tenantId: 'A' } });
      expect(notas.map((n) => n.texto)).toEqual(['nota de A']);
    });

    it('E buscar o id de outro tenant não encontra nada', async () => {
      await expect(NotaDeTeste.findOne({ where: { id: 2, tenantId: 'A' } })).resolves.toBeNull();
    });
  });

  describe('Cenário: skipTenantScope', () => {
    it('Então a consulta segue e vê todos os tenants', async () => {
      await expect(NotaDeTeste.count({ skipTenantScope: true })).resolves.toBe(2);
    });
  });
});
