import { defineGate } from '@trowelkit/policies/void';
import post from './policies/post';

// Checks run against the signed-in user of the current request (Void's getUser()).
export const gate = defineGate({
  policies: { post },
});
