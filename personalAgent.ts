import type { AgentReport, LastKnownPoint, Plan, Student, StudentId } from '../core/models.ts';
import type { Config } from '../core/config.ts';
import { activePlansFor, groupDetail, toReport } from '../core/sharing.ts';

/** Never leaves this object. */
export interface PrivateContext {
  location?: { lat: number; lng: number; at: number };
  asleep: boolean; busyUntil?: number; busyReason?: string;
  sharedPlans: Plan[];            // plans OTHER friends chose to share with this student
}

export type AgentRequest =
  | { kind: 'last_point' }
  | { kind: 'poll'; point: LastKnownPoint; now: number }
  | { kind: 'alert'; missingId: StudentId; missingName: string; point: LastKnownPoint; now: number }
  | { kind: 'confirm_expected'; missingId: StudentId; now: number };

export interface AgentResponse {
  ok: boolean; error?: 'refused' | 'no_plan';
  point?: LastKnownPoint; report?: AgentReport;
  info?: string; prompt?: { text: string };
  expected?: { detail?: string };
}
const REFUSED: AgentResponse = { ok: false, error: 'refused' };

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export class PersonalAgent {
  student: Student; ctx: PrivateContext; cfg: Config; label: (lat: number, lng: number) => string;
  constructor(student: Student, ctx: PrivateContext, cfg: Config, label: (lat: number, lng: number) => string = () => 'their last known spot') {
    this.student = student; this.ctx = ctx; this.cfg = cfg; this.label = label;
  }

  private availableAt(now: number) { return !this.ctx.asleep && !(this.ctx.busyUntil !== undefined && now < this.ctx.busyUntil); }
  private meters(p: LastKnownPoint) { return this.ctx.location ? distanceMeters(this.ctx.location, p) : undefined; }

  /** Single entry point. Only the group agent may call it; anything else is refused. */
  handle(from: string, req: AgentRequest): AgentResponse {
    if (from !== 'group') return REFUSED;
    switch (req.kind) {
      case 'last_point': {
        const l = this.ctx.location;
        return l ? { ok: true, point: { label: this.label(l.lat, l.lng), lat: l.lat, lng: l.lng, at: l.at } } : { ok: true };
      }
      case 'poll': // distance/ETA + available yes/no. Nothing else, ever.
        return { ok: true, report: toReport(this.student.id, this.meters(req.point), this.cfg.walkMetersPerMin, this.availableAt(req.now)) };
      case 'alert': {
        const m = this.meters(req.point);
        const plan = activePlansFor(this.ctx.sharedPlans, this.student.id, req.missingId, req.now)[0];
        const info = m === undefined ? undefined : `${req.missingName} hasn't checked in. You're about ${Math.ceil(m / this.cfg.walkMetersPerMin)} min from where they were last seen.`;
        const prompt = plan ? { text: `${req.missingName} told you about ${plan.detail ? `"${plan.detail}"` : 'a plan'} for now, so this may be normal. Tell the group it's expected?` } : undefined;
        return { ok: true, info, prompt };
      }
      case 'confirm_expected': {
        const plan = activePlansFor(this.ctx.sharedPlans, this.student.id, req.missingId, req.now)[0];
        return plan ? { ok: true, expected: { detail: groupDetail(plan) } } : { ok: false, error: 'no_plan' };
      }
      default: return REFUSED;
    }
  }
}

/** Agents cannot talk to each other. Every request goes through here and is stamped with its sender. */
export class AgentNetwork {
  agents = new Map<StudentId, PersonalAgent>();
  add(a: PersonalAgent) { this.agents.set(a.student.id, a); }
  send(from: string, to: StudentId, req: AgentRequest): AgentResponse {
    const a = this.agents.get(to);
    return a ? a.handle(from, req) : REFUSED;
  }
}
