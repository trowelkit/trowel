import type { QueuedNotificationMessage } from '@trowelkit/notifications';
import { defineQueue } from 'void';
import { notifier } from '../src/notifications';

export default defineQueue<QueuedNotificationMessage>(notifier.consume);
