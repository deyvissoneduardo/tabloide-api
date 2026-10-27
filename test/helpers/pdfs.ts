import { PDFDocument } from 'pdf-lib';

/** PDFs gerados em tempo de teste (nenhum binário no repositório), como imagens.ts. */
async function comPaginas(n: number, largura = 595, altura = 842): Promise<Buffer> {
  const documento = await PDFDocument.create();
  for (let i = 0; i < n; i += 1) documento.addPage([largura, altura]);
  // sem object streams: trailer clássico, que o "protegido" edita
  return Buffer.from(await documento.save({ useObjectStreams: false, addDefaultPage: false }));
}

export const pdfs = {
  umaPagina: (largura = 595, altura = 842) => comPaginas(1, largura, altura),
  paginas: (n: number) => comPaginas(n),
  semPaginas: () => comPaginas(0),
  /** Trailer com /Encrypt: o pdf-lib recusa com EncryptedPDFError. */
  protegido: async () => {
    const texto = (await comPaginas(1)).toString('latin1');
    return Buffer.from(
      texto.replace('trailer\n<<', 'trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 >>'),
      'latin1',
    );
  },
  corrompido: () => Buffer.from('%PDF-1.7\nlixo'),
  /** 1 página com um comentário de preenchimento antes do %%EOF até o tamanho pedido. */
  comTamanho: async (bytes: number) => {
    const base = await comPaginas(1);
    const falta = Math.max(0, bytes - base.length - 2);
    return Buffer.concat([base, Buffer.from('\n%'), Buffer.alloc(falta, 0x20)]);
  },
};
