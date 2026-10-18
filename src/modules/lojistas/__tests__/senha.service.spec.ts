import { SenhaService } from '../services/senha.service';

describe('Funcionalidade: Hash de senha', () => {
  const service = new SenhaService();

  describe('Cenário: gerar e verificar', () => {
    it('Então verificar devolve true e o hash é argon2id', async () => {
      const hash = await service.gerarHash('senhaForte1');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      await expect(service.verificar(hash, 'senhaForte1')).resolves.toBe(true);
    });
  });

  describe('Cenário: senha errada', () => {
    it('Então devolve false', async () => {
      const hash = await service.gerarHash('senhaForte1');
      await expect(service.verificar(hash, 'senhaForte2')).resolves.toBe(false);
    });
  });

  describe('Cenário: hashes diferentes para a mesma senha', () => {
    it('Então o salt muda o hash', async () => {
      expect(await service.gerarHash('senhaForte1')).not.toBe(await service.gerarHash('senhaForte1'));
    });
  });

  describe('Cenário: hash malformado', () => {
    it('Então devolve false sem lançar', () =>
      expect(service.verificar('nao-e-um-hash', 'x')).resolves.toBe(false));
  });
});
