import type { Request } from 'express';
import type { StatusLojista } from '../../modules/lojistas/models/status-lojista';

export interface RequestAutenticado extends Request {
  user?: { tenantId: string };
  statusLojista?: StatusLojista;
}
