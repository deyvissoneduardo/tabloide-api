// Na primeira execução após mudanças, o ts-jest recompila e checa tipos em todos os workers;
// testes com trabalho de CPU real (argon2, QR Code, sharp) precisam de folga além dos 5 s padrão.
jest.setTimeout(15_000);
