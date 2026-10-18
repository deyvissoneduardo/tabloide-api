import { Op } from 'sequelize';
import { Column, DataType, Model, PrimaryKey, Sequelize, Table } from 'sequelize-typescript';
import { exigeTenantNoWhere, registrarHooksDeTenant, TenantScopeViolationError } from '../tenant-scope.hooks';
import { TenantScoped } from '../tenant-scoped.decorator';

@TenantScoped()
@Table({ tableName: 'modelos_ficticios', paranoid: true })
class ModeloFicticio extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.UUID)
  declare tenantId: string;

  @Column(DataType.STRING)
  declare nome: string;
}

@Table({ tableName: 'modelos_livres' })
class ModeloLivre extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.STRING)
  declare email: string;
}

describe('Funcionalidade: Trava de tenant no ORM (RN07, RNF04)', () => {
  describe('Funcionalidade: exigeTenantNoWhere', () => {
    it.each<[string, unknown]>([
      ['tenantId string', { id: 'x', tenantId: 't1' }],
      ['tenant_id string', { tenant_id: 't1' }],
      ['Op.eq', { tenantId: { [Op.eq]: 't1' } }],
      ['Op.in com um valor', { tenantId: { [Op.in]: ['t1'] } }],
      ['dentro de Op.and (lista)', { [Op.and]: [{ tenantId: 't1' }, { nome: 'a' }] }],
      ['dentro de Op.and (objeto)', { [Op.and]: { tenantId: 't1' } }],
    ])('Cenário: where com %s → true', (_nome, where) => expect(exigeTenantNoWhere(where)).toBe(true));

    it.each<[string, unknown]>([
      ['ausente', undefined],
      ['nulo', { tenantId: null }],
      ['indefinido', { tenantId: undefined }],
      ['vazio', { tenantId: '' }],
      ['só em Op.or', { [Op.or]: [{ tenantId: 't1' }, { id: 'x' }] }],
      ['Op.in com vários valores', { tenantId: { [Op.in]: ['t1', 't2'] } }],
      ['Op.eq vazio', { tenantId: { [Op.eq]: '' } }],
      ['Op.ne', { tenantId: { [Op.ne]: 't1' } }],
      ['Op.and sem tenant', { [Op.and]: [{ nome: 'a' }] }],
      ['array', [{ tenantId: 't1' }]],
    ])('Cenário: where %s → false', (_nome, where) => expect(exigeTenantNoWhere(where)).toBe(false));
  });

  describe('Funcionalidade: hooks registrados', () => {
    const sequelize = new Sequelize({
      dialect: 'postgres',
      models: [ModeloFicticio, ModeloLivre],
      logging: false,
    });
    registrarHooksDeTenant(sequelize);
    let query: jest.SpyInstance;

    beforeEach(() => {
      query = jest.spyOn(sequelize, 'query').mockResolvedValue([] as never);
    });
    afterEach(() => query.mockRestore());
    afterAll(() => sequelize.close());

    describe('Cenário: hook bloqueia findAll sem tenant', () => {
      it('Então lança TenantScopeViolationError antes de consultar o banco', async () => {
        await expect(ModeloFicticio.findAll({ where: { id: 'x' } })).rejects.toBeInstanceOf(
          TenantScopeViolationError,
        );
        expect(query).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: findByPk também é bloqueado', () => {
      it('Então lança TenantScopeViolationError', () =>
        expect(ModeloFicticio.findByPk('x')).rejects.toBeInstanceOf(TenantScopeViolationError));
    });

    describe('Cenário: hook libera findAll com tenant', () => {
      it('Então a consulta segue', async () => {
        await ModeloFicticio.findAll({ where: { tenantId: 't1' } });
        expect(query).toHaveBeenCalled();
      });
    });

    describe('Cenário: skipTenantScope explícito', () => {
      it('Então a consulta segue', async () => {
        await ModeloFicticio.findAll({ where: { id: 'x' }, skipTenantScope: true });
        expect(query).toHaveBeenCalled();
      });
    });

    describe('Cenário: count, bulk update, bulk destroy e bulk restore sem tenant', () => {
      it.each([
        ['count', () => ModeloFicticio.count({ where: { id: 'x' } })],
        ['update', () => ModeloFicticio.update({ nome: 'n' }, { where: { id: 'x' } })],
        ['destroy', () => ModeloFicticio.destroy({ where: { id: 'x' } })],
        ['restore', () => ModeloFicticio.restore({ where: { id: 'x' } })],
      ])('Então %s lança TenantScopeViolationError', async (_nome, chamar) => {
        await expect(chamar()).rejects.toBeInstanceOf(TenantScopeViolationError);
        expect(query).not.toHaveBeenCalled();
      });
    });

    describe('Cenário: bulk update com tenant', () => {
      it('Então segue', async () => {
        await ModeloFicticio.update({ nome: 'n' }, { where: { id: 'x', tenantId: 't1' } });
        expect(query).toHaveBeenCalled();
      });
    });

    describe('Cenário: modelo não marcado não é afetado', () => {
      it('Então findOne por e-mail segue', async () => {
        await ModeloLivre.findOne({ where: { email: 'a@x.com' } });
        expect(query).toHaveBeenCalled();
      });
    });

    describe('Cenário: save de instância existente sem tenantId', () => {
      it('Então lança TenantScopeViolationError', async () => {
        const instancia = ModeloFicticio.build({ id: 'x', tenantId: '', nome: 'a' }, { isNewRecord: false });
        instancia.nome = 'b';
        await expect(instancia.save()).rejects.toBeInstanceOf(TenantScopeViolationError);
      });
    });

    describe('Cenário: destroy de instância sem tenantId', () => {
      it('Então lança TenantScopeViolationError', async () => {
        const instancia = ModeloFicticio.build({ id: 'x', nome: 'a' }, { isNewRecord: false });
        await expect(instancia.destroy()).rejects.toBeInstanceOf(TenantScopeViolationError);
      });
    });

    describe('Cenário: instância nova sem tenantId não é barrada pela trava', () => {
      it('Então o insert segue (o NOT NULL do banco garante o tenant)', async () => {
        query.mockResolvedValue([[{ id: 'x' }], 1] as never);
        await ModeloFicticio.build({ id: 'x', nome: 'a' })
          .save()
          .catch(() => undefined);
        expect(query).toHaveBeenCalled();
      });
    });
  });
});
