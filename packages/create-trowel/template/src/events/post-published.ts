import { defineEvent } from '@trowelkit/events';
import type { Recipient } from '../notifications/post-published';

export const PostPublished = defineEvent<{ id: number; title: string; author: Recipient }>('post.published');
