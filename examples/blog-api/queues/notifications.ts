import type { QueuedNotificationMessage } from '@trowelkit/notifications';
import { defineQueue } from 'void';
import { notifier } from '../src/notifier';

export default defineQueue<QueuedNotificationMessage>(notifier.consume);
