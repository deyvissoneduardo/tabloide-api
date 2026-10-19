import { CodigoErro } from '../../../common/errors/codigos-erro';
import type { VerificadorLimites } from '../../../common/limites/verificador-limites';
import { montarCaminho } from '../domain/caminho-midia';
import type { ImagemProcessada } from '../domain/imagem-processada';
import type { ImageProcessor } from '../services/image-processor.service';
import { MidiaService } from '../services/midia.service';
import type { StoragePort } from '../storage/storage.port';

describe('Funcionalidade: Caminho imutável de mídia', () => {
  describe('Cenário: formato do caminho', () => {
    it('Então tenant/perfil/uuid.webp', () =>
      expect(montarCaminho('t1', 'panfleto')).toMatch(/^t1\/panfleto\/[0-9a-f-]{36}\.webp$/));
  });

  describe('Cenário: caminhos nunca se repetem', () => {
    it('Então 1000 caminhos distintos', () =>
      expect(new Set(Array.from({ length: 1000 }, () => montarCaminho('t1', 'logo'))).size).toBe(1000));
  });
});

describe('Funcionalidade: MidiaService', () => {
  const processor = { processar: jest.fn() };
  const storage = { salvar: jest.fn(), urlPublica: jest.fn((c: string) => `https://cdn/${c}`) };
  const limites = { maxImagemBytes: jest.fn() };
  const service = new MidiaService(
    processor as unknown as ImageProcessor,
    storage as StoragePort,
    limites as unknown as VerificadorLimites,
  );
  const imagem: ImagemProcessada = {
    conteudo: Buffer.from('w'),
    largura: 1,
    altura: 1,
    contentType: 'image/webp',
    bytes: 1,
  };

  beforeEach(() => jest.clearAllMocks());

  describe('Cenário: salvar delega ao StoragePort e devolve o caminho', () => {
    it('Então salva no caminho do tenant e perfil e devolve o mesmo caminho', async () => {
      const caminho = await service.salvar('t1', 'logo', imagem);
      expect(caminho).toMatch(/^t1\/logo\/.+\.webp$/);
      expect(storage.salvar).toHaveBeenCalledWith(imagem.conteudo, caminho, 'image/webp');
    });
  });

  describe('Cenário: URL pública', () => {
    it('Então delega ao storage, e null para caminho nulo', () => {
      expect(service.urlPublica('a.webp')).toBe('https://cdn/a.webp');
      expect(service.urlPublica(null)).toBeNull();
    });
  });

  describe('Cenário: imagem acima do limite do lojista (RNF12)', () => {
    it('Então IMAGEM_MUITO_GRANDE com maxBytes e o processador não é chamado', async () => {
      limites.maxImagemBytes.mockResolvedValue(2_000_000);
      await expect(service.processar('t1', Buffer.alloc(2_500_000), 'panfleto')).rejects.toMatchObject({
        codigo: CodigoErro.IMAGEM_MUITO_GRANDE,
        detalhes: { maxBytes: 2_000_000 },
      });
      expect(limites.maxImagemBytes).toHaveBeenCalledWith('t1');
      expect(processor.processar).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: imagem dentro do limite do lojista', () => {
    it('Então o processador recebe o buffer e o perfil', async () => {
      limites.maxImagemBytes.mockResolvedValue(2_000_000);
      processor.processar.mockResolvedValue(imagem);
      const buffer = Buffer.alloc(1_500_000);
      await expect(service.processar('t1', buffer, 'panfleto')).resolves.toBe(imagem);
      expect(processor.processar).toHaveBeenCalledWith(buffer, 'panfleto');
    });
  });
});
