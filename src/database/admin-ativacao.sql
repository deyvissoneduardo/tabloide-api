-- Comandos de referência do administrador (RN03). A aplicação não executa este arquivo.
-- A mudança leva até TENANT_STATUS_CACHE_TTL_MS (padrão 30 s) para valer no painel.

-- Lojistas aguardando ativação, mais antigos primeiro
SELECT l.id, l.nome_fantasia, l.email, l.whatsapp, l.created_at
FROM lojistas l JOIN lojista_ativacoes a ON a.lojista_id = l.id
WHERE a.status = 'AGUARDANDO_ATIVACAO'
ORDER BY l.created_at;

-- Ativar
UPDATE lojista_ativacoes SET status = 'ATIVO', observacao = '...' WHERE lojista_id = '<uuid>';

-- Desativar (painel só leitura, página pública fora do ar)
UPDATE lojista_ativacoes SET status = 'DESATIVADO', observacao = '...' WHERE lojista_id = '<uuid>';
