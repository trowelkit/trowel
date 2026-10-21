import type { QueuedEventMessage } from '@trowelkit/events';
import { defineQueue } from 'void';
import { events } from '../src/events';

export default defineQueue<QueuedEventMessage>(events.consume);
