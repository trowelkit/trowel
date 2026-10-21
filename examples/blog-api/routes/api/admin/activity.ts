import { activity } from '@schema';
import { defineHandler } from 'void';
import { db, desc } from 'void/db';
import { gate } from '../../../src/gate';

export const GET = defineHandler(gate.middleware('viewStats'), async () => {
  return db.select().from(activity).orderBy(desc(activity.id));
});
