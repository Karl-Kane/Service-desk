import { describe, expect, it } from 'vitest';
import {
  allowedTargets,
  canTransition,
  isValidTransition,
  ROLES,
  TICKET_STATUSES,
  type Role,
  type TicketStatus,
} from '../../src/domain/ticket-status.js';

/**
 * Эталонная таблица, записанная НЕЗАВИСИМО от реализации (а не скопированная из неё):
 * "from → to: кому разрешено". Всё, чего нет в таблице, запрещено всем.
 * Тест перебирает ВСЕ 6×6×3 = 108 комбинаций, поэтому новое случайное ребро в графе не пройдёт незамеченным.
 */
const EXPECTED: Record<string, Role[]> = {
  'new→in_progress': ['agent', 'admin'],
  'in_progress→waiting': ['agent', 'admin'],
  'in_progress→resolved': ['agent', 'admin'],
  'waiting→in_progress': ['agent', 'admin'],
  'waiting→resolved': ['agent', 'admin'],
  'resolved→closed': ['client', 'agent', 'admin'],
  'resolved→reopened': ['client', 'agent', 'admin'],
  'reopened→in_progress': ['agent', 'admin'],
};

const cases: Array<[TicketStatus, TicketStatus, Role, boolean]> = [];
for (const from of TICKET_STATUSES) {
  for (const to of TICKET_STATUSES) {
    for (const role of ROLES) {
      cases.push([from, to, role, EXPECTED[`${from}→${to}`]?.includes(role) ?? false]);
    }
  }
}

describe('canTransition(from, to, role)', () => {
  it('covers all pairs', () => {
    expect(cases).toHaveLength(108);
  });

  it.each(cases)('%s → %s by %s = %s', (from, to, role, expected) => {
    expect(canTransition(from, to, role)).toBe(expected);
  });
});

describe('isValidTransition(from, to)', () => {
  it.each(TICKET_STATUSES.flatMap((from) => TICKET_STATUSES.map((to) => [from, to] as const)))(
    '%s → %s',
    (from, to) => {
      expect(isValidTransition(from, to)).toBe(`${from}→${to}` in EXPECTED);
    },
  );

  it('never allows staying in the same status', () => {
    for (const s of TICKET_STATUSES) expect(isValidTransition(s, s)).toBe(false);
  });

  it('closed is terminal', () => {
    for (const to of TICKET_STATUSES) expect(isValidTransition('closed', to)).toBe(false);
  });
});

describe('allowedTargets', () => {
  it('agent on a new ticket can only take it', () => {
    expect(allowedTargets('new', 'agent')).toEqual(['in_progress']);
  });
  it('client on a resolved ticket can close or reopen', () => {
    expect(allowedTargets('resolved', 'client')).toEqual(['closed', 'reopened']);
  });
  it('client can do nothing with an in-progress ticket', () => {
    expect(allowedTargets('in_progress', 'client')).toEqual([]);
  });
});
