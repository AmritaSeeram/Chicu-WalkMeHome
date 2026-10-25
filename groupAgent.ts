import type { Incident, LastKnownPoint, OwnerSettings, Student, StudentId } from '../core/models.ts';
import type { Config } from '../core/config.ts';
import { newIncident, nextAction, reduce, type Action, type Event } from '../core/ladder.ts';
import { assertGroupSafe, renderGroupMessage, type GroupMessage } from '../core/messages.ts';
import { isTrackable } from '../core/sharing.ts';
import type { AgentNetwork } from './personalAgent.ts';

export interface Button { label: string; data: string }
export interface Dm { kind: 'ping' | 'ask' | 'plan_prompt' | 'info'; text: string; buttons?: Button[] }
export interface Platform { sendGroup(text: string): Promise<void>; dm(id: StudentId, dm: Dm): Promise<void> }

export interface GroupDeps {
  cfg: Config; platform: Platform; net: AgentNetwork;
  students: () => Student[]; settings: (id: StudentId) => OwnerSettings | undefined;
  polish?: (m: GroupMessage, text: string) => Promise<string>;   // optional LLM wording
  privateTokens?: () => string[];                                // extra strings that must never reach the group
}

const fmtTime = (ms: number, tz: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(ms);

export class GroupAgent {
  d: GroupDeps; incidents = new Map<string, Incident>();
  meta = new Map<string, { point: LastKnownPoint; since: number }>();
  history: Record<StudentId, number> = {};
  constructor(d: GroupDeps) { this.d = d; }

  name(id: StudentId) { return this.d.students().find(s => s.id === id)?.name ?? 'Someone'; }
  active() { return [...this.incidents.values()].filter(i => i.resolvedAt === undefined); }
  private set(inc: Incident, ev: Event, now: number) { const n = reduce(inc, ev, now); this.incidents.set(n.id, n); return n; }

  /** Everything bound for the group goes through here: render, optional LLM polish, leak check, send. */
  async post(m: GroupMessage) {
    const base = renderGroupMessage(m, this.d.cfg), tokens = this.d.privateTokens?.() ?? [];
    let text = base;
    if (this.d.polish) { try { text = await this.d.polish(m, base); } catch { text = base; } }
    if (!assertGroupSafe(m, text, tokens).ok) text = base;
    const check = assertGroupSafe(m, text, tokens);
    if (!check.ok) throw new Error(`blocked group message: ${check.reasons.join(', ')}`);
    await this.d.platform.sendGroup(text);
  }

  /** Called when a check-in time passes or a routine breaks. Needs opt-in and not paused. */
  async startCheck(missingId: StudentId, now: number, since = now): Promise<Incident | null> {
    if (!isTrackable(this.d.settings(missingId), now)) return null;
    const existing = this.active().find(i => i.missingId === missingId);
    if (existing) return existing;
    const r = this.d.net.send('group', missingId, { kind: 'last_point' });
    if (!r.ok || !r.point) return null;   // no shared location, nothing to alert about
    const inc = newIncident(`${missingId}-${now}`, missingId, now, this.history);
    this.incidents.set(inc.id, inc); this.meta.set(inc.id, { point: r.point, since });
    await this.d.platform.dm(missingId, { kind: 'ping', text: 'You good?', buttons: [{ label: "I'm good", data: `ok:${inc.id}` }] });
    return inc;
  }

  async tick(now: number) {
    for (const start of this.active()) {
      for (let i = 0; i < 6; i++) {
        const inc = this.incidents.get(start.id)!;
        const a = nextAction(inc, this.d.students(), this.d.cfg, now);
        if (a.type === 'wait') break;
        await this.exec(inc, a, now);
      }
    }
  }

  private async exec(inc: Incident, a: Action, now: number) {
    const m = this.meta.get(inc.id)!, missing = this.name(inc.missingId);
    switch (a.type) {
      case 'ping':
        await this.d.platform.dm(inc.missingId, { kind: 'ping', text: "Checking in again. You good?", buttons: [{ label: "I'm good", data: `ok:${inc.id}` }] });
        this.set(inc, { type: 'ping_sent' }, now); break;
      case 'post_alert': {
        await this.post({ type: 'alert', name: missing, lastSeenTime: fmtTime(m.since, this.d.cfg.timezone), lastSeenLabel: m.point.label });
        this.set(inc, { type: 'alert_posted' }, now);
        for (const f of this.d.students().filter(s => s.id !== inc.missingId)) { // relay to each personal agent
          const r = this.d.net.send('group', f.id, { kind: 'alert', missingId: inc.missingId, missingName: missing, point: m.point, now });
          if (r.info) await this.d.platform.dm(f.id, { kind: 'info', text: r.info });
          if (r.prompt) await this.d.platform.dm(f.id, { kind: 'plan_prompt', text: r.prompt.text,
            buttons: [{ label: 'Yes, tell the group', data: `exp:${inc.id}` }, { label: 'No', data: `noexp:${inc.id}` }] });
        }
        break;
      }
      case 'post_police_link':
        await this.post({ type: 'police_link', name: missing });
        this.set(inc, { type: 'police_link_posted' }, now); break;
      case 'poll': {
        const reports = this.d.students().filter(s => s.id !== inc.missingId)
          .map(s => this.d.net.send('group', s.id, { kind: 'poll', point: m.point, now }).report!).filter(Boolean);
        this.set(inc, { type: 'polled', reports }, now); break;
      }
      case 'ask': {
        const text = a.mode === 'go' ? `You're closest, about ${a.etaMinutes} min away. Can you go to ${m.point.label}?`
          : a.mode === 'standby' ? `Can you be on standby with your car for ${missing}?` : `Can you call ${missing}?`;
        await this.d.platform.dm(a.studentId, { kind: 'ask', text, buttons: [{ label: 'Yes', data: `yes:${inc.id}` }, { label: 'No', data: `no:${inc.id}` }] });
        this.history[a.studentId] = now;
        this.set(inc, { type: 'asked', studentId: a.studentId, mode: a.mode }, now); break;
      }
      case 'expire_ask': this.set(inc, { type: 'expired', studentId: a.studentId }, now); break;
    }
  }

  async onAnswer(incId: string, studentId: StudentId, yes: boolean, now: number) {
    const inc = this.incidents.get(incId);
    if (!inc || inc.resolvedAt !== undefined || !inc.askLog.some(a => a.studentId === studentId && a.result === 'pending')) return;
    const n = this.set(inc, { type: 'answered', studentId, yes }, now);
    if (yes) await this.post({ type: 'outcome', lines: this.lines(n) });
    await this.tick(now);
  }

  private lines(inc: Incident) {
    const place = this.meta.get(inc.id)!.point.label;
    return inc.askLog.filter(a => a.result === 'yes').map(a => ({
      kind: a.mode === 'go' ? 'heading' as const : a.mode === 'call' ? 'calling' as const : 'standby' as const, name: this.name(a.studentId), place }));
  }

  /** A friend confirmed a plan they hold. The agent decides whether any detail may be shown. */
  async onExpected(incId: string, byId: StudentId, now: number) {
    const inc = this.incidents.get(incId);
    if (!inc || inc.resolvedAt !== undefined) return;
    const r = this.d.net.send('group', byId, { kind: 'confirm_expected', missingId: inc.missingId, now });
    if (!r.ok) return;
    this.set(inc, { type: 'expected', by: byId }, now);
    await this.post({ type: 'expected', byName: this.name(byId), detail: r.expected?.detail });
  }

  async onCheckIn(missingId: StudentId, now: number) {
    for (const inc of this.active().filter(i => i.missingId === missingId)) {
      const alerted = inc.alertedAt !== undefined;
      this.set(inc, { type: 'checked_in' }, now);
      if (alerted) await this.post({ type: 'checked_in', name: this.name(missingId) });
    }
  }
}
