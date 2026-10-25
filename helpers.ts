import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/core/config.ts';
export const cfg = loadConfig(JSON.parse(readFileSync(new URL('../config/default.json', import.meta.url), 'utf8')));
export const MIN = 60_000;
import type { Student, AgentReport } from '../src/core/models.ts';
export const students: Student[] = [
  { id: 'maya', name: 'Maya', hasCar: false }, { id: 'priya', name: 'Priya', hasCar: false },
  { id: 'sam', name: 'Sam', hasCar: true }, { id: 'alex', name: 'Alex', hasCar: false },
];
export const rep = (studentId: string, etaMinutes: number, available = true): AgentReport => ({ studentId, etaMinutes, available });
