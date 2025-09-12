import { Router } from 'express';
import health from './health';
import media from './media';
import messages from './messages';

const routes = Router();
routes.use('/health', health);
routes.use('/media', media);
routes.use('/messages', messages);

export default routes;

